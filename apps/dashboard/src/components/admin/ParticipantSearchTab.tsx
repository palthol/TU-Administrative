import { useState } from 'react';
import { adminFetch } from '@/lib/admin-api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AdminTabProps, Field, StatusMessage } from './common';

type ParticipantSearchRow = {
  participant_id: string;
  full_name: string;
  email?: string | null;
  cell_phone?: string | null;
  home_phone?: string | null;
  account_count: number;
  preferred_account_id?: string | null;
  accounts?: {
    account_id: string;
    role?: string | null;
    account_status?: string | null;
    account_primary_contact_name?: string | null;
  }[];
};

export function ParticipantSearchTab({ apiBase, adminKey, requireKey }: AdminTabProps) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<ParticipantSearchRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [variant, setVariant] = useState<'ok' | 'err'>('ok');
  const [loading, setLoading] = useState(false);

  async function onSearch() {
    const k = requireKey();
    if (k) {
      setVariant('err');
      setMsg(k);
      setRows([]);
      return;
    }
    const query = q.trim();
    if (query.length < 2) {
      setVariant('err');
      setMsg('Query must be at least 2 characters.');
      setRows([]);
      return;
    }
    setLoading(true);
    setMsg(null);
    const { ok, status, data } = await adminFetch<{ rows?: ParticipantSearchRow[]; error?: string }>(
      apiBase,
      adminKey,
      `/api/admin/participants/search?q=${encodeURIComponent(query)}&limit=8`,
    );
    setLoading(false);
    if (!ok) {
      setVariant('err');
      setMsg(`Error ${status}: ${data.error ?? JSON.stringify(data)}`);
      setRows([]);
      return;
    }
    const results = Array.isArray(data.rows) ? data.rows : [];
    setRows(results);
    setVariant('ok');
    setMsg(results.length === 0 ? 'No matches.' : `Found ${results.length} participant(s).`);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Participant search</CardTitle>
        <CardDescription>GET /api/admin/participants/search — name, email, or phone lookup with linked accounts.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Field id="ps-q" label="Search">
            <Input id="ps-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jane, email, or phone" />
          </Field>
          <div className="flex items-end">
            <Button type="button" onClick={() => void onSearch()} disabled={loading}>
              {loading ? 'Searching…' : 'Search'}
            </Button>
          </div>
        </div>
        <StatusMessage message={msg} variant={variant} />
        {rows.length > 0 && (
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.participant_id} className="rounded-md border border-border p-3 text-sm">
                <p className="font-medium">{row.full_name}</p>
                <p className="font-mono text-xs text-muted-foreground">participant_id: {row.participant_id}</p>
                <p className="text-xs text-muted-foreground">
                  {row.email || row.cell_phone || row.home_phone || 'No contact'} · accounts: {row.account_count}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  preferred_account_id: {row.preferred_account_id ?? 'none'}
                </p>
                {row.accounts && row.accounts.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {row.accounts.map((a) => (
                      <li key={a.account_id} className="font-mono">
                        {a.account_id} · {a.role ?? 'role?'} · {a.account_status ?? 'status?'}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
