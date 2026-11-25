import { adminFetch } from "./admin-api.ts";
import {
  API_UNAVAILABLE_MESSAGE,
  ALREADY_ENROLLED_MESSAGE,
  PLACEHOLDERS_PATH,
  PLANS_PATH,
  SUBSCRIPTIONS_PATH,
  enrollmentBoardPath,
  errorMessage,
  isUnavailableStatus,
  type BoardStatusFilter,
  type EnrollmentBoard,
  type EnrollmentCounts,
  type EnrollmentPlan,
  type EnrollmentRow,
  type EnrollmentSubscription,
  type PlaceholderRequest,
  type SubscriptionRequest,
} from "./enrollment.ts";
import { hasFromLoginFlag, redirectToLogin } from "./login-url.ts";

type Connection = { apiBase: string; adminKey: string };

export type EnrollmentResult<T> =
  | { kind: "ok"; value: T }
  | { kind: "unavailable" }
  | { kind: "conflict"; error: string }
  | { kind: "error"; error: string }
  | { kind: "aborted" };

export type CreatedPlaceholder = {
  participant: {
    id: string;
    first_name: string;
    last_name: string;
    is_placeholder: boolean;
    placeholder_reason: string | null;
    dob_is_placeholder: boolean;
  };
  account_id: string | null;
  subscription: EnrollmentSubscription | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asIntegerCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0)
    return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isInteger(n) && n >= 0) return n;
  }
  return null;
}

function asCount(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0)
    return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value);
  }
  return 0;
}

export function parsePlanRow(raw: unknown): EnrollmentPlan | null {
  const row = asRecord(raw);
  if (!row) return null;
  const id = asString(row.id);
  const name = asString(row.name);
  const price = asIntegerCents(row.price_cents);
  const planCategory = asString(row.plan_category);
  const billingCadence = asString(row.billing_cadence);
  if (!id || !name || price === null || !planCategory || !billingCadence)
    return null;
  return {
    id,
    name,
    plan_category: planCategory,
    billing_cadence: billingCadence,
    price_cents: price,
    is_active: row.is_active === true,
  };
}

export function parseSubscription(
  raw: unknown,
): EnrollmentSubscription | null {
  if (raw == null) return null;
  const row = asRecord(raw);
  if (!row) return null;
  const id = asString(row.id) || asString(row.subscription_id);
  if (!id) return null;
  return {
    id,
    plan_id: asString(row.plan_id) || asString(row.plan_definition_id),
    plan_name: asString(row.plan_name),
    status: asString(row.status),
    start_date: asString(row.start_date) || asString(row.starts_at),
  };
}

export function parseEnrollmentRow(raw: unknown): EnrollmentRow | null {
  const row = asRecord(raw);
  if (!row) return null;
  const participantId =
    asString(row.participant_id) || asString(row.id);
  const firstName = asString(row.first_name);
  const lastName = asString(row.last_name);
  if (!participantId || !firstName || !lastName) return null;
  return {
    participant_id: participantId,
    first_name: firstName,
    last_name: lastName,
    is_placeholder: asBoolean(row.is_placeholder),
    placeholder_reason: asString(row.placeholder_reason),
    dob_is_placeholder: asBoolean(row.dob_is_placeholder),
    waiver_signed: asBoolean(row.waiver_signed),
    account_id: asString(row.account_id),
    account_name: asString(row.account_name),
    subscription: parseSubscription(row.subscription),
  };
}

function parseCounts(raw: unknown, rows: EnrollmentRow[]): EnrollmentCounts {
  const counts = asRecord(raw);
  if (!counts) {
    return {
      total: rows.length,
      enrolled: rows.filter((row) => row.subscription).length,
      unenrolled: rows.filter((row) => !row.subscription).length,
      placeholders: rows.filter((row) => row.is_placeholder).length,
    };
  }
  return {
    total: asCount(counts.total),
    enrolled: asCount(counts.enrolled),
    unenrolled: asCount(counts.unenrolled),
    placeholders: asCount(counts.placeholders),
  };
}

export function parseEnrollmentBoard(data: unknown): EnrollmentBoard | null {
  const payload = asRecord(data);
  if (!payload || !Array.isArray(payload.rows)) return null;
  const rows = payload.rows
    .map(parseEnrollmentRow)
    .filter((row): row is EnrollmentRow => row !== null);
  return { counts: parseCounts(payload.counts, rows), rows };
}

function noteUnauthorized(adminKey: string): string {
  if (adminKey.trim()) {
    globalThis.window?.dispatchEvent(new Event("operator-session-expired"));
    return "Session expired. Unlock again.";
  }
  if (hasFromLoginFlag(globalThis.location?.href ?? "")) {
    return "Signed in, but this app could not load your session. Try signing in again.";
  }
  const returnTo = globalThis.location?.href ?? "";
  if (returnTo) redirectToLogin(returnTo);
  return "Unauthorized.";
}

function classifyFailure(
  status: number,
  data: unknown,
  adminKey: string,
  options: { conflict?: boolean } = {},
): Exclude<EnrollmentResult<never>, { kind: "ok"; value: never }> {
  if (status === 401) {
    return { kind: "error", error: noteUnauthorized(adminKey) };
  }
  if (status === 403) {
    return {
      kind: "error",
      error: "Your staff role cannot access this information.",
    };
  }
  if (options.conflict && status === 409) {
    return { kind: "conflict", error: ALREADY_ENROLLED_MESSAGE };
  }
  if (isUnavailableStatus(status)) return { kind: "unavailable" };
  return {
    kind: "error",
    error: errorMessage(data, `HTTP ${status}`),
  };
}

async function enrollmentFetch<T>(
  connection: Connection,
  path: string,
  options: {
    method?: string;
    json?: unknown;
    signal?: AbortSignal;
    map: (data: unknown) => T | null;
    conflict?: boolean;
    incomplete: string;
  },
): Promise<EnrollmentResult<T>> {
  if (options.signal?.aborted) return { kind: "aborted" };
  try {
    const timed = AbortSignal.timeout(15000);
    const { ok, status, data } = await adminFetch(
      connection.apiBase,
      connection.adminKey,
      path,
      {
        method: options.method,
        json: options.json,
        signal: options.signal
          ? AbortSignal.any([options.signal, timed])
          : timed,
      },
    );
    if (options.signal?.aborted) return { kind: "aborted" };
    const payload = asRecord(data);
    if (!ok || payload?.ok === false) {
      return classifyFailure(status, data, connection.adminKey, {
        conflict: options.conflict,
      });
    }
    const value = options.map(data);
    if (value == null) return { kind: "error", error: options.incomplete };
    return { kind: "ok", value };
  } catch (error) {
    if (options.signal?.aborted) return { kind: "aborted" };
    if (error instanceof Error && error.name === "AbortError") {
      return { kind: "aborted" };
    }
    if (error instanceof Error && error.name === "TimeoutError") {
      return { kind: "unavailable" };
    }
    return { kind: "unavailable" };
  }
}

export async function fetchEnrollmentBoard(
  connection: Connection,
  filters: { status?: BoardStatusFilter; q?: string } = {},
  signal?: AbortSignal,
): Promise<EnrollmentResult<EnrollmentBoard>> {
  return enrollmentFetch(connection, enrollmentBoardPath(filters), {
    signal,
    incomplete: "The enrollment board response was incomplete.",
    map: parseEnrollmentBoard,
  });
}

export async function listEnrollmentPlans(
  connection: Connection,
  signal?: AbortSignal,
): Promise<EnrollmentResult<EnrollmentPlan[]>> {
  return enrollmentFetch(connection, PLANS_PATH, {
    signal,
    incomplete: "The plan list response was incomplete.",
    map: (data) => {
      const payload = asRecord(data);
      if (!Array.isArray(payload?.plans)) return [];
      return payload.plans
        .map(parsePlanRow)
        .filter((plan): plan is EnrollmentPlan => plan !== null);
    },
  });
}

function parseCreatedPlaceholder(data: unknown): CreatedPlaceholder | null {
  const payload = asRecord(data);
  if (!payload) return null;
  const participant = asRecord(payload.participant);
  if (!participant) return null;
  const id = asString(participant.id) || asString(participant.participant_id);
  const firstName = asString(participant.first_name);
  const lastName = asString(participant.last_name);
  if (!id || !firstName || !lastName) return null;
  return {
    participant: {
      id,
      first_name: firstName,
      last_name: lastName,
      is_placeholder: asBoolean(participant.is_placeholder),
      placeholder_reason: asString(participant.placeholder_reason),
      dob_is_placeholder: asBoolean(participant.dob_is_placeholder),
    },
    account_id: asString(payload.account_id),
    subscription: parseSubscription(payload.subscription),
  };
}

export async function createPlaceholder(
  connection: Connection,
  body: PlaceholderRequest,
  signal?: AbortSignal,
): Promise<EnrollmentResult<CreatedPlaceholder>> {
  return enrollmentFetch(connection, PLACEHOLDERS_PATH, {
    method: "POST",
    json: body,
    signal,
    incomplete: "The placeholder was created, but the response was incomplete.",
    map: parseCreatedPlaceholder,
  });
}

export async function createEnrollmentSubscription(
  connection: Connection,
  body: SubscriptionRequest,
  signal?: AbortSignal,
): Promise<EnrollmentResult<EnrollmentSubscription>> {
  return enrollmentFetch(connection, SUBSCRIPTIONS_PATH, {
    method: "POST",
    json: body,
    signal,
    conflict: true,
    incomplete: "The subscription was created, but the response was incomplete.",
    map: (data) => {
      const payload = asRecord(data);
      if (!payload) return null;
      return parseSubscription(payload.subscription ?? payload);
    },
  });
}

export function resultMessage(
  result: EnrollmentResult<unknown>,
  fallback: string,
): string {
  if (result.kind === "unavailable") return API_UNAVAILABLE_MESSAGE;
  if (result.kind === "conflict" || result.kind === "error") return result.error;
  return fallback;
}

export { PLACEHOLDERS_PATH, PLANS_PATH, SUBSCRIPTIONS_PATH };
