import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CSRF_FAILED_MESSAGE,
  SESSION_UNAVAILABLE_AFTER_LOGIN,
  decideSessionBootstrap,
  signOut,
} from '../src/lib/auth-api.ts';

test('bootstrap redirects on 401 unless the request just came from login', () => {
  assert.deepEqual(decideSessionBootstrap(200, { fromLogin: false }), { kind: 'authenticated' });
  assert.deepEqual(decideSessionBootstrap(404, { fromLogin: false }), { kind: 'legacy' });
  assert.deepEqual(decideSessionBootstrap(401, { fromLogin: false }), { kind: 'redirect-login' });
  assert.deepEqual(decideSessionBootstrap(401, { fromLogin: true }), {
    kind: 'loop-blocked',
    message: SESSION_UNAVAILABLE_AFTER_LOGIN,
  });
});

test('signOut treats 204 and 401 as success and stays on 403/5xx/network errors', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => {
      assert.equal(init.credentials, 'include');
      return new Response(null, { status: 204 });
    };
    assert.deepEqual(await signOut('http://localhost:3001'), { ok: true });

    globalThis.fetch = async () => new Response(null, { status: 401 });
    assert.deepEqual(await signOut('http://localhost:3001'), { ok: true });

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: 'csrf_failed' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });
    assert.deepEqual(await signOut('http://localhost:3001'), {
      ok: false,
      message: CSRF_FAILED_MESSAGE,
    });

    globalThis.fetch = async () => new Response('nope', { status: 500 });
    const serverError = await signOut('http://localhost:3001');
    assert.equal(serverError.ok, false);
    assert.match(serverError.message, /Unable to sign out/);

    globalThis.fetch = async () => {
      throw new TypeError('network down');
    };
    assert.deepEqual(await signOut('http://localhost:3001'), {
      ok: false,
      message: 'Unable to sign out. Check your connection and try again.',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
