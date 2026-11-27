export const AUTH_ME_PATH = '/api/auth/me';
export const AUTH_LOGOUT_PATH = '/api/auth/logout';

export const CSRF_FAILED_MESSAGE =
  'This request could not be verified. Refresh the page and try again.';
export const SESSION_UNAVAILABLE_AFTER_LOGIN =
  'Signed in, but this app could not load your session. Try signing in again.';

export type AuthMeResponse = { email: string };

export type AuthResult<T> =
  | { ok: true; status: 200; data: T }
  | { ok: false; status: number; data: unknown };

export type SessionBootstrap =
  | { kind: 'authenticated' }
  | { kind: 'legacy' }
  | { kind: 'redirect-login' }
  | { kind: 'loop-blocked'; message: string };

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export function errorKey(data: unknown): string | undefined {
  if (!data || typeof data !== 'object' || !('error' in data)) return undefined;
  const value = (data as { error?: unknown }).error;
  return typeof value === 'string' ? value : undefined;
}

export function isLogoutSuccess(status: number): boolean {
  return status === 204 || status === 401;
}

export function mapLogoutFailure(status: number, data: unknown): string {
  if (status === 403 && errorKey(data) === 'csrf_failed') return CSRF_FAILED_MESSAGE;
  if (status === 403) return 'You cannot sign out from here.';
  if (status >= 500 || status === 0) return 'Unable to sign out right now. Try again.';
  return `Unable to sign out (HTTP ${status}).`;
}

export function decideSessionBootstrap(
  meStatus: number,
  options: { fromLogin: boolean },
): SessionBootstrap {
  if (meStatus === 200) return { kind: 'authenticated' };
  if (meStatus === 404) return { kind: 'legacy' };
  if (meStatus === 401) {
    if (options.fromLogin) {
      return { kind: 'loop-blocked', message: SESSION_UNAVAILABLE_AFTER_LOGIN };
    }
    return { kind: 'redirect-login' };
  }
  return { kind: 'legacy' };
}

export async function authMe(apiBase: string, signal?: AbortSignal): Promise<AuthResult<AuthMeResponse>> {
  const base = apiBase.replace(/\/$/, '');
  const res = await fetch(`${base}${AUTH_ME_PATH}`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  });
  const data = await readJson(res);
  if (res.status === 200) return { ok: true, status: 200, data: data as AuthMeResponse };
  return { ok: false, status: res.status, data };
}

export async function authLogout(
  apiBase: string,
  signal?: AbortSignal,
): Promise<{ status: number; data: unknown }> {
  const base = apiBase.replace(/\/$/, '');
  const res = await fetch(`${base}${AUTH_LOGOUT_PATH}`, { method: 'POST', credentials: 'include', signal });
  const data = res.status === 204 ? {} : await readJson(res);
  return { status: res.status, data };
}

export async function signOut(
  apiBase: string,
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const result = await authLogout(apiBase, signal);
    if (isLogoutSuccess(result.status)) return { ok: true };
    return { ok: false, message: mapLogoutFailure(result.status, result.data) };
  } catch {
    return { ok: false, message: 'Unable to sign out. Check your connection and try again.' };
  }
}
