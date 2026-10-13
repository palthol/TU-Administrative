import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { adminFetch } from '@/lib/admin-api';
import {
  PAYMENT_METHODS,
  operatorError,
  parseDollarsToCents,
  shareOrCopy,
  type BoardSelection,
  type ChargeDiscountRow,
  type Connection,
  type PaymentMethod,
} from '@/lib/finance';
import { buildFormalShareText, formatUsdFromCents } from '@/lib/shareFormats';
import { SharePreviewPanel } from '@/components/SharePreviewPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, FinancePanel, PageHeading, ScopeNote, StatusBanner } from '@/components/finance/shared';

function boardMemberName(row: Record<string, unknown>): string {
  for (const key of ['participant_full_name', 'member_display_name', 'full_name', 'name']) {
    const v = row[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function boardAmountHint(row: Record<string, unknown>): string | undefined {
  const cents = row.amount_cents ?? row.total_outstanding_cents ?? row.next_amount_cents;
  if (typeof cents === 'number' && Number.isFinite(cents)) return formatUsdFromCents(cents);
  if (typeof cents === 'string' && /^\d+$/.test(cents)) return formatUsdFromCents(Number(cents));
  return undefined;
}

export function Formal({
  connection,
  defaultIssuedBy,
  selection,
  onSelectBoard,
}: {
  connection: Connection;
  defaultIssuedBy: string;
  selection: BoardSelection | null;
  onSelectBoard: (sel: BoardSelection) => void;
}) {
  const [accountId, setAccountId] = useState(selection?.accountId ?? '');
  const [chargeId, setChargeId] = useState(selection?.chargeId ?? '');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [issuedBy, setIssuedBy] = useState(defaultIssuedBy);
  const [issueReceipt, setIssueReceipt] = useState(true);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [memberName, setMemberName] = useState(selection?.memberName ?? '');
  const [confirmFormal, setConfirmFormal] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const [variant, setVariant] = useState<'ok' | 'err'>('ok');
  const [loading, setLoading] = useState(false);
  const [last, setLast] = useState<{ paymentId: string; receiptId: string | null; amountCents: number } | null>(null);
  const [discountType, setDiscountType] = useState<'flat' | 'percent'>('flat');
  const [discountValue, setDiscountValue] = useState('');
  const [discountLabel, setDiscountLabel] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [discountLoading, setDiscountLoading] = useState(false);
  const [discountRows, setDiscountRows] = useState<ChargeDiscountRow[]>([]);
  const [boardRows, setBoardRows] = useState<Record<string, unknown>[]>([]);
  const [boardLoading, setBoardLoading] = useState(false);
  const [showManualIds, setShowManualIds] = useState(false);

  useEffect(() => {
    if (!selection) return;
    setAccountId(selection.accountId);
    setChargeId(selection.chargeId);
    if (selection.memberName) setMemberName(selection.memberName);
  }, [selection]);

  async function loadBoard() {
    setBoardLoading(true);
    const { ok, status, data } = await adminFetch<{ rows?: Record<string, unknown>[]; error?: string }>(
      connection.apiBase,
      connection.adminKey,
      '/api/admin/reporting/views/payment-board?limit=100&sort=next_due_date&order=asc',
    );
    setBoardLoading(false);
    if (!ok) {
      setVariant('err');
      setMsg(operatorError(status, data));
      setDetails(data.error ? `error=${data.error}` : `HTTP ${status}`);
      return;
    }
    setBoardRows(Array.isArray(data.rows) ? data.rows : []);
    setVariant('ok');
    setMsg(`Board loaded — ${Array.isArray(data.rows) ? data.rows.length : 0} row(s). Choose one to fill Formal.`);
  }

  async function loadDiscounts(currentChargeId: string) {
    const id = currentChargeId.trim();
    if (!id) {
      setDiscountRows([]);
      return;
    }
    const { ok, data } = await adminFetch<{ rows?: ChargeDiscountRow[]; error?: string }>(
      connection.apiBase,
      connection.adminKey,
      `/api/admin/billing/charge-discounts?charge_id=${encodeURIComponent(id)}&limit=20`,
    );
    if (!ok) return;
    setDiscountRows(Array.isArray(data.rows) ? data.rows : []);
  }

  useEffect(() => {
    void loadDiscounts(chargeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chargeId, connection.apiBase, connection.adminKey]);

  const shareText = useMemo(() => {
    if (!last) return '';
    return buildFormalShareText({
      name: memberName,
      amountCents: last.amountCents,
      paymentId: last.paymentId,
      receiptId: last.receiptId,
      issuedBy: issuedBy.trim() || undefined,
    });
  }, [last, memberName, issuedBy]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const cents = parseDollarsToCents(amount);
    if (!accountId.trim() || !chargeId.trim() || !issuedBy.trim() || cents === null) {
      setVariant('err');
      setMsg('Pick a board row (or enter account and charge), your name, and a positive amount.');
      setDetails(null);
      return;
    }
    if (!confirmFormal) {
      setVariant('err');
      setMsg('Confirm the payment summary before recording.');
      setDetails(null);
      return;
    }
    setLoading(true);
    setMsg(null);
    setDetails(null);
    const { ok, status, data } = await adminFetch<{
      ok?: boolean;
      payment_id?: string;
      receipt_id?: string | null;
      error?: string;
    }>(connection.apiBase, connection.adminKey, '/api/admin/billing/record-payment', {
      method: 'POST',
      json: {
        account_id: accountId.trim(),
        amount_cents: cents,
        method,
        issued_by: issuedBy.trim(),
        allocations: [{ charge_id: chargeId.trim(), amount_cents: cents }],
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        issue_receipt: issueReceipt,
      },
    });
    setLoading(false);
    if (!ok || !data.payment_id) {
      setVariant('err');
      setMsg(operatorError(status, data));
      setDetails(data.error ? `error=${data.error}` : `HTTP ${status}`);
      setLast(null);
      return;
    }
    setVariant('ok');
    setMsg(
      `Payment recorded${memberName.trim() ? ` for ${memberName.trim()}` : ''} — ${formatUsdFromCents(cents)}${
        data.receipt_id ? ' · receipt issued' : ''
      }.`,
    );
    setDetails(`payment_id=${data.payment_id}${data.receipt_id ? ` receipt_id=${data.receipt_id}` : ''}`);
    setLast({ paymentId: data.payment_id, receiptId: data.receipt_id ?? null, amountCents: cents });
    setConfirmFormal(false);
  }

  async function onApplyDiscount() {
    if (!chargeId.trim()) {
      setVariant('err');
      setMsg('Select a charge before applying a discount.');
      return;
    }
    if (!discountLabel.trim()) {
      setVariant('err');
      setMsg('Discount label is required.');
      return;
    }
    const n = Number.parseFloat(discountValue);
    if (!Number.isFinite(n) || n <= 0) {
      setVariant('err');
      setMsg(discountType === 'flat' ? 'Enter a positive flat discount in dollars.' : 'Enter a positive percent (e.g. 10).');
      return;
    }
    const payload =
      discountType === 'flat'
        ? {
            charge_id: chargeId.trim(),
            discount_type: 'flat' as const,
            flat_amount_cents: Math.round(n * 100),
            label: discountLabel.trim(),
            reason: discountReason.trim() || undefined,
            created_by: issuedBy.trim() || undefined,
          }
        : {
            charge_id: chargeId.trim(),
            discount_type: 'percent' as const,
            percent_basis_points: Math.round(n * 100),
            label: discountLabel.trim(),
            reason: discountReason.trim() || undefined,
            created_by: issuedBy.trim() || undefined,
          };
    setDiscountLoading(true);
    const { ok, status, data } = await adminFetch<{
      ok?: boolean;
      error?: string;
      discount_id?: string;
      applied_amount_cents?: number;
      net_due_cents?: number | null;
    }>(connection.apiBase, connection.adminKey, '/api/admin/billing/charge-discounts', {
      method: 'POST',
      json: payload,
    });
    setDiscountLoading(false);
    if (!ok || !data.discount_id) {
      setVariant('err');
      setMsg(operatorError(status, data));
      setDetails(data.error ? `error=${data.error}` : `HTTP ${status}`);
      return;
    }
    setVariant('ok');
    setMsg(
      `Discount applied — ${formatUsdFromCents(data.applied_amount_cents ?? 0)}${
        Number.isFinite(data.net_due_cents as number) ? ` · net due ${formatUsdFromCents(data.net_due_cents as number)}` : ''
      }.`,
    );
    setDetails(`discount_id=${data.discount_id}`);
    setDiscountValue('');
    setDiscountReason('');
    await loadDiscounts(chargeId);
  }

  async function onShare() {
    if (!shareText) return;
    const result = await shareOrCopy(shareText);
    if (result === 'failed') {
      setVariant('err');
      setMsg('Unable to share or copy.');
      return;
    }
    setVariant('ok');
    setMsg(result === 'shared' ? 'Shared via device share sheet.' : 'Copied share text to clipboard.');
  }

  const centsPreview = parseDollarsToCents(amount);

  return (
    <>
      <PageHeading
        eyebrow="Finance"
        title="Formal"
        summary="Record a payment against a known charge. Prefer the board picker over pasting UUIDs."
        badge="Write · advanced"
      />
      <FinancePanel title="Payment board" description="Choose a row to fill account and charge in memory.">
        <ScopeNote>
          Formal billing writes to the shared ledger. Confirm amount and method before recording. Requires migrations
          for discounts (0019) when using discount lines.
        </ScopeNote>
        <div className="actions">
          <Button type="button" variant="secondary" onClick={() => void loadBoard()} disabled={boardLoading}>
            {boardLoading ? 'Loading board…' : 'Load payment board'}
          </Button>
        </div>
        {boardRows.length > 0 ? (
          <div className="board-list">
            {boardRows.map((row, i) => {
              const aid = String(row.account_id ?? '');
              const cid = String(row.charge_id ?? '');
              const name = boardMemberName(row);
              const hint = boardAmountHint(row);
              const active = aid === accountId && cid === chargeId;
              return (
                <button
                  key={`${aid}-${cid}-${i}`}
                  type="button"
                  className={active ? 'board-row board-row-active' : 'board-row'}
                  onClick={() => {
                    onSelectBoard({
                      accountId: aid,
                      chargeId: cid,
                      memberName: name,
                      amountHint: hint,
                    });
                    setAccountId(aid);
                    setChargeId(cid);
                    if (name) setMemberName(name);
                    setConfirmFormal(false);
                  }}
                >
                  <strong>{name || 'Unnamed payer'}</strong>
                  <span>
                    {hint ? `${hint} · ` : ''}
                    due {String(row.next_due_date ?? row.due_at ?? '—')}
                  </span>
                  <span className="muted text-sm">{active ? 'Selected for Formal' : 'Use for Formal'}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="empty-state">Load the board to pick a payer and charge.</p>
        )}
      </FinancePanel>

      <FinancePanel title="Record formal payment" description="Allocates the full amount to one charge (v1).">
        {selection || (accountId && chargeId) ? (
          <p className="muted text-sm">
            Target: <strong>{memberName || 'payer'}</strong>
            {selection?.amountHint ? ` · board hint ${selection.amountHint}` : ''}
          </p>
        ) : null}
        <button type="button" className="text-link" onClick={() => setShowManualIds((v) => !v)}>
          {showManualIds ? 'Hide manual UUID fields' : 'Enter account / charge IDs manually'}
        </button>
        <form onSubmit={onSubmit} className="stack">
          {showManualIds ? (
            <>
              <Field id="acct" label="Account ID">
                <Input id="acct" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="font-mono text-sm" />
              </Field>
              <Field id="chg" label="Charge ID">
                <Input id="chg" value={chargeId} onChange={(e) => setChargeId(e.target.value)} className="font-mono text-sm" />
              </Field>
            </>
          ) : null}
          <Field id="mn2" label="Member display name (for share text)">
            <Input id="mn2" value={memberName} onChange={(e) => setMemberName(e.target.value)} />
          </Field>
          <div className="discount-box">
            <p className="section-label">Optional discount line</p>
            <Field id="discount-type" label="Discount type">
              <select
                id="discount-type"
                className="finance-select"
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value === 'percent' ? 'percent' : 'flat')}
              >
                <option value="flat">Flat amount</option>
                <option value="percent">Percent</option>
              </select>
            </Field>
            <Field id="discount-value" label={discountType === 'flat' ? 'Amount (USD)' : 'Percent (e.g. 10)'}>
              <Input id="discount-value" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} inputMode="decimal" />
            </Field>
            <Field id="discount-label" label="Label (required)">
              <Input id="discount-label" value={discountLabel} onChange={(e) => setDiscountLabel(e.target.value)} />
            </Field>
            <Field id="discount-reason" label="Reason (optional)">
              <Input id="discount-reason" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} />
            </Field>
            <Button type="button" variant="outline" disabled={discountLoading} onClick={() => void onApplyDiscount()}>
              {discountLoading ? 'Applying…' : 'Apply discount line'}
            </Button>
            {discountRows.length > 0 ? (
              <ul className="discount-list">
                {discountRows.map((r) => (
                  <li key={r.id}>
                    {r.discount_type === 'percent'
                      ? `${(r.percent_basis_points ?? 0) / 100}%`
                      : formatUsdFromCents(r.flat_amount_cents ?? 0)}{' '}
                    · applied {formatUsdFromCents(r.applied_amount_cents)} · {r.label}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted text-sm">No discount lines on this charge yet.</p>
            )}
          </div>
          <Field id="amt2" label="Amount (USD)">
            <Input id="amt2" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </Field>
          <Field id="meth2" label="Method">
            <select
              id="meth2"
              className="finance-select"
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          <Field id="by2" label="Issued by (your name)">
            <Input id="by2" value={issuedBy} onChange={(e) => setIssuedBy(e.target.value)} />
          </Field>
          <Field id="ref" label="Reference (optional)">
            <Input id="ref" value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <Field id="notes2" label="Notes (optional)">
            <Textarea id="notes2" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>
          <label className="check-row">
            <input type="checkbox" checked={issueReceipt} onChange={(e) => setIssueReceipt(e.target.checked)} />
            Issue money-in receipt
          </label>
          <label className="check-row confirm-row">
            <input type="checkbox" checked={confirmFormal} onChange={(e) => setConfirmFormal(e.target.checked)} />
            I confirm recording{' '}
            <strong>{centsPreview !== null ? formatUsdFromCents(centsPreview) : '—'}</strong> via <strong>{method}</strong>
            {memberName.trim() ? (
              <>
                {' '}
                for <strong>{memberName.trim()}</strong>
              </>
            ) : null}
            .
          </label>
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving…' : 'Record formal payment'}
          </Button>
        </form>
        <StatusBanner message={msg} variant={variant} details={details} />
        {last ? (
          <>
            <SharePreviewPanel
              title="After save — formal payment share"
              payload={{
                kind: 'formal',
                data: {
                  name: memberName.trim() || undefined,
                  amountCents: last.amountCents,
                  paymentId: last.paymentId,
                  receiptId: last.receiptId,
                  issuedBy: issuedBy.trim() || undefined,
                },
              }}
            />
            {shareText ? (
              <Button type="button" variant="secondary" onClick={() => void onShare()}>
                Device share or copy
              </Button>
            ) : null}
          </>
        ) : null}
      </FinancePanel>
    </>
  );
}
