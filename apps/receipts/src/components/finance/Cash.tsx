import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { adminFetch } from '@/lib/admin-api';
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  operatorError,
  parseDollarsToCents,
  shareOrCopy,
  type Connection,
  type PaymentMethod,
} from '@/lib/finance';
import {
  buildReceiptEmailSubject,
  buildReceiptMailtoHref,
  buildReceiptShareText,
  printReceipt,
  type ReceiptCardInput,
  type ReceiptPrintCopies,
} from '@/lib/receiptCard';
import type { Plan } from '@/lib/planPrefill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ParticipantLookup } from '@/components/finance/ParticipantLookup';
import { PlanPrefill } from '@/components/finance/PlanPrefill';
import { ReceiptCard } from '@/components/finance/ReceiptCard';
import { Field, FinancePanel, PageHeading, StatusBanner } from '@/components/finance/shared';

const QUICK_METHODS: PaymentMethod[] = ['cash', 'card', 'cashapp', 'venmo'];
const MORE_METHODS = PAYMENT_METHODS.filter((m) => !QUICK_METHODS.includes(m));

type SavedReceipt = ReceiptCardInput & { email: string | null };

export function Cash({ connection, defaultIssuedBy }: { connection: Connection; defaultIssuedBy: string }) {
  const [memberName, setMemberName] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [issuedBy, setIssuedBy] = useState(defaultIssuedBy);
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [showMoreMethods, setShowMoreMethods] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const [variant, setVariant] = useState<'ok' | 'err'>('ok');
  const [loading, setLoading] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [personChosen, setPersonChosen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [saved, setSaved] = useState<SavedReceipt | null>(null);
  const [printCopies, setPrintCopies] = useState<ReceiptPrintCopies>('two');
  const amountRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setIssuedBy((prev) => prev || defaultIssuedBy);
  }, [defaultIssuedBy]);

  useEffect(() => {
    if (!saved) return;
    window.requestAnimationFrame(() => {
      document.getElementById('receipt-card')?.focus();
    });
  }, [saved]);

  const shareText = useMemo(() => (saved ? buildReceiptShareText(saved) : ''), [saved]);
  const mailtoHref = useMemo(() => {
    if (!saved) return '';
    return buildReceiptMailtoHref({
      to: saved.email,
      subject: buildReceiptEmailSubject(saved.personName),
      body: shareText,
    });
  }, [saved, shareText]);

  function focusAmount() {
    window.setTimeout(() => {
      amountRef.current?.focus({ preventScroll: false });
      amountRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 50);
  }

  function logAnother() {
    setMemberName('');
    setAmount('');
    setNotes('');
    setShowNotes(false);
    setSelectedAccountId(null);
    setSelectedParticipantId(null);
    setSelectedEmail(null);
    setPersonChosen(false);
    setSelectedPlan(null);
    setSaved(null);
    setPrintCopies('two');
    setMsg(null);
    setDetails(null);
    focusAmount();
  }

  function onPlanChosen(plan: Plan | null, prefillAmount: string | null) {
    setSelectedPlan(plan);
    if (prefillAmount) setAmount(prefillAmount);
  }

  async function onSubmit(e?: FormEvent) {
    e?.preventDefault();
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
      setSaved(null);
      return;
    }
    setVariant('ok');
    setMsg(null);
    setDetails(null);
    setSaved({
      personName: memberName.trim(),
      planName: selectedPlan?.name ?? null,
      amountCents: cents,
      paymentMethod: method,
      receivedBy: issuedBy.trim(),
      recordedAt: new Date(),
      note: notes.trim() || null,
      entryId: data.id,
      email: selectedEmail,
    });
  }

  async function onShare() {
    if (!shareText) return;
    const result = await shareOrCopy(shareText);
    if (result === 'failed') {
      setVariant('err');
      setMsg('Unable to share or copy. Try Print or Email instead.');
      return;
    }
    setVariant('ok');
    setMsg(result === 'shared' ? 'Shared via device share sheet.' : 'Copied receipt text to clipboard.');
  }

  const receiptActions = saved ? (
    <div className="receipt-actions print-hide">
      <div className="receipt-print-mode" role="radiogroup" aria-label="Print copies">
        <button
          type="button"
          className={printCopies === 'two' ? 'method-chip method-chip-active' : 'method-chip'}
          aria-pressed={printCopies === 'two'}
          onClick={() => setPrintCopies('two')}
        >
          Member + gym
        </button>
        <button
          type="button"
          className={printCopies === 'single' ? 'method-chip method-chip-active' : 'method-chip'}
          aria-pressed={printCopies === 'single'}
          onClick={() => setPrintCopies('single')}
        >
          Member copy
        </button>
      </div>
      <Button type="button" className="fat-action" onClick={() => printReceipt(undefined, printCopies)}>
        Print
      </Button>
      <Button type="button" className="fat-action" variant="secondary" onClick={() => void onShare()}>
        Share or copy
      </Button>
      <Button type="button" className="fat-action" variant="secondary" asChild>
        <a href={mailtoHref}>Email</a>
      </Button>
      <Button type="button" className="fat-action" variant="secondary" onClick={logAnother}>
        Log another
      </Button>
      <p className="muted text-sm receipt-email-note">
        Email opens a draft on this device. A real send from Temple Underground is a later option.
      </p>
    </div>
  ) : null;

  return (
    <div className={saved ? 'register-page receipt-open' : 'register-page'}>
      {saved ? null : (
        <div className="print-hide">
          <PageHeading
            eyebrow="Finance"
            title="Cash"
            summary="Register mode — person, amount, method, save, receipt."
            badge="Write · personal log"
          />
        </div>
      )}

      {saved ? (
        <>
          <div className="print-hide">
            <StatusBanner message={msg} variant={variant} details={details} />
          </div>
          <ReceiptCard receipt={saved} printCopies={printCopies} />
          {receiptActions}
        </>
      ) : (
        <FinancePanel title="Log cash received" description="Fast path for money that just came in.">
          <form ref={formRef} onSubmit={(e) => void onSubmit(e)} className="stack register-form">
            <ParticipantLookup
              connection={connection}
              issuedBy={issuedBy}
              selected={memberName.trim() ? { memberName: memberName.trim(), accountId: selectedAccountId } : null}
              onSelect={(row) => {
                setMemberName(row.full_name);
                setSelectedAccountId(row.preferred_account_id ?? null);
                setSelectedParticipantId(row.participant_id);
                setSelectedEmail(row.email?.trim() || null);
                setPersonChosen(true);
              }}
              onExternal={(accountId, displayName) => {
                setMemberName(displayName);
                setSelectedAccountId(accountId);
                setSelectedParticipantId(null);
                setSelectedEmail(null);
                setPersonChosen(true);
              }}
              onPersonChosen={focusAmount}
              autoFocus={!memberName}
            />
            <Field id="cash-name" label="Member display name">
              <Input
                id="cash-name"
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                placeholder="Who paid"
                autoComplete="off"
              />
            </Field>
            <PlanPrefill
              connection={connection}
              participantId={selectedParticipantId}
              accountId={selectedAccountId}
              enabled={personChosen}
              onPlanChosen={onPlanChosen}
            />
            <Field id="cash-amt" label="Amount received">
              <Input
                ref={amountRef}
                id="cash-amt"
                className="register-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
                autoComplete="off"
                enterKeyHint="done"
              />
            </Field>
            <div className="method-field">
              <p className="section-label" id="method-label">
                Payment
              </p>
              <div className="method-chips" role="group" aria-labelledby="method-label">
                {QUICK_METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={method === m ? 'method-chip method-chip-active' : 'method-chip'}
                    aria-pressed={method === m}
                    onClick={() => {
                      setMethod(m);
                      setShowMoreMethods(false);
                    }}
                  >
                    {PAYMENT_METHOD_LABEL[m]}
                  </button>
                ))}
                <button
                  type="button"
                  className={
                    MORE_METHODS.includes(method) || showMoreMethods
                      ? 'method-chip method-chip-active'
                      : 'method-chip'
                  }
                  aria-pressed={MORE_METHODS.includes(method) || showMoreMethods}
                  onClick={() => setShowMoreMethods((v) => !v)}
                >
                  More
                </button>
              </div>
              {showMoreMethods ? (
                <div className="method-chips method-chips-more">
                  {MORE_METHODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={method === m ? 'method-chip method-chip-active' : 'method-chip'}
                      aria-pressed={method === m}
                      onClick={() => setMethod(m)}
                    >
                      {PAYMENT_METHOD_LABEL[m]}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <p className="muted text-sm">
              Received by <strong>{issuedBy || '—'}</strong>
              <button
                type="button"
                className="text-link inline-edit"
                onClick={() => {
                  const next = window.prompt('Received by (your name)', issuedBy);
                  if (next !== null) setIssuedBy(next.trim());
                }}
              >
                Edit
              </button>
            </p>
            {showNotes ? (
              <Field id="cash-notes" label="Note">
                <Textarea
                  id="cash-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Optional context"
                />
              </Field>
            ) : (
              <button type="button" className="text-link" onClick={() => setShowNotes(true)}>
                Add note
              </button>
            )}
            <Button type="submit" className="register-submit-inline fat-action" disabled={loading}>
              {loading ? 'Saving…' : 'Save cash log'}
            </Button>
          </form>
          <StatusBanner message={msg} variant={variant} details={details} />
        </FinancePanel>
      )}

      {saved ? null : (
        <div className="register-sticky print-hide" role="region" aria-label="Cash actions">
          <Button type="button" className="fat-action" disabled={loading} onClick={() => void onSubmit()}>
            {loading ? 'Saving…' : 'Save cash log'}
          </Button>
        </div>
      )}
    </div>
  );
}
