import { useEffect, useRef, useState } from 'react';
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
  onPersonChosen,
  autoFocus = false,
}: {
  connection: Connection;
  issuedBy: string;
  selected: { memberName: string; accountId: string | null } | null;
  onSelect: (row: ParticipantSearchRow) => void;
  onExternal: (accountId: string, displayName: string) => void;
  /** Called after Use / external so the parent can move focus (e.g. to Amount). */
  onPersonChosen?: () => void;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<ParticipantSearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [searched, setSearched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const query = q.trim();
    abortRef.current?.abort();
    if (query.length < 2) {
      setRows([]);
      setLoading(false);
      setSearched(false);
      if (query.length === 1) {
        setErr(false);
        setMsg('Keep typing — 2 characters minimum.');
      } else {
        setMsg(null);
        setErr(false);
      }
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setMsg(null);
        setErr(false);
        const path = `/api/admin/participants/search?q=${encodeURIComponent(query)}&limit=8`;
        const { ok, status, data } = await adminFetch<{ rows?: ParticipantSearchRow[]; error?: string }>(
          connection.apiBase,
          connection.adminKey,
          path,
          { signal: controller.signal },
        );
        if (controller.signal.aborted || status === 0) return;
        setLoading(false);
        setSearched(true);
        if (!ok) {
          setRows([]);
          setErr(true);
          setMsg(operatorError(status, data));
          return;
        }
        const results = Array.isArray(data.rows) ? data.rows : [];
        setRows(results);
        setMsg(results.length === 0 ? 'No match — use external counterparty for a walk-in.' : null);
      })();
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [q, connection.apiBase, connection.adminKey]);

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
    setRows([]);
    setQ('');
    onExternal(data.account_id, name);
    onPersonChosen?.();
  }

  function choose(row: ParticipantSearchRow) {
    setRows([]);
    setQ('');
    setMsg(null);
    onSelect(row);
    onPersonChosen?.();
  }

  const showExternal = searched && rows.length === 0;

  return (
    <div className="lookup-box">
      <p className="section-label">Participant</p>
      <div className="search-field">
        <Input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type name, email, or phone"
          aria-label="Search participants"
          autoComplete="off"
        />
        {loading ? <span className="search-live muted text-sm">Searching…</span> : null}
      </div>
      {msg ? <p className={err ? 'error-inline' : 'muted text-sm'}>{msg}</p> : null}
      {rows.length > 0 ? (
        <div className="search-option-list" role="listbox" aria-label="Participant matches">
          {rows.map((row, index) => (
            <button
              key={row.participant_id}
              type="button"
              className={index === 0 ? 'person-result person-result-primary' : 'person-result'}
              onClick={() => choose(row)}
            >
              <strong>{row.full_name}</strong>
              <span>
                {row.email || row.cell_phone || row.home_phone || 'No contact on file'} · {row.account_count}{' '}
                account{row.account_count === 1 ? '' : 's'}
              </span>
              <span className="use-hint">{index === 0 ? 'Tap to use' : 'Use'}</span>
            </button>
          ))}
        </div>
      ) : null}
      {showExternal ? (
        <div className="lookup-fallback">
          <p className="muted text-sm">Walk-in / no match?</p>
          <Button type="button" className="fat-action" variant="secondary" onClick={() => void createExternal()} disabled={loading}>
            Use external counterparty
          </Button>
        </div>
      ) : null}
      {selected ? (
        <p className="muted text-sm">
          Selected: <strong>{selected.memberName}</strong>
          {selected.accountId ? ' · account linked' : ' · not linked to an account'}
        </p>
      ) : null}
    </div>
  );
}
