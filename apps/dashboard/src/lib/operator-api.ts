import { adminFetch } from "./admin-api";
import { agendaQuery, localSessions, type Session } from "./operator";

export async function readAdmin<T>(
  base: string,
  key: string,
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const timedSignal = AbortSignal.timeout(15000);
  const { ok, status, data } = await adminFetch<
    T & { ok?: boolean; error?: string }
  >(base, key, path, {
    signal: signal ? AbortSignal.any([signal, timedSignal]) : timedSignal,
  });
  if (status === 401)
    window.dispatchEvent(new Event("operator-session-expired"));
  if (!ok || data.ok !== true) {
    if (status === 401) throw new Error("Session expired. Unlock again.");
    if (status === 403)
      throw new Error("Your staff role cannot access this information.");
    throw new Error(`Unavailable: ${data.error || `HTTP ${status}`}.`);
  }
  const shape = data as Record<string, unknown>;
  const listPath =
    /\/participants\/search|\/reporting\/views\/|\/waivers\?|\/scheduling\/sessions\?|\/billing\/(operating-expenses|marketing-leads)/.test(
      path,
    );
  if (listPath && !Array.isArray(shape.rows))
    throw new Error(
      "The API returned an incomplete list. Retry or check the API version.",
    );
  if (
    path.includes("/summary/primary-kpis") &&
    (!shape.kpis || typeof shape.kpis !== "object")
  )
    throw new Error("The API returned an incomplete summary.");
  if (path.includes("/summary/primary-kpis")) {
    const kpis = shape.kpis as Record<string, unknown>;
    for (const field of [
      "expected_revenue_open_due_cents",
      "total_visitors_present_checkins",
      "current_monthly_members_active_count",
    ]) {
      const value = kpis[field];
      if (
        (typeof value !== "number" &&
          !(typeof value === "string" && /^\d+$/.test(value))) ||
        !Number.isSafeInteger(Number(value))
      )
        throw new Error("The API returned an incomplete summary.");
    }
  }
  if (
    /\/scheduling\/sessions\/[^?]+$/.test(path) &&
    (!shape.session || !Array.isArray(shape.attendance))
  )
    throw new Error("The API returned incomplete attendance.");
  return data;
}

export async function readAgenda(
  base: string,
  key: string,
  day: string,
  signal?: AbortSignal,
) {
  const rows: Session[] = [];
  for (let page = 0; page < 10; page++) {
    const data = await readAdmin<{ rows: Session[] }>(
      base,
      key,
      agendaQuery(day, page * 200),
      signal,
    );
    if (!Array.isArray(data.rows))
      throw new Error("Class response is incomplete.");
    rows.push(...data.rows);
    if (data.rows.length < 200)
      return { rows: localSessions(rows, day), partial: false };
  }
  return { rows: localSessions(rows, day), partial: true };
}
