const LOOPBACK_HOST =
  /^(localhost|.*\.localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|::1)$/i;

export const RECEIPTS_PRODUCTION_URL = "https://finance.templeunderground.com";
export const WAIVER_VIEWER_PRODUCTION_URL =
  "https://waiverviewer.templeunderground.com";

function normalizedHttpUrl(
  value: string | undefined,
  allowLoopback: boolean,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!allowLoopback && LOOPBACK_HOST.test(host)) return null;
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${path}${url.search}`;
}

/**
 * Prefer an explicit public URL. Loopback values are development-only: a
 * production build skips them and uses the deployed tool, or no link at all
 * when that destination is not a public URL either.
 */
export function resolveToolLink(
  configured: string | undefined,
  fallback: string,
  allowLoopback: boolean,
): string | null {
  return (
    normalizedHttpUrl(configured, allowLoopback) ??
    normalizedHttpUrl(fallback, allowLoopback)
  );
}

export function toolLinkLabel(label: string, href: string | null): string {
  return href ? `${label} ↗` : `${label} unavailable`;
}
