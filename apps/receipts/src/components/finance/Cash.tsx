import { useMemo, useState, type FormEvent } from 'react';
import { adminFetch } from '@/lib/admin-api';
import {
  PAYMENT_METHODS,
  operatorError,
  parseDollarsToCents,
  shareOrCopy,
  type Connection,
  type PaymentMethod,
} from '@/lib/finance';
import { buildQuickShareText, formatUsdFromCents } from '@/lib/shareFormats';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ParticipantLookup } from '@/components/finance/ParticipantLookup';
import { Field, FinancePanel, PageHeading, StatusBanner } from '@/components/finance/shared';

export function Cash({ connection, defaultIssuedBy }: { connection: Connection; defaultIssuedBy: string }) {
  const [memberName, setMemberName] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [issuedBy, setIssuedBy] = useState(defaultIssuedBy);
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const [variant, setVariant] = useState<'ok' | 'err'>('ok');
  const [loading, setLoading] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  const [lastCents, setLastCents] = useState<number | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const shareText = useMemo(() => {
    if (!lastId || lastCents === null || !memberName.trim()) return '';
    return buildQuickShareText({
      name: memberName,
      amountCents: lastCents,
      entryId: lastId,
      notes,
    });
  }, [lastId, lastCents, memberName, notes]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const cents = parseDollarsToCents(amount);
    if (!memberName.trim() || !issuedBy.trim() || cents === null) {
      setVariant('err');
      setMsg('Member name, your name, and a positive amount are required.');
      setDetails(null);
      return;
    }
    setLoading(true);
    setMsg(null);
    setDetails(null);
    const { ok, status, data } = await adminFetch<{ ok?: boolean; id?: string; error?: string }>(
      connection.apiBase,
      connection.adminKey,
      '/api/admin/billing/personal-finance-entries',
      {
        method: 'POST',
        json: {
          entry_kind: 'cash_received',
          member_display_name: memberName.trim(),
          amount_cents: cents,
          method,
          issued_by: issuedBy.trim(),
          notes: notes.trim() || undefined,
          account_id: selectedAccountId || undefined,
        },
      },
    );
    setLoading(false);
    if (!ok || !data.id) {
      setVariant('err');
      setMsg(operatorError(status, data));
      setDetails(data.error ? `error=${data.error}` : `HTTP ${status}`);
      setLastId(null);
      setLastCents(null);
      return;
    }
    setVariant('ok');
    setMsg(`Cash logged for ${memberName.trim()} — ${formatUsdFromCents(cents)}. Share when ready.`);
    setDetails(`entry_id=${data.id}`);
    setLastId(data.id);
    setLastCents(cents);
  }

  async function onShare() {
    if (!shareText) return;
    const result = await shareOrCopy(shareText);
    if (result === 'failed') {
      setVariant('err');
      setMsg('Unable to share or copy. Copy manually from the box below.');
      return;
    }
    setVariant('ok');
    setMsg(result === 'shared' ? 'Shared via device share sheet.' : 'Copied share text to clipboard.');
  }

  return (
    <>
      <PageHeading
        eyebrow="Finance"
        title="Cash"
        summary="Log money that just came in. No formal charge IDs required."
        badge="Write · personal log"
      />
      <FinancePanel
        title="Log cash received"
        description="Saves a personal finance entry. Formal Supabase receipts live under Formal when you need them."
      >
        <form onSubmit={onSubmit} className="stack">
          <ParticipantLookup
            connection={connection}
            issuedBy={issuedBy}
            selected={memberName.trim() ? { memberName: memberName.trim(), accountId: selectedAccountId } : null}
            onSelect={(row) => {
              setMemberName(row.full_name);
              setSelectedAccountId(row.preferred_account_id ?? null);
            }}
            onExternal={(accountId, displayName) => {
              setMemberName(displayName);
              setSelectedAccountId(accountId);
            }}
          />
          <Field id="cash-name" label="Member display name">
            <Input id="cash-name" value={memberName} onChange={(e) => setMemberName(e.target.value)} placeholder="Who paid" />
          </Field>
          <Field id="cash-amt" label="Amount (USD)">
            <Input id="cash-amt" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="150.00" inputMode="decimal" />
          </Field>
          <Field id="cash-meth" label="Payment method">
            <select
              id="cash-meth"
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
          <Field id="cash-by" label="Issued by (your name)">
            <Input id="cash-by" value={issuedBy} onChange={(e) => setIssuedBy(e.target.value)} />
          </Field>
          <Field id="cash-notes" label="Notes">
            <Textarea id="cash-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional context" />
          </Field>
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving…' : 'Save cash log'}
          </Button>
        </form>
        <StatusBanner message={msg} variant={variant} details={details} />
        {lastId && shareText ? (
          <div className="share-box">
            <p className="section-label">Share draft</p>
            <pre className="share-pre">{shareText}</pre>
            <Button type="button" variant="secondary" onClick={() => void onShare()}>
              Share or copy
            </Button>
          </div>
        ) : null}
      </FinancePanel>
    </>
  );
}
