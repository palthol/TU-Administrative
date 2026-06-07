import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { adminFetch } from '@/lib/admin-api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AdminTabProps, Field, SimpleDataTable, StatusMessage } from './common';

export function WaiverTab({ apiBase, adminKey, requireKey }: AdminTabProps) {
  const [waiverId, setWaiverId] = useState('');
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);
  const [lookupVariant, setLookupVariant] = useState<'ok' | 'err'>('ok');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [links, setLinks] = useState<{ pdf?: string; sig?: string } | null>(null);

  const [listRows, setListRows] = useState<Record<string, unknown>[]>([]);
  const [listMsg, setListMsg] = useState<string | null>(null);
  const [listVariant, setListVariant] = useState<'ok' | 'err'>('ok');
  const [listLoading, setListLoading] = useState(false);

  const loadList = useCallback(async () => {
    const k = requireKey();
    if (k) {
      setListVariant('err');
      setListMsg(k);
      setListRows([]);
      return;
    }
    setListLoading(true);
    setListMsg(null);
    const { ok, status, data } = await adminFetch<{
      rows?: Record<string, unknown>[];
      rowCount?: number;
      error?: string;
    }>(apiBase, adminKey, '/api/admin/waivers?limit=50&offset=0');
    setListLoading(false);
    if (!ok) {
      setListVariant('err');
      setListMsg(`Error ${status}: ${data.error ?? JSON.stringify(data)}`);
      setListRows([]);
      return;
    }
    const next = Array.isArray(data.rows) ? data.rows : [];
    setListRows(next);
    setListVariant('ok');
    setListMsg(`Loaded ${data.rowCount ?? next.length} waiver row(s).`);
  }, [apiBase, adminKey, requireKey]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  async function onLookup(e: FormEvent) {
    e.preventDefault();
    const k = requireKey();
    if (k) {
      setLookupVariant('err');
      setLookupMsg(k);
      return;
    }
    if (!waiverId.trim()) {
      setLookupVariant('err');
      setLookupMsg('Waiver ID is required.');
      return;
    }
    setLookupLoading(true);
    setLookupMsg(null);
    setLinks(null);
    const { ok, status, data } = await adminFetch<{
      signatureUrl?: string;
      documentPdfUrl?: string;
      error?: string;
    }>(apiBase, adminKey, `/api/admin/waivers/${encodeURIComponent(waiverId.trim())}`);
    setLookupLoading(false);
    if (!ok) {
      setLookupVariant('err');
      setLookupMsg(`Error ${status}: ${data.error ?? JSON.stringify(data)}`);
      return;
    }
    setLookupVariant('ok');
    setLookupMsg('Signed URLs retrieved (short-lived).');
    setLinks({ pdf: data.documentPdfUrl, sig: data.signatureUrl });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Waiver list</h3>
            <p className="text-xs text-muted-foreground">GET /api/admin/waivers — click a row to load signed URLs.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadList()} disabled={listLoading}>
            {listLoading ? 'Loading…' : 'Refresh list'}
          </Button>
        </div>
        <StatusMessage message={listMsg} variant={listVariant} />
        {listRows.length > 0 && (
          <div className="rounded-lg border border-border bg-card shadow-sm">
            <div className="max-h-64 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b border-border bg-muted/95">
                  <tr>
                    {['participant_full_name', 'signed_at_utc', 'waiver_id'].map((c) => (
                      <th key={c} className="px-3 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {listRows.map((row) => {
                    const id = String(row.waiver_id ?? '');
                    return (
                      <tr
                        key={id}
                        className="cursor-pointer border-b border-border/50 hover:bg-muted/40"
                        onClick={() => setWaiverId(id)}
                      >
                        <td className="px-3 py-2 text-xs">{String(row.participant_full_name ?? '—')}</td>
                        <td className="px-3 py-2 text-xs font-mono">{String(row.signed_at_utc ?? '—')}</td>
                        <td className="px-3 py-2 text-xs font-mono truncate max-w-[12rem]" title={id}>
                          {id}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {listRows.length === 0 && !listLoading && <SimpleDataTable rows={[]} />}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Waiver signed URLs</CardTitle>
          <CardDescription>GET /api/admin/waivers/:id — PDF and signature links (5-minute expiry).</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onLookup} className="space-y-4">
            <Field id="wid" label="Waiver ID (UUID)">
              <Input id="wid" value={waiverId} onChange={(e) => setWaiverId(e.target.value)} />
            </Field>
            <Button type="submit" disabled={lookupLoading} variant="secondary">
              {lookupLoading ? 'Loading…' : 'Fetch signed URLs'}
            </Button>
          </form>
          <StatusMessage message={lookupMsg} variant={lookupVariant} />
          {links && (links.pdf || links.sig) && (
            <div className="mt-4 flex flex-col gap-2 text-sm">
              {links.pdf && (
                <a className="text-primary underline underline-offset-4" href={links.pdf} target="_blank" rel="noreferrer">
                  Open PDF
                </a>
              )}
              {links.sig && (
                <a className="text-primary underline underline-offset-4" href={links.sig} target="_blank" rel="noreferrer">
                  Open signature image
                </a>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
