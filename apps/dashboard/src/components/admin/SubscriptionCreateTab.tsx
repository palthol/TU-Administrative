import { useState, type FormEvent } from 'react';
import { adminFetch } from '@/lib/admin-api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AdminTabProps, Field, StatusMessage } from './common';

export function SubscriptionCreateTab({ apiBase, adminKey, requireKey }: AdminTabProps) {
  const [participantId, setParticipantId] = useState('');
  const [planId, setPlanId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [createInitialCharge, setCreateInitialCharge] = useState(false);
  const [notes, setNotes] = useState('');
  const [createdBy, setCreatedBy] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [variant, setVariant] = useState<'ok' | 'err'>('ok');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const k = requireKey();
    if (k) {
      setVariant('err');
      setMsg(k);
      return;
    }
    if (!participantId.trim() || !planId.trim()) {
      setVariant('err');
      setMsg('participant_id and plan_definition_id are required.');
      return;
    }
    setLoading(true);
    setMsg(null);
    const body: Record<string, unknown> = {
      participant_id: participantId.trim(),
      plan_definition_id: planId.trim(),
      create_initial_charge: createInitialCharge,
    };
    if (accountId.trim()) body.account_id = accountId.trim();
    if (startsAt.trim()) body.starts_at = startsAt.trim();
    if (endsAt.trim()) body.ends_at = endsAt.trim();
    if (notes.trim()) body.notes = notes.trim();
    if (createdBy.trim()) body.created_by = createdBy.trim();

    const { ok, status, data } = await adminFetch<{
      subscription_id?: string;
      initial_charge_id?: string | null;
      error?: string;
    }>(apiBase, adminKey, '/api/admin/billing/subscriptions', { method: 'POST', json: body });
    setLoading(false);
    if (!ok) {
      setVariant('err');
      setMsg(`Error ${status}: ${data.error ?? JSON.stringify(data)}`);
      return;
    }
    setVariant('ok');
    setMsg(
      `Subscription created. subscription_id: ${data.subscription_id ?? '—'}${data.initial_charge_id ? ` · initial_charge_id: ${data.initial_charge_id}` : ''}`,
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Create subscription</CardTitle>
        <CardDescription>
          POST /api/admin/billing/subscriptions — enroll a participant on a plan (optional initial monthly charge).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field id="sub-participant" label="Participant ID (UUID)">
            <Input id="sub-participant" value={participantId} onChange={(e) => setParticipantId(e.target.value)} />
          </Field>
          <Field id="sub-plan" label="Plan definition ID (UUID)">
            <Input id="sub-plan" value={planId} onChange={(e) => setPlanId(e.target.value)} />
          </Field>
          <Field id="sub-account" label="Account ID (optional)">
            <Input id="sub-account" value={accountId} onChange={(e) => setAccountId(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="sub-starts" label="Starts at (optional, YYYY-MM-DD)">
              <Input id="sub-starts" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </Field>
            <Field id="sub-ends" label="Ends at (optional, YYYY-MM-DD)">
              <Input id="sub-ends" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={createInitialCharge}
              onChange={(e) => setCreateInitialCharge(e.target.checked)}
            />
            Create initial charge (monthly plans only)
          </label>
          <Field id="sub-notes" label="Notes (optional)">
            <Textarea id="sub-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>
          <Field id="sub-by" label="Created by (optional)">
            <Input id="sub-by" value={createdBy} onChange={(e) => setCreatedBy(e.target.value)} />
          </Field>
          <Button type="submit" disabled={loading}>
            {loading ? 'Creating…' : 'Create subscription'}
          </Button>
        </form>
        <StatusMessage message={msg} variant={variant} />
      </CardContent>
    </Card>
  );
}
