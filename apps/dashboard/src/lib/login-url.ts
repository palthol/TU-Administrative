export const PRODUCTION_LOGIN_URL = 'https://admin.templeunderground.com/login';
export const DEV_LOGIN_URL = 'http://localhost:5174/login';

function normalizedConfiguredLoginUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  return url.toString();
}

export function resolveLoginUrl(configured: unknown, isDev: boolean): string {
  return normalizedConfiguredLoginUrl(configured) ?? (isDev ? DEV_LOGIN_URL : PRODUCTION_LOGIN_URL);
}

export function getDefaultLoginUrl(): string {
  return resolveLoginUrl(import.meta.env?.VITE_LOGIN_URL, Boolean(import.meta.env?.DEV));
}

export const FROM_LOGIN_PARAM = 'from_login';

export function buildLoginRedirectUrl(loginUrl: string, returnTo: string): string {
  const target = new URL(loginUrl);
  target.searchParams.set('return_to', returnTo);
  return target.toString();
}

export function markFromLogin(url: string): string {
  const target = new URL(url);
  target.searchParams.set(FROM_LOGIN_PARAM, '1');
  return target.toString();
}

export function hasFromLoginFlag(href: string): boolean {
  try {
    return new URL(href).searchParams.get(FROM_LOGIN_PARAM) === '1';
  } catch {
    return false;
  }
}

export function redirectToLogin(returnTo: string): void {
  const loginUrl = getDefaultLoginUrl();
  const redirectUrl = buildLoginRedirectUrl(loginUrl, returnTo);
  globalThis.location?.assign(redirectUrl);
}

