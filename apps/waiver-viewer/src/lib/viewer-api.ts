export const PAGE_SIZE = 50;
export const READ_TIMEOUT_MS = 15_000;
export const VIEWER_WAIVERS_PATH = '/api/viewer/waiver-documents';
export const UNAVAILABLE_MESSAGE = 'Waivers unavailable. Retry.';

export type SortMode = 'recent' | 'name';
export type WaiverSortColumn = 'signed_at_utc' | 'participant_full_name';
export type WaiverSortOrder = 'asc' | 'desc';

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

function configuredApiBase(): string {
  const configured = import.meta.env?.VITE_API_BASE_URL;
  return typeof configured === 'string' ? configured.replace(/\/$/, '') : '';
}

export function viewerApiUrl(path: string): string {
  const base = configuredApiBase();
  if (base) return `${base}${path}`;
  return path;
}

function dateParam(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Query string for the viewer list. Only sort, order, limit, offset, and optional dates. */
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
  return `${VIEWER_WAIVERS_PATH}?${params.toString()}`;
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

export function mapViewerError(status: number, errorKey?: string): string {
  if (status === 401) return 'Sign in through Cloudflare Access, then reload.';
  if (status === 403) return 'This account is not on the waiver viewer allowlist.';
  if (
    status === 503 &&
    (errorKey === 'viewer_access_not_configured' ||
      errorKey === 'viewer_allowlist_not_configured')
  ) {
    return 'Viewer access is not configured on the API.';
  }
  return UNAVAILABLE_MESSAGE;
}

export async function viewerFetch<T extends { ok?: boolean; error?: string }>(
  path: string,
  options: { signal?: AbortSignal } = {},
): Promise<T> {
  const timeoutSignal = AbortSignal.timeout(READ_TIMEOUT_MS);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal;

  let response: Response;
  try {
    response = await fetch(viewerApiUrl(path), {
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ViewerRequestError(UNAVAILABLE_MESSAGE, 0);
  }

  const data = (await response.json().catch(() => ({}))) as T;
  const errorKey = typeof data.error === 'string' ? data.error : undefined;
  if (!response.ok || data.ok !== true) {
    throw new ViewerRequestError(
      mapViewerError(response.status, errorKey),
      response.status,
      errorKey,
    );
  }
  return data;
}
