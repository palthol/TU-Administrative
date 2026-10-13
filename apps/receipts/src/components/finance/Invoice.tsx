import { useMemo, useState, type FormEvent } from 'react';
import { adminFetch } from '@/lib/admin-api';
import {
  defaultTomorrowIsoDate,
  operatorError,
  parseDollarsToCents,
  shareOrCopy,
  type Connection,
} from '@/lib/finance';
import { buildInvoiceShareText, formatUsdFromCents } from '@/lib/shareFormats';
import { SharePreviewPanel } from '@/components/SharePreviewPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ParticipantLookup } from '@/components/finance/ParticipantLookup';
import { Field, FinancePanel, PageHeading, StatusBanner } from '@/components/finance/shared';

export function Invoice({ connection, defaultIssuedBy }: { connection: Connection; defaultIssuedBy: string }) {
  const [memberName, setMemberName] = useState('');
  const [amount, setAmount] = useState('');
  const [issuedBy, setIssuedBy] = useState(defaultIssuedBy);
  const [notes, setNotes] = useState('');
  const [dueAt, setDueAt] = useState(defaultTomorrowIsoDate);
  const [msg, setMsg] = useState<string | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const [variant, setVariant] = useState<'ok' | 'err'>('ok');
  const [loading, setLoading] = useState(false);
  const [last, setLast] = useState<{ id: string; cents: number; due: string } | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const shareText = useMemo(() => {
    if (!last || !memberName.trim()) return '';
    return buildInvoiceShareText({
      name: memberName,
      amountCents: last.cents,
      dueAt: last.due,
      entryId: last.id,
      status: 'draft',
    });
  }, [last, memberName]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const cents = parseDollarsToCents(amount);
    if (!memberName.trim() || !issuedBy.trim() || !dueAt.trim() || cents === null) {
      setVariant('err');
      setMsg('Member name, your name, due date, and a positive amount are required.');
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
          entry_kind: 'invoice',
          member_display_name: memberName.trim(),
          amount_cents: cents,
          issued_by: issuedBy.trim(),
          notes: notes.trim() || undefined,
          due_at: dueAt.trim(),
          invoice_status: 'draft',
          account_id: selectedAccountId || undefined,
        },
      },
    );
    setLoading(false);
    if (!ok || !data.id) {
      setVariant('err');
      setMsg(operatorError(status, data));
      setDetails(data.error ? `error=${data.error}` : `HTTP ${status}`);
      setLast(null);
      return;
    }
    setVariant('ok');
    setMsg(`Invoice draft saved for ${memberName.trim()} — ${formatUsdFromCents(cents)} due ${dueAt.trim()}.`);
    setDetails(`entry_id=${data.id}`);
    setLast({ id: data.id, cents, due: dueAt.trim() });
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

  return (
    <>
      <PageHeading
        eyebrow="Finance"
        title="Invoice"
        summary="Create a lightweight draft reminder before formal charges."
        badge="Write · personal log"
      />
      <FinancePanel
        title="Create invoice draft"
        description="Does not create a formal charges row. Use Recent to mark sent, paid, or void."
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
          <Field id="inv-name" label="Member display name">
            <Input id="inv-name" value={memberName} onChange={(e) => setMemberName(e.target.value)} />
          </Field>
          <Field id="inv-amt" label="Amount due (USD)">
            <Input id="inv-amt" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </Field>
          <Field id="inv-due" label="Due date">
            <Input id="inv-due" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </Field>
          <Field id="inv-by" label="Issued by (your name)">
            <Input id="inv-by" value={issuedBy} onChange={(e) => setIssuedBy(e.target.value)} />
          </Field>
          <Field id="inv-notes" label="Notes">
            <Textarea id="inv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving…' : 'Save invoice draft'}
          </Button>
        </form>
        <StatusBanner message={msg} variant={variant} details={details} />
        {last && shareText ? (
          <>
            <SharePreviewPanel
              title="After save — invoice share"
              payload={{
                kind: 'invoice',
                data: {
                  name: memberName,
                  amountCents: last.cents,
                  dueAt: last.due,
                  entryId: last.id,
                  status: 'draft',
                },
              }}
            />
            <Button type="button" variant="secondary" onClick={() => void onShare()}>
              Device share or copy
            </Button>
          </>
        ) : null}
      </FinancePanel>
    </>
  );
}
