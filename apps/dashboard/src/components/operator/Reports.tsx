import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isDate, type Row } from "@/lib/operator";
import {
  ExternalToolLink,
  Limitation,
  Panel,
  ReadStatus,
  Records,
  useEndpoint,
  type Connection,
} from "./shared";

const reports = [
  {
    slug: "attendance-utilization-weekly",
    name: "Attendance by week",
    date: true,
    fields: [
      "week_start",
      "session_count",
      "present_count",
      "no_show_count",
      "cancelled_count",
      "unique_participants",
      "private_minutes_used",
    ],
  },
  {
    slug: "subscription-movement",
    name: "Enrollment movement",
    date: true,
    fields: [
      "month_start",
      "plan_name",
      "billing_cadence",
      "new_count",
      "cancelled_count",
      "paused_count",
      "expired_count",
    ],
  },
  {
    slug: "data-hygiene",
    name: "Data quality",
    date: true,
    fields: [
      "full_name",
      "created_at",
      "potential_duplicate_group_size",
      "account_member_count",
      "has_no_account_link",
      "has_waiver_without_account_link",
      "missing_email",
      "missing_phone",
    ],
  },
  {
    slug: "charge-net",
    name: "Charge breakdown",
    date: true,
    fields: [
      "charge_id",
      "account_id",
      "due_at",
      "gross_cents",
      "credit_applied_cents",
      "write_off_cents",
      "net_due_cents",
    ],
  },
  {
    slug: "entitlement-burn",
    name: "Access usage",
    date: false,
    fields: [
      "participant_name",
      "plan_name",
      "scope",
      "unit",
      "entitlement_limit",
      "used_quantity",
      "remaining",
      "overburn_risk",
    ],
  },
  {
    slug: "participant-entitlements",
    name: "Entitlement records",
    date: false,
    fields: [
      "participant_id",
      "scope",
      "unit",
      "remaining",
      "has_availability",
      "sessions_used",
      "minutes_used",
    ],
  },
  {
    slug: "affiliate-performance",
    name: "Referrals",
    date: true,
    fields: [
      "referrer_name",
      "total_referral_count",
      "active_referral_count",
      "credits_earned_cents",
      "credits_applied_cents",
      "outstanding_credit_liability_cents",
    ],
  },
  {
    slug: "orphan-waivers",
    name: "Unlinked waivers",
    date: true,
    fields: [
      "full_name",
      "email",
      "waiver_count",
      "latest_waiver_at",
      "first_waiver_at",
    ],
  },
  {
    slug: "orphan-waiver-summary",
    name: "Unlinked waiver summary",
    date: false,
    fields: ["orphan_waiver_participant_count"],
  },
  {
    slug: "payment-board",
    name: "Legacy enrollment payment context",
    date: true,
    fields: [
      "name",
      "next_due_date",
      "days_late",
      "expected_due_cents",
      "allocated_cents",
    ],
  },
  {
    slug: "payment-reminders",
    name: "Legacy enrollment reminders",
    date: true,
    fields: ["name", "next_due_date", "days_late", "reminder_bucket"],
  },
] as const;

export function More({
  connection,
  receiptsUrl,
  viewerUrl,
}: {
  connection: Connection;
  receiptsUrl: string | null;
  viewerUrl: string | null;
}) {
  const [slug, setSlug] = useState<string>(reports[0].slug);
  const [tool, setTool] = useState<"reports" | "expenses" | "leads">("reports");
  return (
    <div className="stack">
      <Panel
        title="Reports and tools"
        hint="Read-only operations, with explicit scope"
      >
        <div className="tool-grid">
          {(["reports", "expenses", "leads"] as const).map((t) => (
            <Button
              variant={tool === t ? "default" : "outline"}
              key={t}
              aria-pressed={tool === t}
              onClick={() => setTool(t)}
            >
              {t === "leads"
                ? "Trial inquiries"
                : t === "expenses"
                  ? "Operating expenses"
                  : "Reports"}
            </Button>
          ))}
        </div>
        <div className="actions">
          <ExternalToolLink href={receiptsUrl} label="Receipts tool" />
          <ExternalToolLink href={viewerUrl} label="Waiver review tool" />
        </div>
        <p className="muted">
          Separate tools retain their own authentication. Keys are never
          included in links.
        </p>
      </Panel>
      {tool === "reports" && (
        <>
          <label htmlFor="report-choice">Report</label>
          <select
            id="report-choice"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          >
            {reports.map((report) => (
              <option key={report.slug} value={report.slug}>
                {report.name}
              </option>
            ))}
          </select>
          <Report connection={connection} key={slug} slug={slug} />
        </>
      )}
      {tool === "expenses" && (
        <ReadOnlyList
          connection={connection}
          title="Operating expenses"
          path="/api/admin/billing/operating-expenses?limit=100"
          fields={[
            "expense_date",
            "category",
            "amount_cents",
            "vendor_name",
            "notes",
          ]}
        />
      )}
      {tool === "leads" && (
        <ReadOnlyList
          connection={connection}
          title="Trial inquiries"
          path="/api/admin/billing/marketing-leads?limit=100"
          fields={[
            "first_name",
            "last_name",
            "full_name",
            "name",
            "email",
            "phone",
            "discipline",
            "created_at",
          ]}
        />
      )}
      <Limitation>
        Cash and operating-delta reports are gated until full-refund correctness
        is validated. Specialist mutations and outbound notifications are not
        available in this release.
      </Limitation>
    </div>
  );
}

function ReadOnlyList({
  connection,
  title,
  path,
  fields,
}: {
  connection: Connection;
  title: string;
  path: string;
  fields: string[];
}) {
  const state = useEndpoint<{ rows: Row[] }>(connection, path);
  return (
    <Panel
      title={title}
      hint="Latest 100 records; this endpoint has no pagination or date filters"
      action={
        <Button
          variant="outline"
          onClick={state.retry}
          disabled={state.loading}
        >
          Refresh
        </Button>
      }
    >
      <ReadStatus state={state} />
      {state.data && <Records rows={state.data.rows} fields={fields} />}
      <Limitation>
        This is a bounded read, not a complete all-time history. Entry and
        correction workflows are deferred in this read-only release.
      </Limitation>
    </Panel>
  );
}

function Report({
  connection,
  slug,
}: {
  connection: Connection;
  slug: string;
}) {
  const report = reports.find((r) => r.slug === slug)!;
  const [offset, setOffset] = useState(0);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const query = new URLSearchParams({
    limit: "50",
    offset: String(offset),
    order: "desc",
  });
  if (start) query.set("start", start);
  if (end) query.set("end", end);
  const state = useEndpoint<{ rows: Row[] }>(
    connection,
    `/api/admin/reporting/views/${slug}?${query}`,
  );
  const validFilters =
    (!draftStart || isDate(draftStart)) &&
    (!draftEnd || isDate(draftEnd)) &&
    !(draftStart && draftEnd && draftStart > draftEnd);
  return (
    <Panel
      title={report.name}
      hint={`50 records per page • starting at ${offset + 1}`}
      action={
        <div className="actions">
          {report.date && (
            <Button
              variant="outline"
              onClick={() => {
                setDraftStart(start);
                setDraftEnd(end);
                dialog.current?.showModal();
              }}
            >
              Date filters
            </Button>
          )}
          <Button
            variant="outline"
            onClick={state.retry}
            disabled={state.loading}
          >
            Refresh report
          </Button>
        </div>
      }
    >
      <p className="muted">
        {start || end
          ? `Applied dates: ${start || "Any start"} through ${end || "Any end"}`
          : "No date filter applied."}{" "}
        Dates use this report’s API date column.
      </p>
      {slug === "orphan-waivers" && (
        <Limitation>
          For this timestamp report, the end date stops at midnight UTC on that
          date.
        </Limitation>
      )}
      {slug === "charge-net" && (
        <Limitation>
          Net due is after concessions and before payment allocations. It is not
          the remaining collectible balance.
        </Limitation>
      )}
      {slug.startsWith("payment-") && (
        <Limitation>
          Legacy subscription-linked context covers only the latest matching
          charge. It does not establish complete household debt or payment
          history and may omit recurring-agreement charges.
        </Limitation>
      )}
      <ReadStatus state={state} />
      {state.data && (
        <Records rows={state.data.rows} fields={[...report.fields]} />
      )}
      <div className="pagination">
        <Button
          variant="outline"
          disabled={!offset || state.loading}
          onClick={() => setOffset((n) => n - 50)}
        >
          Previous page
        </Button>
        <Button
          variant="outline"
          disabled={
            state.loading ||
            Boolean(state.error) ||
            !state.data ||
            state.data.rows.length < 50 ||
            offset >= 100000
          }
          onClick={() => setOffset((n) => n + 50)}
        >
          Next page
        </Button>
      </div>
      <Limitation>
        Returned row counts describe this page. No directory total, complete
        export or account filter is inferred.
      </Limitation>
      <dialog
        ref={dialog}
        className="filter-sheet"
        aria-labelledby="filter-title"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (validFilters) {
              setStart(draftStart);
              setEnd(draftEnd);
              setOffset(0);
              dialog.current?.close();
            }
          }}
        >
          <h2 id="filter-title">Filter {report.name}</h2>
          <label htmlFor="report-start">Start date</label>
          <Input
            id="report-start"
            type="date"
            value={draftStart}
            onChange={(e) => setDraftStart(e.target.value)}
          />
          <label htmlFor="report-end">End date</label>
          <Input
            id="report-end"
            type="date"
            value={draftEnd}
            onChange={(e) => setDraftEnd(e.target.value)}
          />
          {!validFilters && (
            <p role="alert">
              Enter valid dates with the end on or after the start.
            </p>
          )}
          <div className="actions">
            <Button disabled={!validFilters}>Apply filters</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDraftStart("");
                setDraftEnd("");
              }}
            >
              Clear
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => dialog.current?.close()}
            >
              Cancel
            </Button>
          </div>
        </form>
      </dialog>
    </Panel>
  );
}
