import { useState } from 'react';
import { adminFetch } from '@/lib/admin-api';
import { operatorError, type Connection, type ParticipantSearchRow } from '@/lib/finance';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ParticipantLookup({
  connection,
  issuedBy,
  selected,
  onSelect,
  onExternal,
}: {
  connection: Connection;
  issuedBy: string;
  selected: { memberName: string; accountId: string | null } | null;
  onSelect: (row: ParticipantSearchRow) => void;
  onExternal: (accountId: string, displayName: string) => void;
}) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<ParticipantSearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  async function onSearch() {
    const query = q.trim();
    if (query.length < 2) {
      setErr(true);
      setMsg('Type at least 2 characters to search.');
      setRows([]);
      return;
    }
    setLoading(true);
    setMsg(null);
    setErr(false);
    const path = `/api/admin/participants/search?q=${encodeURIComponent(query)}&limit=8`;
    const { ok, status, data } = await adminFetch<{ rows?: ParticipantSearchRow[]; error?: string }>(
      connection.apiBase,
      connection.adminKey,
      path,
    );
    setLoading(false);
    if (!ok) {
      setRows([]);
      setErr(true);
      setMsg(operatorError(status, data));
      return;
    }
    const results = Array.isArray(data.rows) ? data.rows : [];
    setRows(results);
    setMsg(results.length === 0 ? 'No match — use external counterparty if this is a walk-in.' : null);
  }

  async function createExternal() {
    const name = q.trim() || selected?.memberName || '';
    if (!name) {
      setErr(true);
      setMsg('Provide a name before creating an external counterparty.');
      return;
    }
    setLoading(true);
    const { ok, status, data } = await adminFetch<{ account_id?: string; error?: string }>(
      connection.apiBase,
      connection.adminKey,
      '/api/admin/billing/external-counterparty-accounts',
      {
        method: 'POST',
        json: {
          display_name: name,
          created_by: issuedBy.trim() || undefined,
          notes: 'Created from receipts participant lookup fallback',
        },
      },
    );
    setLoading(false);
    if (!ok || !data.account_id) {
      setErr(true);
      setMsg(operatorError(status, data));
      return;
    }
    setErr(false);
    setMsg('External counterparty linked for this entry.');
    onExternal(data.account_id, name);
  }

  return (
    <div className="lookup-box">
      <p className="section-label">Participant</p>
      <div className="search-field">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, or phone"
          aria-label="Search participants"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void onSearch();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={() => void onSearch()} disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </Button>
      </div>
      {msg ? <p className={err ? 'error-inline' : 'muted text-sm'}>{msg}</p> : null}
      {rows.length > 0 ? (
        <div className="search-option-list">
          {rows.map((row) => (
            <button
              key={row.participant_id}
              type="button"
              className="person-result"
              onClick={() => onSelect(row)}
            >
              <strong>{row.full_name}</strong>
              <span>
                {row.email || row.cell_phone || row.home_phone || 'No contact on file'} · {row.account_count}{' '}
                account{row.account_count === 1 ? '' : 's'}
              </span>
              <span>{row.preferred_account_id ? 'Preferred account linked' : 'No preferred account'}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="lookup-fallback">
        <p className="muted text-sm">No suitable participant?</p>
        <Button type="button" size="sm" variant="ghost" onClick={() => void createExternal()} disabled={loading}>
          Use external counterparty
        </Button>
      </div>
      {selected ? (
        <p className="muted text-sm">
          Selected: <strong>{selected.memberName}</strong>
          {selected.accountId ? ' · account linked' : ' · not linked to an account'}
        </p>
      ) : null}
    </div>
  );
}
