export const AUTH_LOGIN_PATH = '/api/auth/login';
export const AUTH_ME_PATH = '/api/auth/me';
export const AUTH_LOGOUT_PATH = '/api/auth/logout';

export type AuthMeResponse = { email: string };
export type AuthLoginResponse = { email: string };

export type AuthResult<T> =
  | { ok: true; status: 200; data: T }
  | { ok: false; status: number; data: unknown };

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function errorKey(data: unknown): string | undefined {
  if (!data || typeof data !== 'object' || !('error' in data)) return undefined;
  const value = (data as { error?: unknown }).error;
  return typeof value === 'string' ? value : undefined;
}

/** Operator-facing copy for POST /api/auth/login failures. Auth state is never inferred from cookies. */
export function mapLoginFailure(status: number, data: unknown): string {
  if (status === 401) return 'That email/password was not accepted.';
  if (status === 404) return 'Sign-in is not enabled on this API yet.';
  if (status === 429 || errorKey(data) === 'rate_limited') {
    return 'Too many sign-in attempts. Wait a moment and try again.';
  }
  if (status === 503) return 'Sign-in is temporarily unavailable. Try again shortly.';
  return `Unable to sign in (HTTP ${status}).`;
}

export async function authMe(apiBase: string, signal?: AbortSignal): Promise<AuthResult<AuthMeResponse>> {
  const base = apiBase.replace(/\/$/, '');
  const res = await fetch(`${base}${AUTH_ME_PATH}`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  });
  // Session cookie is HttpOnly/host-only on the API origin. Never read document.cookie.
  const data = await readJson(res);
  if (res.status === 200) return { ok: true, status: 200, data: data as AuthMeResponse };
  return { ok: false, status: res.status, data };
}

export async function authLogin(
  apiBase: string,
  email: string,
  password: string,
  signal?: AbortSignal,
): Promise<AuthResult<AuthLoginResponse>> {
  const base = apiBase.replace(/\/$/, '');
  const res = await fetch(`${base}${AUTH_LOGIN_PATH}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
    signal,
  });
  const data = await readJson(res);
  if (res.status === 200) return { ok: true, status: 200, data: data as AuthLoginResponse };
  return { ok: false, status: res.status, data };
}

export async function authLogout(apiBase: string, signal?: AbortSignal): Promise<{ status: number }> {
  const base = apiBase.replace(/\/$/, '');
  const res = await fetch(`${base}${AUTH_LOGOUT_PATH}`, {
    method: 'POST',
    credentials: 'include',
    signal,
  });
  return { status: res.status };
}

