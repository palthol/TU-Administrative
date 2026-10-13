import { useCallback, useEffect, useRef, useState } from 'react';
import { adminFetch } from '@/lib/admin-api';
import { operatorError, type Connection, type PersonalEntry } from '@/lib/finance';
import { formatUsdFromCents } from '@/lib/shareFormats';
import { Button } from '@/components/ui/button';
import { FinancePanel, PageHeading, StatusBanner } from '@/components/finance/shared';

export function Recent({ connection }: { connection: Connection }) {
  const [rows, setRows] = useState<PersonalEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const [variant, setVariant] = useState<'ok' | 'err'>('ok');
  const [stale, setStale] = useState(false);
  const hadRows = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    setDetails(null);
    const { ok, status, data } = await adminFetch<{ rows?: PersonalEntry[]; error?: string }>(
      connection.apiBase,
      connection.adminKey,
      '/api/admin/billing/personal-finance-entries?limit=80',
    );
    setLoading(false);
    if (!ok) {
      setVariant('err');
      setMsg(operatorError(status, data));
      setDetails(data.error ? `error=${data.error}` : `HTTP ${status}`);
      if (hadRows.current) setStale(true);
      else setRows([]);
      return;
    }
    setStale(false);
    setVariant('ok');
    const next = Array.isArray(data.rows) ? data.rows : [];
    hadRows.current = next.length > 0;
    setRows(next);
    setMsg(`Loaded ${next.length} entr${next.length === 1 ? 'y' : 'ies'}.`);
  }, [connection.apiBase, connection.adminKey]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setInvoiceStatus(id: string, status: string) {
    const { ok, status: st, data } = await adminFetch<{ error?: string }>(
      connection.apiBase,
      connection.adminKey,
      `/api/admin/billing/personal-finance-entries/${id}/invoice-status`,
      { method: 'POST', json: { status } },
    );
    if (!ok) {
      setVariant('err');
      setMsg(operatorError(st, data));
      setDetails(data.error ? `error=${data.error}` : `HTTP ${st}`);
      return;
    }
    await load();
  }

  return (
    <>
      <PageHeading
        eyebrow="Finance"
        title="Recent"
        summary="Work the personal cash and invoice ledger you created here."
        badge="Write · status actions"
      />
      <FinancePanel title="Personal entries" description="Not the full formal ledger — cash logs and invoices from this tool.">
        <div className="actions">
          <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
          {stale ? <span className="stale-pill">Previous values may be stale</span> : null}
        </div>
        <StatusBanner message={msg} variant={variant} details={details} />
        <div className="record-table">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Kind</th>
                <th>Member</th>
                <th className="numeric">Amount</th>
                <th>Meta</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                  <td>{r.entry_kind}</td>
                  <td>{r.member_display_name}</td>
                  <td className="numeric">{formatUsdFromCents(r.amount_cents)}</td>
                  <td>
                    {r.entry_kind === 'invoice' ? (
                      <>
                        due {r.due_at ?? '—'} · {r.invoice_status ?? '—'}
                      </>
                    ) : (
                      r.method ?? '—'
                    )}
                  </td>
                  <td>
                    {r.entry_kind === 'invoice' && r.invoice_status !== 'void' && r.invoice_status !== 'paid' ? (
                      <div className="actions">
                        {r.invoice_status === 'draft' ? (
                          <Button type="button" variant="outline" className="fat-action" onClick={() => void setInvoiceStatus(r.id, 'sent')}>
                            Mark sent
                          </Button>
                        ) : null}
                        <Button type="button" variant="outline" className="fat-action" onClick={() => void setInvoiceStatus(r.id, 'paid')}>
                          Mark paid
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => void setInvoiceStatus(r.id, 'void')}>
                          Void
                        </Button>
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="record-cards">
          {rows.map((r) => (
            <article key={r.id} className="record-card">
              <dl>
                <div>
                  <dt>Member</dt>
                  <dd>{r.member_display_name}</dd>
                </div>
                <div>
                  <dt>Amount</dt>
                  <dd>{formatUsdFromCents(r.amount_cents)}</dd>
                </div>
                <div>
                  <dt>Kind</dt>
                  <dd>{r.entry_kind}</dd>
                </div>
                <div>
                  <dt>Meta</dt>
                  <dd>
                    {r.entry_kind === 'invoice'
                      ? `due ${r.due_at ?? '—'} · ${r.invoice_status ?? '—'}`
                      : r.method ?? '—'}
                  </dd>
                </div>
              </dl>
              {r.entry_kind === 'invoice' && r.invoice_status !== 'void' && r.invoice_status !== 'paid' ? (
                <div className="fat-action-row">
                  {r.invoice_status === 'draft' ? (
                    <Button type="button" variant="outline" className="fat-action" onClick={() => void setInvoiceStatus(r.id, 'sent')}>
                      Mark sent
                    </Button>
                  ) : null}
                  <Button type="button" className="fat-action" onClick={() => void setInvoiceStatus(r.id, 'paid')}>
                    Mark paid
                  </Button>
                  <Button type="button" variant="ghost" className="fat-action" onClick={() => void setInvoiceStatus(r.id, 'void')}>
                    Void
                  </Button>
                </div>
              ) : null}
            </article>
          ))}
          {rows.length === 0 && !loading ? <p className="empty-state">No personal entries loaded.</p> : null}
        </div>
      </FinancePanel>
    </>
  );
}
