export type ReturnToValidationOptions = {
  isDev: boolean;
};

const ALLOWED_HOST = 'templeunderground.com';

export function validateReturnTo(
  value: string | null | undefined,
  options: ReturnToValidationOptions,
): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.username || url.password) return null;

  const hostname = url.hostname.toLowerCase();
  if (url.protocol === 'https:') {
    if (hostname === ALLOWED_HOST || hostname.endsWith(`.${ALLOWED_HOST}`)) return url.toString();
    return null;
  }

  if (options.isDev && url.protocol === 'http:' && hostname === 'localhost') {
    return url.toString();
  }

  return null;
}

