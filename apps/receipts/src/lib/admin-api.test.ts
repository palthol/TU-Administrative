import { describe, expect, it, vi } from 'vitest';
import { DEV_API_BASE_URL, PRODUCTION_API_BASE_URL, resolveApiBaseUrl } from './admin-api';
import { getDefaultLoginUrl } from './login-url';
import { adminFetch } from './admin-api';

describe('resolveApiBaseUrl', () => {
  it('prefers VITE_API_BASE_URL when set (trim + strip trailing slash)', () => {
    expect(resolveApiBaseUrl(' https://api.example.test/ ', false)).toBe('https://api.example.test');
    expect(resolveApiBaseUrl('http://localhost:3001///', true)).toBe('http://localhost:3001');
  });

  it('defaults by mode when VITE_API_BASE_URL is unset/blank', () => {
    expect(resolveApiBaseUrl(undefined, false)).toBe(PRODUCTION_API_BASE_URL);
    expect(resolveApiBaseUrl('   ', false)).toBe(PRODUCTION_API_BASE_URL);
    expect(resolveApiBaseUrl(undefined, true)).toBe(DEV_API_BASE_URL);
  });
});

describe('adminFetch SSO behavior', () => {
  it('includes credentials and redirects to login on 401 when no adminKey is provided', async () => {
    const originalFetch = globalThis.fetch;
    const originalLocation = globalThis.location;
    const assign = vi.fn();
    try {
      (globalThis as any).location = { href: 'https://finance.templeunderground.com/#cash', assign };
      globalThis.fetch = vi.fn(async (_url: any, init: any) => {
        expect(init.credentials).toBe('include');
        expect(init.headers?.['x-admin-key']).toBeUndefined();
        return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      }) as any;

      const result = await adminFetch('http://localhost:3001', '', '/api/admin/auth/me');
      expect(result.status).toBe(401);
      expect(assign).toHaveBeenCalledTimes(1);
      const redirectUrl = String(assign.mock.calls[0][0]);
      expect(redirectUrl.startsWith(`${getDefaultLoginUrl()}?`)).toBe(true);
      const parsed = new URL(redirectUrl);
      expect(parsed.searchParams.get('return_to')).toBe('https://finance.templeunderground.com/#cash');
    } finally {
      globalThis.fetch = originalFetch;
      (globalThis as any).location = originalLocation;
    }
  });

  it('does not redirect to login on 401 when arriving from_login=1', async () => {
    const originalFetch = globalThis.fetch;
    const originalLocation = globalThis.location;
    const assign = vi.fn();
    try {
      (globalThis as any).location = {
        href: 'https://finance.templeunderground.com/?from_login=1',
        assign,
      };
      globalThis.fetch = vi.fn(async () => {
        return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      }) as any;
      const result = await adminFetch('http://localhost:3001', '', '/api/admin/auth/me');
      expect(result.status).toBe(401);
      expect(assign).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
      (globalThis as any).location = originalLocation;
    }
  });
});

