import { useState, type FormEvent } from 'react';
import { adminFetch } from '@/lib/admin-api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AdminTabProps, Field, StatusMessage } from './common';

export function PerClassTab({ apiBase, adminKey, requireKey }: AdminTabProps) {
  return (
    <div className="space-y-6">
      <ChargeFromAttendanceForm apiBase={apiBase} adminKey={adminKey} requireKey={requireKey} />
      <UpgradeToMonthlyForm apiBase={apiBase} adminKey={adminKey} requireKey={requireKey} />
    </div>
  );
}

function ChargeFromAttendanceForm({ apiBase, adminKey, requireKey }: AdminTabProps) {
  const [attendanceId, setAttendanceId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [notes, setNotes] = useState('');
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
    if (!attendanceId.trim()) {
      setVariant('err');
      setMsg('attendance_record_id is required.');
      return;
    }
    setLoading(true);
    setMsg(null);
    const body: Record<string, string> = { attendance_record_id: attendanceId.trim() };
    if (dueAt.trim()) body.due_at = dueAt.trim();
    if (notes.trim()) body.notes = notes.trim();

    const { ok, status, data } = await adminFetch<{ charge_id?: string; error?: string }>(
      apiBase,
      adminKey,
      '/api/admin/billing/per-class/charge-from-attendance',
      { method: 'POST', json: body },
    );
    setLoading(false);
    if (!ok) {
      setVariant('err');
      setMsg(`Error ${status}: ${data.error ?? JSON.stringify(data)}`);
      return;
    }
    setVariant('ok');
    setMsg(`Charge created (or existing returned). charge_id: ${data.charge_id ?? '—'}`);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Pay-per-class charge from attendance</CardTitle>
        <CardDescription>
          POST /api/admin/billing/per-class/charge-from-attendance — manual charge for a present attendance row.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field id="ppc-att" label="Attendance record ID (UUID)">
            <Input id="ppc-att" value={attendanceId} onChange={(e) => setAttendanceId(e.target.value)} />
          </Field>
          <Field id="ppc-due" label="Due at (optional, YYYY-MM-DD)">
            <Input id="ppc-due" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </Field>
          <Field id="ppc-notes" label="Notes (optional)">
            <Textarea id="ppc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>
          <Button type="submit" disabled={loading}>
            {loading ? 'Creating…' : 'Create charge'}
          </Button>
        </form>
        <StatusMessage message={msg} variant={variant} />
      </CardContent>
    </Card>
  );
}

function UpgradeToMonthlyForm({ apiBase, adminKey, requireKey }: AdminTabProps) {
  const [participantId, setParticipantId] = useState('');
  const [planId, setPlanId] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [createInitialCharge, setCreateInitialCharge] = useState(true);
  const [conversionPolicy, setConversionPolicy] = useState<'no_credit' | 'manual_writeoff_allowed'>('no_credit');
  const [notes, setNotes] = useState('');
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
      setMsg('participant_id and new_plan_definition_id are required.');
      return;
    }
    setLoading(true);
    setMsg(null);
    const body: Record<string, unknown> = {
      participant_id: participantId.trim(),
      new_plan_definition_id: planId.trim(),
      create_initial_charge: createInitialCharge,
      conversion_policy: conversionPolicy,
    };
    if (effectiveDate.trim()) body.effective_date = effectiveDate.trim();
    if (notes.trim()) body.notes = notes.trim();

    const { ok, status, data } = await adminFetch<{
      old_subscription_id?: string;
      new_subscription_id?: string;
      initial_charge_id?: string | null;
      error?: string;
    }>(apiBase, adminKey, '/api/admin/billing/per-class/upgrade-to-monthly', { method: 'POST', json: body });
    setLoading(false);
    if (!ok) {
      setVariant('err');
      setMsg(`Error ${status}: ${data.error ?? JSON.stringify(data)}`);
      return;
    }
    setVariant('ok');
    setMsg(
      `Converted. old: ${data.old_subscription_id ?? '—'} · new: ${data.new_subscription_id ?? '—'}${data.initial_charge_id ? ` · charge: ${data.initial_charge_id}` : ''}`,
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Upgrade per-class to monthly</CardTitle>
        <CardDescription>POST /api/admin/billing/per-class/upgrade-to-monthly</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field id="upc-participant" label="Participant ID (UUID)">
            <Input id="upc-participant" value={participantId} onChange={(e) => setParticipantId(e.target.value)} />
          </Field>
          <Field id="upc-plan" label="New monthly plan definition ID (UUID)">
            <Input id="upc-plan" value={planId} onChange={(e) => setPlanId(e.target.value)} />
          </Field>
          <Field id="upc-effective" label="Effective date (optional)">
            <Input id="upc-effective" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
          </Field>
          <Field id="upc-policy" label="Conversion policy">
            <select
              id="upc-policy"
              className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={conversionPolicy}
              onChange={(e) => setConversionPolicy(e.target.value as typeof conversionPolicy)}
            >
              <option value="no_credit">no_credit (default)</option>
              <option value="manual_writeoff_allowed">manual_writeoff_allowed</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={createInitialCharge}
              onChange={(e) => setCreateInitialCharge(e.target.checked)}
            />
            Create initial monthly charge
          </label>
          <Field id="upc-notes" label="Notes (optional)">
            <Textarea id="upc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <Button type="submit" disabled={loading}>
            {loading ? 'Converting…' : 'Upgrade to monthly'}
          </Button>
        </form>
        <StatusMessage message={msg} variant={variant} />
      </CardContent>
    </Card>
  );
}
