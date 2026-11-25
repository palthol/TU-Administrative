import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ALREADY_ENROLLED_MESSAGE,
  API_UNAVAILABLE_MESSAGE,
  BOARD_STATUS_FILTERS,
  EMPTY_PLACEHOLDER_FORM,
  NO_CHARGE_NOTE,
  createdPlaceholderSummary,
  displayName,
  enrolledPersonSummary,
  enrollmentFlags,
  enrollmentPlanLabel,
  planOptionLabel,
  uniqueAccounts,
  unenrolledMatches,
  validateEnrollExistingForm,
  validatePlaceholderForm,
  type BoardStatusFilter,
  type EnrollmentPlan,
  type EnrollmentRow,
  type FieldErrors,
  type PlaceholderFormValues,
} from "@/lib/enrollment";
import {
  createEnrollmentSubscription,
  createPlaceholder,
  fetchEnrollmentBoard,
  listEnrollmentPlans,
  resultMessage,
} from "@/lib/enrollment-api";
import {
  Limitation,
  Panel,
  type Connection,
} from "./shared";

const FILTER_LABELS: Record<BoardStatusFilter, string> = {
  all: "All",
  enrolled: "Enrolled",
  unenrolled: "Unenrolled",
  placeholder: "Placeholders",
};

const COUNT_KEYS = [
  ["total", "Total", "all"],
  ["enrolled", "Enrolled", "enrolled"],
  ["unenrolled", "Unenrolled", "unenrolled"],
  ["placeholders", "Placeholders", "placeholder"],
] as const;

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="stack-field">
      <label htmlFor={id}>{label}</label>
      {hint ? (
        <p id={hintId} className="muted text-sm">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function PlaceholderBadge({ reason }: { reason: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="flag-wrap">
      <button
        type="button"
        className="flag-badge placeholder"
        title={reason}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        Placeholder
      </button>
      {open ? (
        <span id={id} className="flag-reason" role="note">
          {reason}
        </span>
      ) : null}
    </span>
  );
}

function RowFlags({ row }: { row: EnrollmentRow }) {
  const flags = enrollmentFlags(row);
  return (
    <div className="flag-row">
      {flags.placeholder && flags.placeholderReason ? (
        <PlaceholderBadge reason={flags.placeholderReason} />
      ) : null}
      {flags.dobStandIn ? (
        <span className="flag-badge dob">DOB stand-in</span>
      ) : null}
      {flags.noWaiver ? (
        <span className="flag-badge waiver">No waiver</span>
      ) : null}
    </div>
  );
}

function RowView({ row }: { row: EnrollmentRow }) {
  return (
    <>
      <strong>{displayName(row)}</strong>
      <RowFlags row={row} />
      <p className="muted text-sm">
        {row.account_name || "Account not recorded"}
      </p>
      <p>{enrollmentPlanLabel(row)}</p>
    </>
  );
}

export function Enrollment({ connection }: { connection: Connection }) {
  const { apiBase, adminKey } = connection;
  const [filter, setFilter] = useState<BoardStatusFilter>("all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [boardLoading, setBoardLoading] = useState(true);
  const [boardUnavailable, setBoardUnavailable] = useState(false);
  const [boardError, setBoardError] = useState("");
  const [rows, setRows] = useState<EnrollmentRow[]>([]);
  const [counts, setCounts] = useState({
    total: 0,
    enrolled: 0,
    unenrolled: 0,
    placeholders: 0,
  });
  const [unenrolledRows, setUnenrolledRows] = useState<EnrollmentRow[]>([]);
  const [plans, setPlans] = useState<EnrollmentPlan[]>([]);
  const [plansUnavailable, setPlansUnavailable] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    setBoardLoading(true);
    setBoardError("");
    setBoardUnavailable(false);
    void fetchEnrollmentBoard(
      connection,
      { status: filter, q: debouncedQuery },
      controller.signal,
    ).then((result) => {
      if (controller.signal.aborted || result.kind === "aborted") return;
      setBoardLoading(false);
      if (result.kind === "ok") {
        setRows(result.value.rows);
        setCounts(result.value.counts);
        return;
      }
      if (result.kind === "unavailable") {
        setBoardUnavailable(true);
        setRows([]);
        return;
      }
      setBoardError(resultMessage(result, "Unable to load the enrollment board."));
    });
    return () => controller.abort();
  }, [apiBase, adminKey, filter, debouncedQuery, retryCount]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchEnrollmentBoard(
      connection,
      { status: "unenrolled" },
      controller.signal,
    ).then((result) => {
      if (controller.signal.aborted || result.kind !== "ok") return;
      setUnenrolledRows(result.value.rows);
    });
    return () => controller.abort();
  }, [apiBase, adminKey, retryCount]);

  useEffect(() => {
    const controller = new AbortController();
    void listEnrollmentPlans(connection, controller.signal).then((result) => {
      if (controller.signal.aborted || result.kind === "aborted") return;
      if (result.kind === "ok") {
        setPlans(result.value.filter((plan) => plan.is_active));
        setPlansUnavailable(false);
        return;
      }
      if (result.kind === "unavailable") {
        setPlans([]);
        setPlansUnavailable(true);
      }
    });
    return () => controller.abort();
  }, [apiBase, adminKey, retryCount]);

  const accounts = useMemo(
    () => uniqueAccounts([...rows, ...unenrolledRows]),
    [rows, unenrolledRows],
  );

  return (
    <div className="stack enrollment-page">
      <Panel
        title="Enrollment board"
        hint="Placeholder participants and who is enrolled on a plan"
      >
        {boardLoading ? <p role="status">Loading enrollment board…</p> : null}
        {boardUnavailable ? (
          <div role="alert" className="unavailable-state">
            <p>{API_UNAVAILABLE_MESSAGE}</p>
            <p className="muted">
              Placeholder and subscription enrollment routes are not on this
              API yet. Retry after the TU-api enrollment PR is deployed.
            </p>
            <Button variant="outline" onClick={() => setRetryCount((n) => n + 1)}>
              Retry
            </Button>
          </div>
        ) : null}
        {boardError ? (
          <div role="alert">
            <p>{boardError}</p>
            <Button variant="outline" onClick={() => setRetryCount((n) => n + 1)}>
              Retry
            </Button>
          </div>
        ) : null}
        {!boardUnavailable ? (
          <>
            <div className="count-chips" role="group" aria-label="Enrollment counts">
              {COUNT_KEYS.map(([key, label, status]) => (
                <div className="count-chip" key={key}>
                  <span>{label}</span>
                  <strong>{counts[key]}</strong>
                  <span className="visually-hidden">
                    {status === "all"
                      ? "people on the board"
                      : FILTER_LABELS[status].toLowerCase()}
                  </span>
                </div>
              ))}
            </div>
            <div
              className="filter-tabs"
              role="tablist"
              aria-label="Filter enrollment board"
            >
              {BOARD_STATUS_FILTERS.map((status) => (
                <button
                  key={status}
                  type="button"
                  role="tab"
                  aria-selected={filter === status}
                  onClick={() => setFilter(status)}
                >
                  {FILTER_LABELS[status]}
                </button>
              ))}
            </div>
            <div className="stack-field">
              <label htmlFor="enrollment-search">Search by name</label>
              <Input
                id="enrollment-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoComplete="off"
                placeholder="Search names…"
              />
            </div>
            {!boardLoading && !boardError && rows.length === 0 ? (
              <p className="empty-state">No people match this filter.</p>
            ) : null}
            {rows.length > 0 ? (
              <>
                <div className="record-table">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Name</th>
                        <th scope="col">Flags</th>
                        <th scope="col">Account</th>
                        <th scope="col">Plan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.participant_id}>
                          <td>
                            <strong>{displayName(row)}</strong>
                          </td>
                          <td>
                            <RowFlags row={row} />
                          </td>
                          <td>{row.account_name || "Account not recorded"}</td>
                          <td>{enrollmentPlanLabel(row)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="record-cards">
                  {rows.map((row) => (
                    <article className="record-card" key={row.participant_id}>
                      <RowView row={row} />
                    </article>
                  ))}
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </Panel>
      <div className="desk-grid">
        <CreatePlaceholderForm
          connection={connection}
          accounts={accounts}
          plans={plans}
          plansUnavailable={plansUnavailable}
          onCreated={() => setRetryCount((n) => n + 1)}
        />
        <EnrollExistingForm
          connection={connection}
          unenrolledRows={unenrolledRows}
          plans={plans}
          plansUnavailable={plansUnavailable}
          onEnrolled={() => setRetryCount((n) => n + 1)}
        />
      </div>
    </div>
  );
}

function CreatePlaceholderForm({
  connection,
  accounts,
  plans,
  plansUnavailable,
  onCreated,
}: {
  connection: Connection;
  accounts: { account_id: string; account_name: string }[];
  plans: EnrollmentPlan[];
  plansUnavailable: boolean;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<PlaceholderFormValues>({
    ...EMPTY_PLACEHOLDER_FORM,
    account_mode: accounts.length ? "existing" : "new",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"ok" | "err">("ok");

  useEffect(() => {
    setForm((previous) => {
      if (previous.account_id || previous.account_name) return previous;
      return {
        ...previous,
        account_mode: accounts.length ? "existing" : "new",
      };
    });
  }, [accounts.length]);

  function update<K extends keyof PlaceholderFormValues>(
    key: K,
    value: PlaceholderFormValues[K],
  ) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const validated = validatePlaceholderForm(form);
    if (!validated.ok) {
      setErrors(validated.errors);
      setMessageKind("err");
      setMessage("Fix the highlighted fields before creating this placeholder.");
      return;
    }
    setErrors({});
    setSaving(true);
    setMessage("");
    const result = await createPlaceholder(connection, validated.body);
    setSaving(false);
    if (result.kind === "ok") {
      const created = result.value;
      setMessageKind("ok");
      setMessage(
        createdPlaceholderSummary({
          first_name: created.participant.first_name,
          last_name: created.participant.last_name,
          enrolled: Boolean(created.subscription),
          plan_name:
            created.subscription?.plan_name ||
            plans.find((plan) => plan.id === form.plan_id)?.name,
          start_date: created.subscription?.start_date || form.start_date,
        }),
      );
      setForm({
        ...EMPTY_PLACEHOLDER_FORM,
        account_mode: accounts.length ? "existing" : "new",
      });
      onCreated();
      return;
    }
    setMessageKind("err");
    setMessage(resultMessage(result, "Unable to create this placeholder."));
  }

  return (
    <Panel
      title="Create placeholder and enroll"
      hint="Add a stand-in person, optionally onto a plan. No charge is created."
    >
      <form onSubmit={onSubmit} className="stack" noValidate>
        <div className="field-grid">
          <Field id="placeholder-first" label="First name" error={errors.first_name}>
            <Input
              id="placeholder-first"
              autoComplete="off"
              value={form.first_name}
              aria-invalid={Boolean(errors.first_name)}
              onChange={(event) => update("first_name", event.target.value)}
            />
          </Field>
          <Field id="placeholder-last" label="Last name" error={errors.last_name}>
            <Input
              id="placeholder-last"
              autoComplete="off"
              value={form.last_name}
              aria-invalid={Boolean(errors.last_name)}
              onChange={(event) => update("last_name", event.target.value)}
            />
          </Field>
        </div>
        <Field id="placeholder-email" label="Email (optional)" error={errors.email}>
          <Input
            id="placeholder-email"
            type="email"
            autoComplete="off"
            value={form.email}
            aria-invalid={Boolean(errors.email)}
            onChange={(event) => update("email", event.target.value)}
          />
        </Field>
        <Field id="placeholder-phone" label="Phone (optional)">
          <Input
            id="placeholder-phone"
            type="tel"
            autoComplete="off"
            value={form.phone}
            onChange={(event) => update("phone", event.target.value)}
          />
        </Field>
        <label className="check-filter">
          <input
            type="checkbox"
            checked={form.dob_is_placeholder}
            onChange={(event) =>
              update("dob_is_placeholder", event.target.checked)
            }
          />
          Unknown DOB, use stand-in
        </label>
        <Field
          id="placeholder-dob"
          label={
            form.dob_is_placeholder
              ? "Stand-in date of birth"
              : "Date of birth (optional)"
          }
          error={errors.date_of_birth}
        >
          <Input
            id="placeholder-dob"
            type="date"
            value={form.date_of_birth}
            aria-invalid={Boolean(errors.date_of_birth)}
            onChange={(event) => update("date_of_birth", event.target.value)}
          />
        </Field>
        {form.dob_is_placeholder ? (
          <Field
            id="placeholder-dob-reason"
            label="Why is this date a stand-in?"
            error={errors.dob_placeholder_reason}
          >
            <Input
              id="placeholder-dob-reason"
              autoComplete="off"
              value={form.dob_placeholder_reason}
              aria-invalid={Boolean(errors.dob_placeholder_reason)}
              onChange={(event) =>
                update("dob_placeholder_reason", event.target.value)
              }
            />
          </Field>
        ) : null}
        <Field
          id="placeholder-reason"
          label="Placeholder reason"
          error={errors.placeholder_reason}
        >
          <Textarea
            id="placeholder-reason"
            value={form.placeholder_reason}
            aria-invalid={Boolean(errors.placeholder_reason)}
            onChange={(event) =>
              update("placeholder_reason", event.target.value)
            }
            rows={3}
          />
        </Field>
        <Field
          id="placeholder-account-mode"
          label="Account"
          error={errors.account_id || errors.account_name}
        >
          <select
            id="placeholder-account-mode"
            value={form.account_mode}
            onChange={(event) =>
              update(
                "account_mode",
                event.target.value === "existing" ? "existing" : "new",
              )
            }
          >
            <option value="existing">Use an existing account</option>
            <option value="new">Create a new account</option>
          </select>
        </Field>
        {form.account_mode === "existing" ? (
          <Field
            id="placeholder-account"
            label="Existing account"
            error={errors.account_id}
          >
            <select
              id="placeholder-account"
              value={form.account_id}
              aria-invalid={Boolean(errors.account_id)}
              onChange={(event) => update("account_id", event.target.value)}
            >
              <option value="">Choose an account</option>
              {accounts.map((account) => (
                <option key={account.account_id} value={account.account_id}>
                  {account.account_name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field
            id="placeholder-account-name"
            label="New account name"
            error={errors.account_name}
          >
            <Input
              id="placeholder-account-name"
              autoComplete="off"
              value={form.account_name}
              aria-invalid={Boolean(errors.account_name)}
              onChange={(event) => update("account_name", event.target.value)}
            />
          </Field>
        )}
        {plansUnavailable ? (
          <Limitation>
            Plan list is not available yet. You can still create a placeholder
            without enrolling.
          </Limitation>
        ) : (
          <Field id="placeholder-plan" label="Plan (optional)" error={errors.plan_id}>
            <select
              id="placeholder-plan"
              value={form.plan_id}
              aria-invalid={Boolean(errors.plan_id)}
              onChange={(event) => update("plan_id", event.target.value)}
            >
              <option value="">Do not enroll yet</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {planOptionLabel(plan)}
                </option>
              ))}
            </select>
          </Field>
        )}
        {form.plan_id ? (
          <Field id="placeholder-start" label="Start date" error={errors.start_date}>
            <Input
              id="placeholder-start"
              type="date"
              value={form.start_date}
              aria-invalid={Boolean(errors.start_date)}
              onChange={(event) => update("start_date", event.target.value)}
            />
          </Field>
        ) : null}
        <p className="scope-note">{NO_CHARGE_NOTE}</p>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Create placeholder"}
        </Button>
        {message ? (
          <p
            role="status"
            className={messageKind === "ok" ? "success-message" : undefined}
          >
            {message}
          </p>
        ) : null}
      </form>
    </Panel>
  );
}

function EnrollExistingForm({
  connection,
  unenrolledRows,
  plans,
  plansUnavailable,
  onEnrolled,
}: {
  connection: Connection;
  unenrolledRows: EnrollmentRow[];
  plans: EnrollmentPlan[];
  plansUnavailable: boolean;
  onEnrolled: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const [selected, setSelected] = useState<EnrollmentRow | null>(null);
  const [planId, setPlanId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"ok" | "err">("ok");
  const listId = "enroll-person-results";
  const inputRef = useRef<HTMLInputElement>(null);
  const matches = selected ? [] : unenrolledMatches(unenrolledRows, query);

  const choose = useCallback((row: EnrollmentRow) => {
    setSelected(row);
    setQuery(displayName(row));
    setActive(-1);
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const validated = validateEnrollExistingForm({
      participant_id: selected?.participant_id ?? "",
      account_id: selected?.account_id ?? "",
      plan_id: planId,
      start_date: startDate,
    });
    if (!validated.ok) {
      setErrors(validated.errors);
      setMessageKind("err");
      setMessage("Choose a person and a plan before enrolling.");
      return;
    }
    setErrors({});
    setSaving(true);
    setMessage("");
    const result = await createEnrollmentSubscription(
      connection,
      validated.body,
    );
    setSaving(false);
    if (result.kind === "ok") {
      setMessageKind("ok");
      setMessage(
        enrolledPersonSummary({
          first_name: selected?.first_name ?? "",
          last_name: selected?.last_name ?? "",
          plan_name:
            result.value.plan_name ||
            plans.find((plan) => plan.id === planId)?.name,
          start_date: result.value.start_date || startDate,
        }),
      );
      setSelected(null);
      setQuery("");
      setPlanId("");
      setStartDate("");
      onEnrolled();
      return;
    }
    setMessageKind("err");
    setMessage(
      result.kind === "conflict"
        ? ALREADY_ENROLLED_MESSAGE
        : resultMessage(result, "Unable to create this subscription."),
    );
  }

  return (
    <Panel
      title="Enroll existing person"
      hint="Name-based enrollment from people who are not on a plan"
    >
      <form onSubmit={onSubmit} className="stack" noValidate>
        <Field
          id="enroll-person"
          label="Person"
          hint="Type at least two letters. Matches unenrolled people on the board."
          error={errors.participant_id}
        >
          <Input
            id="enroll-person"
            ref={inputRef}
            value={query}
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={matches.length > 0}
            aria-controls={matches.length ? listId : undefined}
            aria-activedescendant={
              active >= 0 && matches[active]
                ? `enroll-person-${active}`
                : undefined
            }
            aria-invalid={Boolean(errors.participant_id)}
            placeholder="Avery Patel"
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(null);
              setActive(-1);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" && matches.length) {
                event.preventDefault();
                setActive((index) => (index + 1) % matches.length);
              }
              if (event.key === "ArrowUp" && matches.length) {
                event.preventDefault();
                setActive((index) =>
                  index <= 0 ? matches.length - 1 : index - 1,
                );
              }
              if (event.key === "Enter" && matches.length && active >= 0) {
                event.preventDefault();
                choose(matches[active]);
              }
              if (event.key === "Escape") {
                setQuery("");
                setSelected(null);
                setActive(-1);
              }
            }}
          />
        </Field>
        {matches.length > 0 ? (
          <div
            id={listId}
            role="listbox"
            aria-label="Unenrolled people"
            className="search-option-list"
          >
            {matches.map((row, index) => (
              <button
                type="button"
                role="option"
                id={`enroll-person-${index}`}
                key={row.participant_id}
                aria-selected={selected?.participant_id === row.participant_id}
                className={`person-result ${active === index ? "focused-result" : ""}`}
                onClick={() => choose(row)}
              >
                <strong>{displayName(row)}</strong>
                <span>{row.account_name || "Account not recorded"}</span>
              </button>
            ))}
          </div>
        ) : null}
        {selected ? (
          <p>
            Selected {displayName(selected)}
            {selected.account_name ? ` · ${selected.account_name}` : ""}
          </p>
        ) : null}
        {plansUnavailable ? (
          <Limitation>
            Plan list is not available yet. Enrollment needs GET
            /api/admin/billing/plans.
          </Limitation>
        ) : (
          <Field id="enroll-plan" label="Plan" error={errors.plan_id}>
            <select
              id="enroll-plan"
              value={planId}
              aria-invalid={Boolean(errors.plan_id)}
              onChange={(event) => setPlanId(event.target.value)}
            >
              <option value="">Choose a plan</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {planOptionLabel(plan)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field id="enroll-start" label="Start date (optional)" error={errors.start_date}>
          <Input
            id="enroll-start"
            type="date"
            value={startDate}
            aria-invalid={Boolean(errors.start_date)}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </Field>
        <p className="scope-note">{NO_CHARGE_NOTE}</p>
        <Button type="submit" disabled={saving || plansUnavailable}>
          {saving ? "Enrolling…" : "Enroll without charging"}
        </Button>
        {message ? (
          <p
            role="status"
            className={messageKind === "ok" ? "success-message" : undefined}
          >
            {message}
          </p>
        ) : null}
      </form>
    </Panel>
  );
}
