import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ACTIVE_PLANS_PATH,
  currentPlanPath,
  dollarsInputFromCents,
  getCurrentPlan,
  listActivePlans,
  loadPlanPrefill,
  parsePlanRow,
} from './planPrefill';

const connection = { apiBase: 'http://localhost:3001', adminKey: 'test-key' };
const PARTICIPANT_ID = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';

const BASIC_GROUP = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Basic Group Plan',
  plan_category: 'group',
  billing_cadence: 'monthly',
  price_cents: 10000,
  is_active: true,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('parsePlanRow', () => {
  it('reads the PR #68 plan object', () => {
    expect(parsePlanRow(BASIC_GROUP)).toEqual(BASIC_GROUP);
  });

  it('rejects incomplete rows', () => {
    expect(parsePlanRow({ id: 'x', name: 'Nope' })).toBeNull();
    expect(parsePlanRow({ ...BASIC_GROUP, price_cents: 12.5 })).toBeNull();
    expect(parsePlanRow(null)).toBeNull();
  });
});

describe('currentPlanPath', () => {
  it('requires at least one id and prefers sending both', () => {
    expect(currentPlanPath({})).toBeNull();
    expect(currentPlanPath({ participantId: PARTICIPANT_ID })).toBe(
      `/api/admin/billing/subscriptions/current?participant_id=${encodeURIComponent(PARTICIPANT_ID)}`,
    );
    expect(currentPlanPath({ accountId: ACCOUNT_ID })).toBe(
      `/api/admin/billing/subscriptions/current?account_id=${encodeURIComponent(ACCOUNT_ID)}`,
    );
    expect(currentPlanPath({ participantId: PARTICIPANT_ID, accountId: ACCOUNT_ID })).toBe(
      `/api/admin/billing/subscriptions/current?participant_id=${encodeURIComponent(PARTICIPANT_ID)}&account_id=${encodeURIComponent(ACCOUNT_ID)}`,
    );
  });
});

describe('dollarsInputFromCents', () => {
  it('formats a fillable amount string', () => {
    expect(dollarsInputFromCents(10000)).toBe('100.00');
    expect(dollarsInputFromCents(1500)).toBe('15.00');
  });
});

describe('plan prefill API fallback', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists active plans from GET /api/admin/billing/plans', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(String(url)).toBe(`http://localhost:3001${ACTIVE_PLANS_PATH}`);
      return jsonResponse(200, { ok: true, plans: [BASIC_GROUP] });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(listActivePlans(connection)).resolves.toEqual({ kind: 'ok', value: [BASIC_GROUP] });
  });

  it('reads a current plan, including plan: null', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(String(url)).toBe(`http://localhost:3001${currentPlanPath({ participantId: PARTICIPANT_ID })}`);
      return jsonResponse(200, { ok: true, plan: null });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(getCurrentPlan(connection, { participantId: PARTICIPANT_ID })).resolves.toEqual({
      kind: 'ok',
      value: null,
    });
  });

  it('hides the picker when the plans route is 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(404, { ok: false, error: 'not_found' })),
    );
    await expect(listActivePlans(connection)).resolves.toEqual({ kind: 'unavailable' });
    await expect(getCurrentPlan(connection, { participantId: PARTICIPANT_ID })).resolves.toEqual({
      kind: 'unavailable',
    });
  });

  it('hides the picker when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(500, { ok: false, error: 'internal_error' })),
    );
    await expect(listActivePlans(connection)).resolves.toEqual({ kind: 'unavailable' });
  });

  it('hides the picker when fetch throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    await expect(listActivePlans(connection)).resolves.toEqual({ kind: 'unavailable' });
  });

  it('still prefills from a current plan if the list endpoint is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('/billing/plans')) {
          return jsonResponse(404, { ok: false, error: 'not_found' });
        }
        return jsonResponse(200, { ok: true, plan: BASIC_GROUP });
      }),
    );

    const result = await loadPlanPrefill(connection, { participantId: PARTICIPANT_ID, accountId: ACCOUNT_ID });
    expect(result).toEqual({
      kind: 'ok',
      value: { current: BASIC_GROUP, plans: [BASIC_GROUP] },
    });
  });

  it('keeps the picker when plans succeed and current-plan fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/subscriptions/current')) {
          return jsonResponse(404, { ok: false, error: 'not_found' });
        }
        return jsonResponse(200, { ok: true, plans: [BASIC_GROUP] });
      }),
    );

    await expect(loadPlanPrefill(connection, { participantId: PARTICIPANT_ID })).resolves.toEqual({
      kind: 'ok',
      value: { current: null, plans: [BASIC_GROUP] },
    });
  });

  it('treats both endpoints missing as unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(404, { ok: false, error: 'not_found' })),
    );
    await expect(loadPlanPrefill(connection, { participantId: PARTICIPANT_ID })).resolves.toEqual({
      kind: 'unavailable',
    });
  });

  it('uses account_id for walk-ins and still lists plans', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const href = String(url);
      if (href.includes('/subscriptions/current')) {
        expect(href).toContain(`account_id=${encodeURIComponent(ACCOUNT_ID)}`);
        expect(href).not.toContain('participant_id=');
        return jsonResponse(200, { ok: true, plan: null });
      }
      return jsonResponse(200, { ok: true, plans: [BASIC_GROUP] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadPlanPrefill(connection, { accountId: ACCOUNT_ID });
    expect(result).toEqual({
      kind: 'ok',
      value: { current: null, plans: [BASIC_GROUP] },
    });
  });

  it('skips the current-plan call when neither id is present', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(String(url)).toBe(`http://localhost:3001${ACTIVE_PLANS_PATH}`);
      return jsonResponse(200, { ok: true, plans: [BASIC_GROUP] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadPlanPrefill(connection, {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ kind: 'ok', value: { current: null, plans: [BASIC_GROUP] } });
  });
});
