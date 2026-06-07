import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { adminFetch } from '@/lib/admin-api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AdminTabProps, Field, SimpleDataTable, StatusMessage } from './common';

const ATTENDANCE_STATUSES = ['present', 'no_show', 'cancelled'] as const;

export function SchedulingTab({ apiBase, adminKey, requireKey }: AdminTabProps) {
  return (
    <div className="space-y-6">
      <SessionsList apiBase={apiBase} adminKey={adminKey} requireKey={requireKey} />
      <CreateSessionForm apiBase={apiBase} adminKey={adminKey} requireKey={requireKey} />
      <SessionDetail apiBase={apiBase} adminKey={adminKey} requireKey={requireKey} />
      <AttendanceForm apiBase={apiBase} adminKey={adminKey} requireKey={requireKey} />
    </div>
  );
}

function SessionsList({ apiBase, adminKey, requireKey }: AdminTabProps) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [variant, setVariant] = useState<'ok' | 'err'>('ok');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const k = requireKey();
    if (k) {
      setVariant('err');
      setMsg(k);
      setRows([]);
      return;
    }
    setLoading(true);
    setMsg(null);
    const q = new URLSearchParams({ limit: '50', offset: '0' });
    if (start.trim()) q.set('start', start.trim());
    if (end.trim()) q.set('end', end.trim());
    const { ok, status, data } = await adminFetch<{ rows?: Record<string, unknown>[]; error?: string }>(
      apiBase,
      adminKey,
      `/api/admin/scheduling/sessions?${q}`,
    );
    setLoading(false);
    if (!ok) {
      setVariant('err');
      setMsg(`Error ${status}: ${data.error ?? JSON.stringify(data)}`);
      setRows([]);
      return;
    }
    const next = Array.isArray(data.rows) ? data.rows : [];
    setRows(next);
    setVariant('ok');
    setMsg(`Loaded ${next.length} session(s).`);
  }, [apiBase, adminKey, end, requireKey, start]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Sessions list</CardTitle>
        <CardDescription>GET /api/admin/scheduling/sessions</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field id="sch-start" label="Start date">
            <Input id="sch-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field id="sch-end" label="End date">
            <Input id="sch-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
          <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        </div>
        <StatusMessage message={msg} variant={variant} />
        <SimpleDataTable rows={rows} />
      </CardContent>
    </Card>
  );
}

function CreateSessionForm({ apiBase, adminKey, requireKey }: AdminTabProps) {
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [sessionLabel, setSessionLabel] = useState('');
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
    if (!startsAt || !endsAt) {
      setVariant('err');
      setMsg('starts_at and ends_at are required (ISO datetime).');
      return;
    }
    setLoading(true);
    setMsg(null);
    const body: Record<string, string> = {
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(endsAt).toISOString(),
    };
    if (sessionLabel.trim()) body.session_label = sessionLabel.trim();
    if (notes.trim()) body.notes = notes.trim();

    const { ok, status, data } = await adminFetch<{ session?: { id?: string }; error?: string }>(
      apiBase,
      adminKey,
      '/api/admin/scheduling/sessions',
      { method: 'POST', json: body },
    );
    setLoading(false);
    if (!ok) {
      setVariant('err');
      setMsg(`Error ${status}: ${data.error ?? JSON.stringify(data)}`);
      return;
    }
    setVariant('ok');
    setMsg(`Session created. id: ${data.session?.id ?? '—'}`);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Create session</CardTitle>
        <CardDescription>POST /api/admin/scheduling/sessions</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field id="cs-start" label="Starts at (local)">
            <Input id="cs-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </Field>
          <Field id="cs-end" label="Ends at (local)">
            <Input id="cs-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </Field>
          <Field id="cs-label" label="Session label (optional)">
            <Input id="cs-label" value={sessionLabel} onChange={(e) => setSessionLabel(e.target.value)} />
          </Field>
          <Field id="cs-notes" label="Notes (optional)">
            <Textarea id="cs-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>
          <Button type="submit" disabled={loading}>
            {loading ? 'Creating…' : 'Create session'}
          </Button>
        </form>
        <StatusMessage message={msg} variant={variant} />
      </CardContent>
    </Card>
  );
}

function SessionDetail({ apiBase, adminKey, requireKey }: AdminTabProps) {
  const [sessionId, setSessionId] = useState('');
  const [session, setSession] = useState<Record<string, unknown> | null>(null);
  const [attendance, setAttendance] = useState<Record<string, unknown>[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [variant, setVariant] = useState<'ok' | 'err'>('ok');
  const [loading, setLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  async function loadDetail() {
    const k = requireKey();
    if (k) {
      setVariant('err');
      setMsg(k);
      return;
    }
    if (!sessionId.trim()) {
      setVariant('err');
      setMsg('Session ID is required.');
      return;
    }
    setLoading(true);
    setMsg(null);
    const { ok, status, data } = await adminFetch<{
      session?: Record<string, unknown>;
      attendance?: Record<string, unknown>[];
      error?: string;
    }>(apiBase, adminKey, `/api/admin/scheduling/sessions/${encodeURIComponent(sessionId.trim())}`);
    setLoading(false);
    if (!ok) {
      setVariant('err');
      setMsg(`Error ${status}: ${data.error ?? JSON.stringify(data)}`);
      setSession(null);
      setAttendance([]);
      return;
    }
    setSession(data.session ?? null);
    setAttendance(Array.isArray(data.attendance) ? data.attendance : []);
    setVariant('ok');
    setMsg('Session loaded.');
  }

  async function setCancelled(cancel: boolean) {
    const k = requireKey();
    if (k) {
      setVariant('err');
      setMsg(k);
      return;
    }
    if (!sessionId.trim()) return;
    setCancelLoading(true);
    const { ok, status, data } = await adminFetch<{ session?: Record<string, unknown>; error?: string }>(
      apiBase,
      adminKey,
      `/api/admin/scheduling/sessions/${encodeURIComponent(sessionId.trim())}`,
      { method: 'PATCH', json: { cancel } },
    );
    setCancelLoading(false);
    if (!ok) {
      setVariant('err');
      setMsg(`Error ${status}: ${data.error ?? JSON.stringify(data)}`);
      return;
    }
    setSession(data.session ?? null);
    setVariant('ok');
    setMsg(cancel ? 'Session cancelled.' : 'Session uncancelled.');
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Session detail & cancel</CardTitle>
        <CardDescription>GET/PATCH /api/admin/scheduling/sessions/:sessionId</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Field id="sd-id" label="Session ID">
            <Input id="sd-id" value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="font-mono text-xs" />
          </Field>
          <div className="flex items-end gap-2">
            <Button type="button" variant="secondary" onClick={() => void loadDetail()} disabled={loading}>
              {loading ? 'Loading…' : 'Load'}
            </Button>
            <Button type="button" variant="outline" onClick={() => void setCancelled(true)} disabled={cancelLoading}>
              Cancel session
            </Button>
            <Button type="button" variant="outline" onClick={() => void setCancelled(false)} disabled={cancelLoading}>
              Uncancel
            </Button>
          </div>
        </div>
        <StatusMessage message={msg} variant={variant} />
        {session && (
          <pre className="overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs">
            {JSON.stringify(session, null, 2)}
          </pre>
        )}
        {attendance.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium">Attendance</p>
            <SimpleDataTable rows={attendance} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AttendanceForm({ apiBase, adminKey, requireKey }: AdminTabProps) {
  const [sessionId, setSessionId] = useState('');
  const [participantId, setParticipantId] = useState('');
  const [status, setStatus] = useState<(typeof ATTENDANCE_STATUSES)[number]>('present');
  const [enforceEntitlement, setEnforceEntitlement] = useState(true);
  const [recordedBy, setRecordedBy] = useState('');
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
    if (!sessionId.trim() || !participantId.trim()) {
      setVariant('err');
      setMsg('session_id and participant_id are required.');
      return;
    }
    setLoading(true);
    setMsg(null);
    const body: Record<string, unknown> = {
      enforce_entitlement: enforceEntitlement,
      records: [
        {
          participant_id: participantId.trim(),
          status,
          ...(recordedBy.trim() ? { recorded_by: recordedBy.trim() } : {}),
        },
      ],
    };
    if (recordedBy.trim()) body.recorded_by = recordedBy.trim();

    const { ok, status: httpStatus, data } = await adminFetch<{
      upserted?: unknown[];
      blocked?: unknown[];
      error?: string;
    }>(
      apiBase,
      adminKey,
      `/api/admin/scheduling/sessions/${encodeURIComponent(sessionId.trim())}/attendance`,
      { method: 'POST', json: body },
    );
    setLoading(false);
    if (!ok) {
      setVariant('err');
      setMsg(`Error ${httpStatus}: ${data.error ?? JSON.stringify(data)}`);
      return;
    }
    setVariant('ok');
    setMsg(
      `Attendance saved. upserted: ${JSON.stringify(data.upserted ?? [])}${data.blocked?.length ? ` · blocked: ${JSON.stringify(data.blocked)}` : ''}`,
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Record attendance</CardTitle>
        <CardDescription>POST /api/admin/scheduling/sessions/:sessionId/attendance</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field id="att-session" label="Session ID">
            <Input id="att-session" value={sessionId} onChange={(e) => setSessionId(e.target.value)} />
          </Field>
          <Field id="att-participant" label="Participant ID">
            <Input id="att-participant" value={participantId} onChange={(e) => setParticipantId(e.target.value)} />
          </Field>
          <Field id="att-status" label="Status">
            <select
              id="att-status"
              className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value as (typeof ATTENDANCE_STATUSES)[number])}
            >
              {ATTENDANCE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enforceEntitlement}
              onChange={(e) => setEnforceEntitlement(e.target.checked)}
            />
            Enforce entitlement (can_attend_group_session for present)
          </label>
          <Field id="att-by" label="Recorded by (optional)">
            <Input id="att-by" value={recordedBy} onChange={(e) => setRecordedBy(e.target.value)} />
          </Field>
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving…' : 'Upsert attendance'}
          </Button>
        </form>
        <StatusMessage message={msg} variant={variant} />
      </CardContent>
    </Card>
  );
}
