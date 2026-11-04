export const AUTH_ME_PATH = '/api/auth/me';
export const AUTH_LOGOUT_PATH = '/api/auth/logout';

export type AuthMeResponse = { email: string };

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

export async function authLogout(apiBase: string, signal?: AbortSignal): Promise<{ status: number }> {
  const base = apiBase.replace(/\/$/, '');
  const res = await fetch(`${base}${AUTH_LOGOUT_PATH}`, { method: 'POST', credentials: 'include', signal });
  return { status: res.status };
}

