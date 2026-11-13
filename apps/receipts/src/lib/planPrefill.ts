/**
 * Plan prefill for the Cash receipt card.
 *
 * Routes are final in TU-api PR #68 (not merged yet):
 *   GET /api/admin/billing/plans
 *   GET /api/admin/billing/subscriptions/current?participant_id=&account_id=
 *
 * Hide the picker and keep a manual amount when either call 404s or fails
 * so this front-end PR can merge before or after the API one.
 */
import { adminFetch } from '@/lib/admin-api';
import type { Connection } from '@/lib/finance';

export const ACTIVE_PLANS_PATH = '/api/admin/billing/plans';
export const CURRENT_PLAN_PATH = '/api/admin/billing/subscriptions/current';

export type Plan = {
  id: string;
  name: string;
  plan_category: string;
  billing_cadence: string;
  price_cents: number;
  is_active: boolean;
};

export type PlanPrefillIds = {
  participantId?: string | null;
  accountId?: string | null;
};

export type PlanPrefillResult<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'unavailable' }
  | { kind: 'aborted' };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asIntegerCents(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isInteger(n) && n >= 0) return n;
  }
  return null;
}

export function parsePlanRow(raw: unknown): Plan | null {
  const row = asRecord(raw);
  if (!row) return null;
  const id = asString(row.id);
  const name = asString(row.name);
  const price = asIntegerCents(row.price_cents);
  const planCategory = asString(row.plan_category);
  const billingCadence = asString(row.billing_cadence);
  if (!id || !name || price === null || !planCategory || !billingCadence) return null;
  return {
    id,
    name,
    plan_category: planCategory,
    billing_cadence: billingCadence,
    price_cents: price,
    is_active: row.is_active === true,
  };
}

function planListFromPayload(data: unknown): Plan[] {
  const payload = asRecord(data);
  if (!Array.isArray(payload?.plans)) return [];
  return payload.plans.map(parsePlanRow).filter((plan): plan is Plan => plan !== null);
}

function currentPlanFromPayload(data: unknown): Plan | null {
  const payload = asRecord(data);
  if (!payload || !('plan' in payload)) return null;
  return parsePlanRow(payload.plan);
}

export function currentPlanPath(ids: PlanPrefillIds): string | null {
  const params = new URLSearchParams();
  const participantId = ids.participantId?.trim();
  const accountId = ids.accountId?.trim();
  if (participantId) params.set('participant_id', participantId);
  if (accountId) params.set('account_id', accountId);
  if ([...params.keys()].length === 0) return null;
  return `${CURRENT_PLAN_PATH}?${params.toString()}`;
}

function isUnavailableStatus(status: number): boolean {
  return !status || status === 404 || status === 501 || status >= 400;
}

export function dollarsInputFromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export async function listActivePlans(
  connection: Connection,
  signal?: AbortSignal,
): Promise<PlanPrefillResult<Plan[]>> {
  if (signal?.aborted) return { kind: 'aborted' };
  try {
    const { ok, status, data } = await adminFetch(connection.apiBase, connection.adminKey, ACTIVE_PLANS_PATH, {
      signal,
    });
    if (signal?.aborted || status === 0) return { kind: 'aborted' };
    if (!ok || isUnavailableStatus(status)) return { kind: 'unavailable' };
    return { kind: 'ok', value: planListFromPayload(data) };
  } catch {
    if (signal?.aborted) return { kind: 'aborted' };
    return { kind: 'unavailable' };
  }
}

export async function getCurrentPlan(
  connection: Connection,
  ids: PlanPrefillIds,
  signal?: AbortSignal,
): Promise<PlanPrefillResult<Plan | null>> {
  if (signal?.aborted) return { kind: 'aborted' };
  const path = currentPlanPath(ids);
  if (!path) return { kind: 'ok', value: null };
  try {
    const { ok, status, data } = await adminFetch(connection.apiBase, connection.adminKey, path, { signal });
    if (signal?.aborted || status === 0) return { kind: 'aborted' };
    if (!ok || isUnavailableStatus(status)) return { kind: 'unavailable' };
    return { kind: 'ok', value: currentPlanFromPayload(data) };
  } catch {
    if (signal?.aborted) return { kind: 'aborted' };
    return { kind: 'unavailable' };
  }
}

export async function loadPlanPrefill(
  connection: Connection,
  ids: PlanPrefillIds,
  signal?: AbortSignal,
): Promise<PlanPrefillResult<{ current: Plan | null; plans: Plan[] }>> {
  const [plans, current] = await Promise.all([
    listActivePlans(connection, signal),
    getCurrentPlan(connection, ids, signal),
  ]);
  if (plans.kind === 'aborted' || current.kind === 'aborted') return { kind: 'aborted' };
  if (plans.kind === 'unavailable' && current.kind === 'unavailable') return { kind: 'unavailable' };
  const list = plans.kind === 'ok' ? [...plans.value] : [];
  const currentPlan = current.kind === 'ok' ? current.value : null;
  if (currentPlan && !list.some((plan) => plan.id === currentPlan.id)) {
    list.unshift(currentPlan);
  }
  return {
    kind: 'ok',
    value: { current: currentPlan, plans: list },
  };
}
