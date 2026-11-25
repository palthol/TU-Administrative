import { formatMoney, isDate } from "./operator.ts";

export const ENROLLMENT_BOARD_PATH = "/api/admin/billing/enrollment-board";
export const PLACEHOLDERS_PATH = "/api/admin/participants/placeholders";
export const SUBSCRIPTIONS_PATH = "/api/admin/billing/subscriptions";
export const PLANS_PATH = "/api/admin/billing/plans";

export const API_UNAVAILABLE_MESSAGE = "API not available yet";
export const ALREADY_ENROLLED_MESSAGE =
  "This person already has an active subscription. No new enrollment was created.";
export const NO_CHARGE_NOTE =
  "Creating a subscription does not create a charge.";

export const BOARD_STATUS_FILTERS = [
  "all",
  "enrolled",
  "unenrolled",
  "placeholder",
] as const;
export type BoardStatusFilter = (typeof BOARD_STATUS_FILTERS)[number];
export type BoardStatus = Exclude<BoardStatusFilter, "all">;

export type EnrollmentPlan = {
  id: string;
  name: string;
  plan_category: string;
  billing_cadence: string;
  price_cents: number;
  is_active: boolean;
};

export type EnrollmentSubscription = {
  id: string;
  plan_id: string | null;
  plan_name: string | null;
  status: string | null;
  start_date: string | null;
};

export type EnrollmentRow = {
  participant_id: string;
  first_name: string;
  last_name: string;
  is_placeholder: boolean;
  placeholder_reason: string | null;
  dob_is_placeholder: boolean;
  waiver_signed: boolean;
  account_id: string | null;
  account_name: string | null;
  subscription: EnrollmentSubscription | null;
};

export type EnrollmentCounts = {
  total: number;
  enrolled: number;
  unenrolled: number;
  placeholders: number;
};

export type EnrollmentBoard = {
  counts: EnrollmentCounts;
  rows: EnrollmentRow[];
};

export type EnrollmentAccountOption = {
  account_id: string;
  account_name: string;
};

export type EnrollmentFlags = {
  placeholder: boolean;
  placeholderReason: string | null;
  dobStandIn: boolean;
  noWaiver: boolean;
  enrolled: boolean;
};

export type FieldErrors = Partial<Record<string, string>>;

export type PlaceholderFormValues = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  dob_is_placeholder: boolean;
  dob_placeholder_reason: string;
  placeholder_reason: string;
  account_mode: "existing" | "new";
  account_id: string;
  account_name: string;
  plan_id: string;
  start_date: string;
};

export type PlaceholderRequest = {
  first_name: string;
  last_name: string;
  placeholder_reason: string;
  email?: string;
  phone?: string;
  date_of_birth?: string;
  dob_is_placeholder?: boolean;
  dob_placeholder_reason?: string;
  account_id?: string;
  account_name?: string;
  plan_id?: string;
  start_date?: string;
};

export type SubscriptionRequest = {
  participant_id: string;
  plan_id: string;
  account_id?: string;
  start_date?: string;
};

export type EnrollExistingFormValues = {
  participant_id: string;
  account_id: string;
  plan_id: string;
  start_date: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const EMPTY_PLACEHOLDER_FORM: PlaceholderFormValues = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  date_of_birth: "",
  dob_is_placeholder: false,
  dob_placeholder_reason: "",
  placeholder_reason: "",
  account_mode: "new",
  account_id: "",
  account_name: "",
  plan_id: "",
  start_date: "",
};

export function enrollmentBoardPath(filters: {
  status?: BoardStatusFilter;
  q?: string;
} = {}): string {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== "all") {
    params.set("status", filters.status);
  }
  const q = filters.q?.trim();
  if (q) params.set("q", q);
  const query = params.toString();
  return query ? `${ENROLLMENT_BOARD_PATH}?${query}` : ENROLLMENT_BOARD_PATH;
}

export function displayName(row: {
  first_name?: string | null;
  last_name?: string | null;
}): string {
  return `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
}

export function enrollmentFlags(row: EnrollmentRow): EnrollmentFlags {
  return {
    placeholder: row.is_placeholder === true,
    placeholderReason: row.is_placeholder
      ? row.placeholder_reason?.trim() || "No reason recorded"
      : null,
    dobStandIn: row.dob_is_placeholder === true,
    noWaiver: row.waiver_signed !== true,
    enrolled: row.subscription != null,
  };
}

export function enrollmentPlanLabel(row: EnrollmentRow): string {
  if (!row.subscription) return "Not enrolled";
  const plan = row.subscription.plan_name?.trim() || "Plan not named";
  const status = row.subscription.status?.trim();
  return status ? `${plan} · ${status.replaceAll("_", " ")}` : plan;
}

export function rowMatchesBoardFilter(
  row: EnrollmentRow,
  status: BoardStatusFilter,
  q: string,
): boolean {
  if (status === "enrolled" && !row.subscription) return false;
  if (status === "unenrolled" && row.subscription) return false;
  if (status === "placeholder" && !row.is_placeholder) return false;
  const query = q.trim().toLowerCase();
  if (!query) return true;
  return displayName(row).toLowerCase().includes(query);
}

export function filterBoardRows(
  rows: EnrollmentRow[],
  status: BoardStatusFilter,
  q: string,
): EnrollmentRow[] {
  return rows.filter((row) => rowMatchesBoardFilter(row, status, q));
}

export function uniqueAccounts(
  rows: EnrollmentRow[],
): EnrollmentAccountOption[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const id = row.account_id?.trim();
    if (!id) continue;
    const name = row.account_name?.trim() || id;
    if (!seen.has(id)) seen.set(id, name);
  }
  return [...seen.entries()]
    .map(([account_id, account_name]) => ({ account_id, account_name }))
    .sort((a, b) => a.account_name.localeCompare(b.account_name));
}

export function unenrolledMatches(
  rows: EnrollmentRow[],
  q: string,
): EnrollmentRow[] {
  const query = q.trim().toLowerCase();
  if (query.length < 2) return [];
  return rows
    .filter((row) => !row.subscription)
    .filter((row) => displayName(row).toLowerCase().includes(query))
    .slice(0, 25);
}

export function planOptionLabel(plan: EnrollmentPlan): string {
  const price = formatMoney(plan.price_cents);
  const cadence = plan.billing_cadence.replaceAll("_", " ");
  return `${plan.name} — ${price} · ${cadence}`;
}

function requiredName(value: string, label: string): string | undefined {
  return value.trim() ? undefined : `${label} is required.`;
}

function optionalEmail(value: string): string | undefined {
  const email = value.trim();
  if (!email) return undefined;
  return EMAIL_PATTERN.test(email) ? undefined : "Enter a valid email address.";
}

function optionalDate(value: string, label: string): string | undefined {
  const date = value.trim();
  if (!date) return undefined;
  return isDate(date) ? undefined : `${label} must be a valid date.`;
}

export function validatePlaceholderForm(
  form: PlaceholderFormValues,
): { ok: true; body: PlaceholderRequest } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const firstName = requiredName(form.first_name, "First name");
  const lastName = requiredName(form.last_name, "Last name");
  const reason = requiredName(form.placeholder_reason, "Placeholder reason");
  const email = optionalEmail(form.email);
  if (firstName) errors.first_name = firstName;
  if (lastName) errors.last_name = lastName;
  if (reason) errors.placeholder_reason = reason;
  if (email) errors.email = email;

  if (form.dob_is_placeholder) {
    const standIn = form.date_of_birth.trim();
    if (!standIn) errors.date_of_birth = "Stand-in date of birth is required.";
    else if (!isDate(standIn))
      errors.date_of_birth = "Stand-in date of birth must be a valid date.";
    if (!form.dob_placeholder_reason.trim()) {
      errors.dob_placeholder_reason =
        "A reason is required when using a stand-in date of birth.";
    }
  } else {
    const dob = optionalDate(form.date_of_birth, "Date of birth");
    if (dob) errors.date_of_birth = dob;
  }

  if (form.account_mode === "existing") {
    if (!form.account_id.trim())
      errors.account_id = "Choose an existing account.";
  } else if (!form.account_name.trim()) {
    errors.account_name = "New account name is required.";
  }

  const startDate = optionalDate(form.start_date, "Start date");
  if (startDate) errors.start_date = startDate;
  if (form.start_date.trim() && !form.plan_id.trim()) {
    errors.plan_id = "Choose a plan before setting a start date.";
  }

  if (Object.keys(errors).length) return { ok: false, errors };

  const body: PlaceholderRequest = {
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim(),
    placeholder_reason: form.placeholder_reason.trim(),
  };
  if (form.email.trim()) body.email = form.email.trim();
  if (form.phone.trim()) body.phone = form.phone.trim();
  if (form.date_of_birth.trim()) body.date_of_birth = form.date_of_birth.trim();
  if (form.dob_is_placeholder) {
    body.dob_is_placeholder = true;
    body.dob_placeholder_reason = form.dob_placeholder_reason.trim();
  }
  if (form.account_mode === "existing") body.account_id = form.account_id.trim();
  else body.account_name = form.account_name.trim();
  if (form.plan_id.trim()) {
    body.plan_id = form.plan_id.trim();
    if (form.start_date.trim()) body.start_date = form.start_date.trim();
  }
  return { ok: true, body };
}

export function validateEnrollExistingForm(
  form: EnrollExistingFormValues,
):
  | { ok: true; body: SubscriptionRequest }
  | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  if (!form.participant_id.trim())
    errors.participant_id = "Choose a person by name.";
  if (!form.plan_id.trim()) errors.plan_id = "Choose a plan.";
  const startDate = optionalDate(form.start_date, "Start date");
  if (startDate) errors.start_date = startDate;
  if (Object.keys(errors).length) return { ok: false, errors };
  const body: SubscriptionRequest = {
    participant_id: form.participant_id.trim(),
    plan_id: form.plan_id.trim(),
  };
  if (form.account_id.trim()) body.account_id = form.account_id.trim();
  if (form.start_date.trim()) body.start_date = form.start_date.trim();
  return { ok: true, body };
}

export function createdPlaceholderSummary(result: {
  first_name: string;
  last_name: string;
  enrolled: boolean;
  plan_name?: string | null;
  start_date?: string | null;
}): string {
  const name = displayName(result) || "Placeholder participant";
  if (!result.enrolled) {
    return `${name} was created as a placeholder. They are not enrolled yet.`;
  }
  const plan = result.plan_name?.trim() || "the selected plan";
  const start = result.start_date?.trim()
    ? ` from ${result.start_date.trim()}`
    : "";
  return `${name} was created as a placeholder and enrolled on ${plan}${start}. ${NO_CHARGE_NOTE}`;
}

export function enrolledPersonSummary(result: {
  first_name: string;
  last_name: string;
  plan_name?: string | null;
  start_date?: string | null;
}): string {
  const name = displayName(result) || "This person";
  const plan = result.plan_name?.trim() || "the selected plan";
  const start = result.start_date?.trim()
    ? ` from ${result.start_date.trim()}`
    : "";
  return `${name} is enrolled on ${plan}${start}. ${NO_CHARGE_NOTE}`;
}

export function isUnavailableStatus(status: number): boolean {
  return status === 0 || status === 404 || status === 501;
}

export function errorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const value = (data as { error?: unknown }).error;
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
}
