export const GYM_TIMEZONE = "America/New_York";
export const SEARCH_LIMIT = 25;

export type Account = {
  account_id: string;
  role?: string | null;
  account_status?: string | null;
  account_primary_contact_name?: string | null;
};
export type Participant = {
  participant_id: string;
  full_name: string;
  email?: string | null;
  cell_phone?: string | null;
  home_phone?: string | null;
  account_count: number;
  preferred_account_id?: string | null;
  accounts?: Account[];
};
export type Staff = {
  display_name: string;
  role: "owner" | "finance" | "front_desk";
  auth_method: string;
};
export type Row = Record<string, unknown>;
export type Session = {
  id: string;
  starts_at: string;
  ends_at: string;
  session_label: string | null;
  cancelled_at: string | null;
};

export function localDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: GYM_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function isDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

// New York's local day intersects these two UTC dates, including DST transitions.
export function agendaQuery(day: string, offset = 0): string {
  if (!isDate(day)) throw new Error("Choose a valid class date.");
  const next = new Date(`${day}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return `/api/admin/scheduling/sessions?${new URLSearchParams({ start: day, end: next.toISOString().slice(0, 10), include_cancelled: "true", limit: "200", offset: String(offset) })}`;
}

export function localSessions(rows: Session[], day: string): Session[] {
  return rows
    .filter(
      (row) =>
        Number.isFinite(Date.parse(row.starts_at)) &&
        localDate(new Date(row.starts_at)) === day,
    )
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

export function searchPath(query: string): string | null {
  const q = query.trim();
  return q.length < 2
    ? null
    : `/api/admin/participants/search?${new URLSearchParams({ q, limit: String(SEARCH_LIMIT) })}`;
}

export function formatMoney(value: unknown): string {
  if (
    typeof value !== "number" &&
    !(typeof value === "string" && /^-?\d+$/.test(value))
  )
    return "Unavailable";
  const n = Number(value);
  return Number.isSafeInteger(n)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(n / 100)
    : "Unavailable";
}

export function displayDate(value: unknown, time = false): string {
  if (typeof value !== "string" || !value) return "Not recorded";
  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value,
  );
  if (!Number.isFinite(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: GYM_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(time ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(date);
}

export function cell(value: unknown, key: string): string {
  if (key.endsWith("_cents")) return formatMoney(value);
  if (value == null) return "Not recorded";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return "Details unavailable";
  if (
    key.endsWith("_at") ||
    key.endsWith("_date") ||
    key.endsWith("_start") ||
    key === "signed_at_utc"
  )
    return displayDate(value);
  return String(value).replaceAll("_", " ");
}

export function label(key: string): string {
  return key
    .replace(/_cents$/, "")
    .replaceAll("_", " ")
    .replace(/^./, (s) => s.toUpperCase());
}

export function receivableTotal(rows: Row[]): Row | undefined {
  // Never add the total rollup to the account rows or infer an unfetched total.
  return rows.find((row) => row.scope === "total");
}
