import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
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

const QUICK_METHODS: PaymentMethod[] = ['cash', 'card', 'cashapp', 'venmo'];
const MORE_METHODS = PAYMENT_METHODS.filter((m) => !QUICK_METHODS.includes(m));

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  cashapp: 'CashApp',
  venmo: 'Venmo',
  paypal: 'PayPal',
  zelle: 'Zelle',
  other: 'Other',
};

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
  const [lastId, setLastId] = useState<string | null>(null);
  const [lastCents, setLastCents] = useState<number | null>(null);
  const [lastName, setLastName] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setIssuedBy((prev) => prev || defaultIssuedBy);
  }, [defaultIssuedBy]);

  const shareText = useMemo(() => {
    if (!lastId || lastCents === null || !lastName.trim()) return '';
    return buildQuickShareText({
      name: lastName,
      amountCents: lastCents,
      entryId: lastId,
      notes,
    });
  }, [lastId, lastCents, lastName, notes]);

  const justSaved = Boolean(lastId && shareText);

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
    setLastId(null);
    setLastCents(null);
    setLastName('');
    setMsg(null);
    setDetails(null);
    focusAmount();
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
      setLastId(null);
      setLastCents(null);
      setLastName('');
      return;
    }
    setVariant('ok');
    setMsg(`Cash logged for ${memberName.trim()} — ${formatUsdFromCents(cents)}.`);
    setDetails(`entry_id=${data.id}`);
    setLastId(data.id);
    setLastCents(cents);
    setLastName(memberName.trim());
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
    <div className="register-page">
      <PageHeading
        eyebrow="Finance"
        title="Cash"
        summary="Register mode — person, amount, method, save, share."
        badge="Write · personal log"
      />
      <FinancePanel title="Log cash received" description="Fast path for money that just came in.">
        <form
          ref={formRef}
          onSubmit={(e) => void onSubmit(e)}
          className="stack register-form"
        >
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
          <Field id="cash-amt" label="Amount (USD)">
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
              Method
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
                  {METHOD_LABEL[m]}
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
                    {METHOD_LABEL[m]}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <p className="muted text-sm">
            Issued by <strong>{issuedBy || '—'}</strong>
            <button
              type="button"
              className="text-link inline-edit"
              onClick={() => {
                const next = window.prompt('Issued by (your name)', issuedBy);
                if (next !== null) setIssuedBy(next.trim());
              }}
            >
              Edit
            </button>
          </p>
          {showNotes ? (
            <Field id="cash-notes" label="Notes">
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
          {/* Desktop / non-sticky fallback submit inside the form */}
          <Button type="submit" className="register-submit-inline fat-action" disabled={loading}>
            {loading ? 'Saving…' : 'Save cash log'}
          </Button>
        </form>
        <StatusBanner message={msg} variant={variant} details={details} />
        {justSaved ? (
          <div className="share-box">
            <p className="section-label">Share draft</p>
            <pre className="share-pre">{shareText}</pre>
          </div>
        ) : null}
      </FinancePanel>

      <div className="register-sticky" role="region" aria-label="Cash actions">
        {justSaved ? (
          <>
            <Button type="button" className="fat-action" onClick={() => void onShare()}>
              Share or copy
            </Button>
            <Button type="button" className="fat-action" variant="secondary" onClick={logAnother}>
              Log another
            </Button>
          </>
        ) : (
          <Button
            type="button"
            className="fat-action"
            disabled={loading}
            onClick={() => void onSubmit()}
          >
            {loading ? 'Saving…' : 'Save cash log'}
          </Button>
        )}
      </div>
    </div>
  );
}
