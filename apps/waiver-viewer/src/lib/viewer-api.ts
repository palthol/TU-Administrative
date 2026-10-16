export const PAGE_SIZE = 50;
export const READ_TIMEOUT_MS = 15_000;
export const WAIVER_LIST_PATH = '/api/admin/reporting/views/waiver-documents';
export const AUTH_ME_PATH = '/api/admin/auth/me';
export const SESSION_EXPIRED_EVENT = 'waiver-session-expired';
export const UNAVAILABLE_MESSAGE = 'Waivers unavailable. Retry.';
export const SUPPORTED_ROLES = ['owner', 'finance', 'front_desk'] as const;

export type SortMode = 'recent' | 'name';
export type WaiverSortColumn = 'signed_at_utc' | 'participant_full_name';
export type WaiverSortOrder = 'asc' | 'desc';
export type StaffRole = (typeof SUPPORTED_ROLES)[number];

export type Staff = {
  display_name: string;
  role: StaffRole;
  auth_method: string;
};

export const SORTS: Record<
  SortMode,
  { label: string; sort: WaiverSortColumn; order: WaiverSortOrder }
> = {
  recent: { label: 'Recent', sort: 'signed_at_utc', order: 'desc' },
  name: { label: 'A–Z', sort: 'participant_full_name', order: 'asc' },
};

export type WaiverListQuery = {
  sort: WaiverSortColumn;
  order: WaiverSortOrder;
  limit: number;
  offset: number;
  start?: string;
  end?: string;
};

export type AdminFetchResult<T = unknown> = {
  ok: boolean;
  status: number;
  data: T;
};

export class ViewerRequestError extends Error {
  readonly status: number;
  readonly errorKey: string | undefined;

  constructor(message: string, status: number, errorKey?: string) {
    super(message);
    this.name = 'ViewerRequestError';
    this.status = status;
    this.errorKey = errorKey;
  }
}

export function getDefaultApiBase(): string {
  const configured = import.meta.env?.VITE_API_BASE_URL;
  return typeof configured === 'string' && configured.trim()
    ? configured.replace(/\/$/, '')
    : 'http://localhost:3001';
}

function dateParam(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Query string for the waiver list. Only sort, order, limit, offset, and optional dates. */
export function buildWaiverDocumentsQuery(query: WaiverListQuery): string {
  const params = new URLSearchParams();
  params.set('sort', query.sort);
  params.set('order', query.order);
  params.set('limit', String(query.limit));
  params.set('offset', String(query.offset));
  const start = dateParam(query.start);
  const end = dateParam(query.end);
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  return `${WAIVER_LIST_PATH}?${params.toString()}`;
}

export function queryForSort(
  mode: SortMode,
  offset: number,
  start?: string,
  end?: string,
): string {
  const selected = SORTS[mode];
  return buildWaiverDocumentsQuery({
    sort: selected.sort,
    order: selected.order,
    limit: PAGE_SIZE,
    offset,
    start,
    end,
  });
}

export function mapViewerError(status: number): string {
  if (status === 401) return 'Session expired. Unlock to continue.';
  if (status === 403) return 'Your staff role cannot access waivers.';
  return UNAVAILABLE_MESSAGE;
}

export function isSupportedStaff(staff: Staff | undefined): staff is Staff {
  return Boolean(staff && SUPPORTED_ROLES.includes(staff.role));
}

function notifySessionExpired() {
  const target = globalThis.window;
  if (!target || typeof target.dispatchEvent !== 'function') return;
  target.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

export async function adminFetch<T = Record<string, unknown>>(
  apiBase: string,
  adminKey: string,
  path: string,
  options: { signal?: AbortSignal } = {},
): Promise<AdminFetchResult<T>> {
  const base = apiBase.replace(/\/$/, '');
  const headers: Record<string, string> = {};
  if (adminKey.trim()) headers['x-admin-key'] = adminKey.trim();
  try {
    const response = await fetch(`${base}${path}`, {
      method: 'GET',
      headers,
      cache: 'no-store',
      signal: options.signal,
    });
    const data = (await response.json().catch(() => ({}))) as T;
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    if (options.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      return { ok: false, status: 0, data: { error: 'aborted' } as T };
    }
    throw error;
  }
}

export async function viewerFetch<T extends { ok?: boolean; error?: string }>(
  apiBase: string,
  adminKey: string,
  path: string,
  options: { signal?: AbortSignal } = {},
): Promise<T> {
  const timeoutSignal = AbortSignal.timeout(READ_TIMEOUT_MS);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal;

  let result: AdminFetchResult<T>;
  try {
    result = await adminFetch<T>(apiBase, adminKey, path, { signal });
  } catch {
    throw new ViewerRequestError(UNAVAILABLE_MESSAGE, 0);
  }

  if (result.status === 0 && result.data.error === 'aborted') {
    throw new DOMException('The operation was aborted', 'AbortError');
  }

  if (result.status === 401 && adminKey.trim()) notifySessionExpired();

  const errorKey = typeof result.data.error === 'string' ? result.data.error : undefined;
  if (!result.ok || result.data.ok !== true) {
    throw new ViewerRequestError(mapViewerError(result.status), result.status, errorKey);
  }
  return result.data;
}
