import { describe, expect, it, vi } from 'vitest';
import {
  CSRF_FAILED_MESSAGE,
  SESSION_UNAVAILABLE_AFTER_LOGIN,
  decideSessionBootstrap,
  signOut,
} from './auth-api';

describe('session bootstrap', () => {
  it('redirects on 401 unless the request just came from login', () => {
    expect(decideSessionBootstrap(200, { fromLogin: false })).toEqual({ kind: 'authenticated' });
    expect(decideSessionBootstrap(404, { fromLogin: false })).toEqual({ kind: 'legacy' });
    expect(decideSessionBootstrap(401, { fromLogin: false })).toEqual({ kind: 'redirect-login' });
    expect(decideSessionBootstrap(401, { fromLogin: true })).toEqual({
      kind: 'loop-blocked',
      message: SESSION_UNAVAILABLE_AFTER_LOGIN,
    });
  });
});

describe('signOut', () => {
  it('treats 204 and 401 as success and keeps the user on 403/5xx/network errors', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = vi.fn(async () => new Response(null, { status: 204 })) as any;
      await expect(signOut('http://localhost:3001')).resolves.toEqual({ ok: true });

      globalThis.fetch = vi.fn(async () => new Response(null, { status: 401 })) as any;
      await expect(signOut('http://localhost:3001')).resolves.toEqual({ ok: true });

      globalThis.fetch = vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'csrf_failed' }), {
            status: 403,
            headers: { 'content-type': 'application/json' },
          }),
      ) as any;
      await expect(signOut('http://localhost:3001')).resolves.toEqual({
        ok: false,
        message: CSRF_FAILED_MESSAGE,
      });

      globalThis.fetch = vi.fn(async () => new Response('nope', { status: 503 })) as any;
      const serverError = await signOut('http://localhost:3001');
      expect(serverError).toEqual({
        ok: false,
        message: 'Unable to sign out right now. Try again.',
      });

      globalThis.fetch = vi.fn(async () => {
        throw new TypeError('network down');
      }) as any;
      await expect(signOut('http://localhost:3001')).resolves.toEqual({
        ok: false,
        message: 'Unable to sign out. Check your connection and try again.',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
