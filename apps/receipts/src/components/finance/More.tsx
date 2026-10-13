import { useMemo, useState, type FormEvent } from 'react';
import { adminFetch } from '@/lib/admin-api';
import { operatorError, type Connection, type Destination } from '@/lib/finance';
import { SharePreviewPanel, type SharePreviewPayload } from '@/components/SharePreviewPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, FinancePanel, PageHeading, ScopeNote, StatusBanner } from '@/components/finance/shared';

type PreviewScenario = 'quick' | 'invoice' | 'formal';

export function More({
  connection,
  defaultIssuedBy,
  onGo,
}: {
  connection: Connection;
  defaultIssuedBy: string;
  onGo?: (dest: Destination) => void;
}) {
  return (
    <>
      <PageHeading
        eyebrow="Finance"
        title="More"
        summary="Less common tools. Peak-hour work stays on Cash and Recent."
        badge="Specialist"
      />
      {onGo ? (
        <FinancePanel title="Also available" description="Invoice and Formal stay one tap away on phone.">
          <div className="actions">
            <Button type="button" className="fat-action" variant="secondary" onClick={() => onGo('Invoice')}>
              Invoice drafts
            </Button>
            <Button type="button" className="fat-action" variant="secondary" onClick={() => onGo('Formal')}>
              Formal billing
            </Button>
          </div>
        </FinancePanel>
      ) : null}
      <SharePreviewSection />
      <VoidReceipt connection={connection} />
      <RefundReceipt connection={connection} defaultIssuedBy={defaultIssuedBy} />
    </>
  );
}

function SharePreviewSection() {
  const [scenario, setScenario] = useState<PreviewScenario>('formal');
  const samplePayload: SharePreviewPayload = useMemo(() => {
    if (scenario === 'quick') {
      return {
        kind: 'quick',
        data: {
          name: 'Alex Rivera',
          amountCents: 15_000,
          entryId: '00000000-0000-4000-8000-000000000001',
          notes: 'Day pass + guest',
        },
      };
    }
    if (scenario === 'invoice') {
      return {
        kind: 'invoice',
        data: {
          name: 'Alex Rivera',
          amountCents: 8900,
          dueAt: '2026-04-30',
          entryId: '00000000-0000-4000-8000-000000000002',
          status: 'draft',
        },
      };
    }
    return {
      kind: 'formal',
      data: {
        name: 'Alex Rivera',
        amountCents: 8900,
        paymentId: 'pay_demo_abc123',
        receiptId: 'rcpt_demo_xyz789',
        issuedBy: 'Jordan',
      },
    };
  }, [scenario]);

  return (
    <FinancePanel title="Share preview" description="Sample SMS and card layouts — no API calls.">
      <Field label="Scenario">
        <select
          className="finance-select"
          value={scenario}
          onChange={(e) => setScenario(e.target.value as PreviewScenario)}
          aria-label="Share preview scenario"
        >
          <option value="formal">Formal payment + receipt</option>
          <option value="invoice">Invoice draft</option>
          <option value="quick">Cash log</option>
        </select>
      </Field>
      <SharePreviewPanel payload={samplePayload} title="Sample data" />
    </FinancePanel>
  );
}

function VoidReceipt({ connection }: { connection: Connection }) {
  const [receiptId, setReceiptId] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const [variant, setVariant] = useState<'ok' | 'err'>('ok');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!receiptId.trim() || !voidReason.trim()) {
      setVariant('err');
      setMsg('Receipt ID and void reason are required.');
      setDetails(null);
      return;
    }
    if (!confirm) {
      setVariant('err');
      setMsg('Confirm that you intend to void this formal receipt.');
      setDetails(null);
      return;
    }
    setLoading(true);
    setMsg(null);
    setDetails(null);
    const { ok, status, data } = await adminFetch<{ ok?: boolean; error?: string }>(
      connection.apiBase,
      connection.adminKey,
      `/api/admin/billing/receipts/${encodeURIComponent(receiptId.trim())}/void`,
      { method: 'POST', json: { void_reason: voidReason.trim() } },
    );
    setLoading(false);
    if (!ok) {
      setVariant('err');
      setMsg(operatorError(status, data));
      setDetails(data.error ? `error=${data.error}` : `HTTP ${status}`);
      return;
    }
    setVariant('ok');
    setMsg('Formal receipt voided.');
    setDetails(`receipt_id=${receiptId.trim()}`);
    setVoidReason('');
    setConfirm(false);
  }

  return (
    <FinancePanel title="Void formal receipt" description="Applies to money-in receipts — not the personal cash log.">
      <ScopeNote>Voiding cannot be undone from this screen. Double-check the receipt ID.</ScopeNote>
      <form onSubmit={onSubmit} className="stack">
        <Field id="rid" label="Receipt ID">
          <Input id="rid" value={receiptId} onChange={(e) => setReceiptId(e.target.value)} className="font-mono text-sm" />
        </Field>
        <Field id="why" label="Void reason">
          <Textarea id="why" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} rows={3} />
        </Field>
        <label className="check-row confirm-row">
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          I understand this voids a formal receipt permanently in the ledger.
        </label>
        <Button type="submit" variant="destructive" disabled={loading}>
          {loading ? 'Voiding…' : 'Void receipt'}
        </Button>
      </form>
      <StatusBanner message={msg} variant={variant} details={details} />
    </FinancePanel>
  );
}

function RefundReceipt({ connection, defaultIssuedBy }: { connection: Connection; defaultIssuedBy: string }) {
  const [paymentRefundId, setPaymentRefundId] = useState('');
  const [issuedBy, setIssuedBy] = useState(defaultIssuedBy);
  const [notes, setNotes] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const [variant, setVariant] = useState<'ok' | 'err'>('ok');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!paymentRefundId.trim() || !issuedBy.trim()) {
      setVariant('err');
      setMsg('Refund ID and your name are required.');
      setDetails(null);
      return;
    }
    if (!confirm) {
      setVariant('err');
      setMsg('Confirm that a payment_refunds row already exists for this refund.');
      setDetails(null);
      return;
    }
    setLoading(true);
    setMsg(null);
    setDetails(null);
    const { ok, status, data } = await adminFetch<{ ok?: boolean; receipt_id?: string; error?: string }>(
      connection.apiBase,
      connection.adminKey,
      '/api/admin/billing/receipts/issue-for-refund',
      {
        method: 'POST',
        json: {
          payment_refund_id: paymentRefundId.trim(),
          issued_by: issuedBy.trim(),
          notes: notes.trim() || undefined,
        },
      },
    );
    setLoading(false);
    if (!ok) {
      setVariant('err');
      setMsg(operatorError(status, data));
      setDetails(data.error ? `error=${data.error}` : `HTTP ${status}`);
      return;
    }
    setVariant('ok');
    setMsg('Refund receipt issued.');
    setDetails(data.receipt_id ? `receipt_id=${data.receipt_id}` : null);
    setConfirm(false);
  }

  return (
    <FinancePanel
      title="Issue refund receipt"
      description="Requires an existing payment_refunds row. Creating refunds is not yet in this app."
    >
      <ScopeNote>
        This only issues a receipt for a refund that already exists. Creating payment-refunds remains a follow-up.
      </ScopeNote>
      <form onSubmit={onSubmit} className="stack">
        <Field id="prid" label="Payment refund ID">
          <Input
            id="prid"
            value={paymentRefundId}
            onChange={(e) => setPaymentRefundId(e.target.value)}
            className="font-mono text-sm"
          />
        </Field>
        <Field id="ib" label="Issued by (your name)">
          <Input id="ib" value={issuedBy} onChange={(e) => setIssuedBy(e.target.value)} />
        </Field>
        <Field id="n" label="Notes (optional)">
          <Textarea id="n" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
        <label className="check-row confirm-row">
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />I confirm the refund
          row already exists and I am issuing its receipt.
        </label>
        <Button type="submit" disabled={loading}>
          {loading ? 'Issuing…' : 'Issue refund receipt'}
        </Button>
      </form>
      <StatusBanner message={msg} variant={variant} details={details} />
    </FinancePanel>
  );
}
