import { Button } from "@/components/ui/button";
import {
  formatMoney,
  receivableTotal,
  type Account,
  type Row,
} from "@/lib/operator";
import {
  ExternalToolLink,
  Limitation,
  Panel,
  ReadStatus,
  Records,
  useEndpoint,
  type Connection,
} from "./shared";

export function Billing({
  connection,
  payer,
  onPeople,
  receiptsUrl,
}: {
  connection: Connection;
  payer: Account | null;
  onPeople: () => void;
  receiptsUrl: string | null;
}) {
  const state = useEndpoint<{ rows: Row[] }>(
    connection,
    "/api/admin/reporting/views/ar-aging?limit=500&offset=0&order=desc",
  );
  const rows = state.data?.rows;
  const total = rows && receivableTotal(rows);
  const payerRow =
    payer &&
    rows?.find(
      (row) => row.scope === "account" && row.account_id === payer.account_id,
    );
  const risks = useEndpoint<{ rows: Row[] }>(
    connection,
    "/api/admin/reporting/views/payment-risk?limit=50&offset=0&order=desc",
  );
  const matchingRisks = risks.data?.rows.filter(
    (row) => !payer || row.account_id === payer.account_id,
  );
  return (
    <div className="stack">
      <Panel
        title={payer?.account_primary_contact_name || "Payer account context"}
        hint={
          payer
            ? `Linked account • ${payer.account_status || "Status not returned"}`
            : "Choose a payer through participant lookup"
        }
        action={
          <Button variant="outline" onClick={onPeople}>
            Find a payer
          </Button>
        }
      >
        <ReadStatus state={state} />
        {payer && (
          <>
            <h3>Outstanding across issued charges</h3>
            <p className="large-amount">
              {payerRow
                ? formatMoney(payerRow.total_outstanding_cents)
                : "Unavailable"}
            </p>
            {payerRow && (
              <Records
                rows={[payerRow]}
                fields={[
                  "open_item_count",
                  "bucket_0_30_cents",
                  "bucket_31_60_cents",
                  "bucket_61_90_cents",
                  "bucket_90_plus_cents",
                ]}
              />
            )}
            <Limitation>
              {payerRow
                ? "Account balance shown once. The 0–30 day bucket includes amounts not yet overdue."
                : "This payer has no row in the loaded report scope. This is not evidence of no debt."}{" "}
              Linked participant context does not establish a complete household
              or statement.
            </Limitation>
          </>
        )}
        {!payer && (
          <p>
            Search for a participant, then explicitly choose one of their linked
            payer accounts.
          </p>
        )}
        <Button
          variant="outline"
          onClick={state.retry}
          disabled={state.loading}
        >
          Refresh payer balances
        </Button>
      </Panel>
      <Panel
        title="Receivables overview"
        hint="At most 500 report rows; the total rollup is shown separately"
      >
        <p className="large-amount">
          {total
            ? formatMoney(total.total_outstanding_cents)
            : state.loading
              ? "Loading…"
              : "Unavailable"}
        </p>
        <p className="muted">
          Outstanding across all issued non-void charges, including
          not-yet-overdue balances. No rollup is inferred if the server total is
          outside this page.
        </p>
        {total && (
          <Records
            rows={[total]}
            fields={[
              "open_item_count",
              "bucket_0_30_cents",
              "bucket_31_60_cents",
              "bucket_61_90_cents",
              "bucket_90_plus_cents",
            ]}
          />
        )}
      </Panel>
      <Panel
        title="Payment allocation review"
        hint="First 50 report rows • a partial charge allocation can be a normal partial payment"
        action={
          <Button
            variant="outline"
            onClick={risks.retry}
            disabled={risks.loading}
          >
            Refresh payment review
          </Button>
        }
      >
        <ReadStatus state={risks} />
        {matchingRisks && (
          <Records
            rows={matchingRisks}
            fields={[
              "risk_type",
              "payment_id",
              "charge_id",
              "due_at",
              "gap_cents",
              "days_past_due",
            ]}
            empty="No payment exceptions in this loaded scope."
          />
        )}
        <Limitation>
          {payer
            ? "Filtered locally to the explicitly selected payer within this page."
            : "Unscoped read-only report; payer identities are unavailable here. Select a payer to narrow the loaded page."}{" "}
          This report is not payment history or a complete collection queue.
        </Limitation>
      </Panel>
      <Panel
        title="Financial actions"
        hint="Payment recording and changes are unavailable in this interim release"
      >
        <p>
          Payment entry needs a complete payer statement with charge coverage,
          adjustments, allocations and authoritative remaining balances.
          Enrollment needs current plans and enrollment records. Recurring
          agreements need a verified backend release. Refunds, write-offs and
          merges need history and impact review.
        </p>
        <Limitation>
          Global charge generation affects eligible accounts across the gym. It
          is not an account-level action and is not exposed here.
        </Limitation>
        <ExternalToolLink
          href={receiptsUrl}
          label="Open separate receipts tool"
        />
        <p className="muted text-sm">
          Authenticate separately. Personal cash logs and invoices are separate
          bookkeeping records; marking an invoice paid does not allocate a
          formal payment. The existing tool retains its documented billing
          limitations.
        </p>
      </Panel>
    </div>
  );
}
