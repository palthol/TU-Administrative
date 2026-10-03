import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { displayDate, isDate, type Session, type Row } from "@/lib/operator";
import { readAgenda } from "@/lib/operator-api";
import {
  Limitation,
  Panel,
  ReadStatus,
  useRead,
  useEndpoint,
  type Connection,
} from "./shared";

export function Agenda({
  connection,
  day,
  onOpen,
}: {
  connection: Connection;
  day: string;
  onOpen: (session: Session) => void;
}) {
  const { apiBase, adminKey } = connection;
  const load = useCallback(
    (signal: AbortSignal) => readAgenda(apiBase, adminKey, day, signal),
    [apiBase, adminKey, day],
  );
  const state = useRead(load, day);
  return (
    <Panel
      title="Classes"
      hint={`${displayDate(day)} • America/New_York`}
      action={
        <Button
          variant="outline"
          onClick={state.retry}
          disabled={state.loading}
        >
          Refresh classes
        </Button>
      }
    >
      <ReadStatus state={state} />
      {state.data?.partial && (
        <Limitation>
          Partial agenda: the two UTC days exceed the 2,000-record safety cap.
          Narrow scope with backend support before relying on this list.
        </Limitation>
      )}
      {state.data?.rows.length === 0 && (
        <p className="empty-state">
          No recorded class sessions for this local day.
        </p>
      )}
      <div className="agenda">
        {state.data?.rows.map((session) => (
          <article key={session.id} className="class-card">
            <p className="class-time">
              {new Date(session.starts_at).toLocaleTimeString("en-US", {
                timeZone: "America/New_York",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
            <div>
              <h3>{session.session_label || "Class"}</h3>
              <p className="muted">
                {session.cancelled_at ? "Cancelled" : "Scheduled"} · Ends{" "}
                {new Date(session.ends_at).toLocaleTimeString("en-US", {
                  timeZone: "America/New_York",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </div>
            <Button variant="outline" onClick={() => onOpen(session)}>
              View attendance
            </Button>
          </article>
        ))}
      </div>
    </Panel>
  );
}

export function Classes({
  connection,
  day,
  setDay,
  session,
  setSession,
}: {
  connection: Connection;
  day: string;
  setDay: (day: string) => void;
  session: Session | null;
  setSession: (session: Session | null) => void;
}) {
  const [draft, setDraft] = useState(day);
  useEffect(() => {
    setDraft(day);
  }, [day]);
  return (
    <div className="stack">
      <form
        className="date-filter"
        onSubmit={(e) => {
          e.preventDefault();
          if (isDate(draft)) {
            setDay(draft);
            setSession(null);
          }
        }}
      >
        <label htmlFor="class-day">Class date (New York)</label>
        <Input
          id="class-day"
          type="date"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button disabled={!isDate(draft)}>Apply date</Button>
      </form>
      <Agenda connection={connection} day={day} onOpen={setSession} />
      {session && (
        <Attendance
          connection={connection}
          session={session}
          onClose={() => setSession(null)}
        />
      )}
    </div>
  );
}

function Attendance({
  connection,
  session,
  onClose,
}: {
  connection: Connection;
  session: Session;
  onClose: () => void;
}) {
  const state = useEndpoint<{ session: Session; attendance: Row[] }>(
    connection,
    `/api/admin/scheduling/sessions/${encodeURIComponent(session.id)}`,
  );
  const rows = state.data?.attendance;
  return (
    <Panel
      title={`${session.session_label || "Class"} attendance`}
      hint={displayDate(session.starts_at, true)}
      action={
        <Button variant="ghost" onClick={onClose}>
          Close attendance
        </Button>
      }
    >
      <ReadStatus state={state} />
      <Limitation>
        Attendance updates are unavailable until the roster can identify
        participants by name and support reviewed access exceptions. Financial
        status does not establish permission to attend.
      </Limitation>
      {state.data?.session.cancelled_at && <p>Session cancelled.</p>}
      {rows && (
        <div className="metric-grid">
          {["present", "no_show", "cancelled"].map((status) => (
            <div className="metric" key={status}>
              <span>{status.replaceAll("_", " ")}</span>
              <strong>
                {rows.filter((row) => row.status === status).length}
              </strong>
            </div>
          ))}
        </div>
      )}
      {rows && (
        <p className="muted">
          {rows.length} saved attendance records. Participant names are not
          returned by this endpoint; individual records are withheld.
        </p>
      )}
      <Button variant="outline" onClick={state.retry} disabled={state.loading}>
        Refresh attendance
      </Button>
    </Panel>
  );
}
