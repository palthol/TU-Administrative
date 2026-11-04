import { buildLoginRedirectUrl, getDefaultLoginUrl } from './login-url';

export type AdminFetchResult<T = unknown> = {
  ok: boolean;
  status: number;
  data: T;
};

export const DEV_API_BASE_URL = 'http://localhost:3001';
export const PRODUCTION_API_BASE_URL = 'https://api.templeunderground.com';

function normalizedApiBaseUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, '');
}

export function resolveApiBaseUrl(configured: unknown, isDev: boolean): string {
  return normalizedApiBaseUrl(configured) ?? (isDev ? DEV_API_BASE_URL : PRODUCTION_API_BASE_URL);
}

export function getDefaultApiBase(): string {
  return resolveApiBaseUrl(import.meta.env?.VITE_API_BASE_URL, Boolean(import.meta.env?.DEV));
}

export async function adminFetch<T = Record<string, unknown>>(
  apiBase: string,
  adminKey: string,
  path: string,
  options: {
    method?: string;
    json?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<AdminFetchResult<T>> {
  const base = apiBase.replace(/\/$/, '');
  const headers: Record<string, string> = {};
  if (adminKey.trim()) {
    headers['x-admin-key'] = adminKey.trim();
  }
  let body: string | undefined;
  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.json);
  }
  try {
    const res = await fetch(`${base}${path}`, {
      method: options.method || 'GET',
      headers,
      body,
      signal: options.signal,
      credentials: 'include',
    });
    const data = (await res.json().catch(() => ({}))) as T;
    if (res.status === 401) {
      if (adminKey.trim()) {
        window.dispatchEvent(new Event('finance-session-expired'));
      } else if (typeof globalThis.location?.assign === 'function') {
        const redirectUrl = buildLoginRedirectUrl(getDefaultLoginUrl(), globalThis.location.href);
        globalThis.location.assign(redirectUrl);
      }
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    if (options.signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
      return { ok: false, status: 0, data: { error: 'aborted' } as T };
    }
    throw err;
  }
}
