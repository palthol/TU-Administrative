export type ReturnToValidationOptions = {
  isDev: boolean;
  extraOrigins?: unknown;
};

export const DEFAULT_RETURN_TO_ORIGINS = [
  'https://admin.templeunderground.com',
  'https://finance.templeunderground.com',
  'https://waiverviewer.templeunderground.com',
] as const;

export function parseReturnToOrigins(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  const origins: string[] = [];
  for (const part of value.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    try {
      const url = new URL(trimmed);
      if (url.username || url.password) continue;
      if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
      origins.push(url.origin);
    } catch {
      continue;
    }
  }
  return origins;
}

function allowedOrigins(options: ReturnToValidationOptions): Set<string> {
  const extras = parseReturnToOrigins(options.extraOrigins).filter((origin) =>
    origin.startsWith('https://'),
  );
  return new Set<string>([...DEFAULT_RETURN_TO_ORIGINS, ...extras]);
}

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

  if (options.isDev && url.protocol === 'http:' && url.hostname === 'localhost') {
    return url.toString();
  }

  if (url.protocol !== 'https:') return null;
  if (allowedOrigins(options).has(url.origin)) return url.toString();
  return null;
}
