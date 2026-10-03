import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  displayDate,
  formatMoney,
  type Row,
  type Session,
} from "@/lib/operator";
import { Agenda } from "./Classes";
import {
  Limitation,
  Panel,
  ReadStatus,
  useEndpoint,
  type Connection,
} from "./shared";

export function Today({
  connection,
  today,
  month,
  setMonth,
  onPerson,
  onClass,
}: {
  connection: Connection;
  today: string;
  month: string;
  setMonth: (month: string) => void;
  onPerson: (name: string) => void;
  onClass: (session: Session) => void;
}) {
  return (
    <div className="stack">
      <div className="desk-grid">
        <div className="stack">
          <h2 className="section-label">Needs attention</h2>
          <Exceptions
            connection={connection}
            slug="waiver-compliance-gaps"
            onPerson={onPerson}
          />
          <Exceptions
            connection={connection}
            slug="upcoming-access-issues"
            onPerson={onPerson}
          />
        </div>
        <Agenda connection={connection} day={today} onOpen={onClass} />
      </div>
      <Monthly connection={connection} month={month} setMonth={setMonth} />
    </div>
  );
}

function Exceptions({
  connection,
  slug,
  onPerson,
}: {
  connection: Connection;
  slug: "waiver-compliance-gaps" | "upcoming-access-issues";
  onPerson: (name: string) => void;
}) {
  const state = useEndpoint<{ rows: Row[] }>(
    connection,
    `/api/admin/reporting/views/${slug}?limit=25&offset=0&order=asc`,
  );
  const rows = state.data?.rows;
  const waiver = slug === "waiver-compliance-gaps";
  return (
    <Panel
      title={waiver ? "Waiver follow-up" : "Access follow-up"}
      hint={
        waiver
          ? "Active enrollments with incomplete waiver records"
          : "Recorded upcoming attendance in the next 14 days"
      }
      action={
        <Button variant="ghost" onClick={state.retry} disabled={state.loading}>
          Refresh
        </Button>
      }
    >
      <ReadStatus state={state} />
      {rows?.length === 0 && (
        <p className="empty-state">No issues reported in this scope.</p>
      )}
      {rows?.map((row, i) => (
        <article className="attention-card" key={i}>
          <h3>{String(row.participant_name || "Name not returned")}</h3>
          <p>
            {waiver
              ? [
                  row.missing_waiver && "Missing signed waiver",
                  row.missing_emergency_contact && "Missing emergency contact",
                  row.missing_medical_history &&
                    "Waiver information incomplete",
                ]
                  .filter(Boolean)
                  .join(" · ") || "Waiver record needs review"
              : "Group access is unavailable for the recorded session"}
          </p>
          <p className="muted">
            {waiver
              ? `Latest waiver: ${displayDate(row.latest_waiver_at)}`
              : `Class: ${displayDate(row.next_session_starts_at, true)}`}
          </p>
          {typeof row.participant_name === "string" && (
            <Button
              variant="outline"
              onClick={() => onPerson(String(row.participant_name))}
            >
              Find participant
            </Button>
          )}
        </article>
      ))}
      <Limitation>
        First 25 report rows.{" "}
        {waiver
          ? "This report covers active enrollments, not every gym visitor."
          : "This report covers recorded attendance, not everyone who might attend. Debt and access are separate signals."}
      </Limitation>
    </Panel>
  );
}

export function Monthly({
  connection,
  month,
  setMonth,
}: {
  connection: Connection;
  month: string;
  setMonth: (month: string) => void;
}) {
  const state = useEndpoint<{ kpis: Row }>(
    connection,
    `/api/admin/reporting/summary/primary-kpis?month=${encodeURIComponent(month)}`,
  );
  const kpis = state.data?.kpis;
  const metrics = [
    [
      "Outstanding due in this month",
      "expected_revenue_open_due_cents",
      "Issued charges due in this month after allocations. Not a forecast.",
    ],
    [
      "Present check-ins",
      "total_visitors_present_checkins",
      "Recorded check-ins in the selected API month, not unique visitors.",
    ],
    [
      "Active monthly enrollments — now",
      "current_monthly_members_active_count",
      "Current active subscriptions, even when viewing a past month.",
    ],
  ];
  return (
    <Panel
      title="This month’s context"
      hint="API calendar-month definitions"
      action={
        <Button
          variant="outline"
          onClick={state.retry}
          disabled={state.loading}
        >
          Refresh summary
        </Button>
      }
    >
      <label htmlFor="summary-month">Summary month</label>
      <Input
        id="summary-month"
        className="month-input"
        type="month"
        value={month}
        onChange={(e) => {
          if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value))
            setMonth(e.target.value);
        }}
      />
      <ReadStatus state={state} />
      <div className="metric-grid">
        {metrics.map(([title, field, explanation]) => (
          <div className="metric" key={field}>
            <span>{title}</span>
            <strong>
              {kpis
                ? field.endsWith("_cents")
                  ? formatMoney(kpis[field])
                  : kpis[field] == null
                    ? "Unavailable"
                    : Number(kpis[field]).toLocaleString("en-US")
                : state.error
                  ? "Unavailable"
                  : "Loading…"}
            </strong>
            <p className="muted">{explanation}</p>
            {state.refreshed && (
              <small>
                Updated {state.refreshed.toLocaleTimeString("en-US")}
              </small>
            )}
          </div>
        ))}
      </div>
      <Limitation>
        Net cash and operating results are withheld pending full-refund
        reporting validation.
      </Limitation>
    </Panel>
  );
}
