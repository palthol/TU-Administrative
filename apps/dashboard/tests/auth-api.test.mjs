import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CSRF_FAILED_MESSAGE,
  SESSION_UNAVAILABLE_AFTER_LOGIN,
  SESSION_UNVERIFIED_AFTER_LOGIN,
  authLogin,
  authMe,
  completeLogin,
  decideSessionBootstrap,
  mapLoginFailure,
  signOut,
} from '../src/lib/auth-api.ts';

test('authMe sends credentials: include and returns ok on 200', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), 'http://localhost:3001/api/auth/me');
      assert.equal(init.method, 'GET');
      assert.equal(init.credentials, 'include');
      return new Response(JSON.stringify({ email: 'singh@templeunderground.com' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const result = await authMe('http://localhost:3001/');
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.data.email, 'singh@templeunderground.com');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('authLogin sends credentials: include with JSON body and returns 401 when rejected', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), 'http://localhost:3001/api/auth/login');
      assert.equal(init.method, 'POST');
      assert.equal(init.credentials, 'include');
      assert.equal(init.headers['content-type'] || init.headers['Content-Type'], 'application/json');
      assert.equal(init.body, JSON.stringify({ email: 'singh@templeunderground.com', password: 'bad' }));
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    };
    const result = await authLogin('http://localhost:3001', 'singh@templeunderground.com', 'bad');
    assert.equal(result.ok, false);
    assert.equal(result.status, 401);
    assert.equal(mapLoginFailure(result.status, result.data), 'That email/password was not accepted.');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('login maps 429 rate_limited, 503 provider-down, and 403 csrf_failed', async () => {
  assert.equal(
    mapLoginFailure(429, { error: 'rate_limited' }),
    'Too many sign-in attempts. Wait a moment and try again.',
  );
  assert.equal(
    mapLoginFailure(503, { error: 'unavailable' }),
    'Sign-in is temporarily unavailable. Try again shortly.',
  );
  assert.equal(mapLoginFailure(403, { error: 'csrf_failed' }), CSRF_FAILED_MESSAGE);
});

test('completeLogin succeeds only when login and /me both return 200', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), method: init.method, credentials: init.credentials });
      if (String(url).endsWith('/api/auth/login')) {
        return new Response(JSON.stringify({ email: 'singh@templeunderground.com' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ email: 'singh@templeunderground.com' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const result = await completeLogin(
      'http://localhost:3001',
      'singh@templeunderground.com',
      'password',
    );
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(
      calls.map((call) => call.url),
      ['http://localhost:3001/api/auth/login', 'http://localhost:3001/api/auth/me'],
    );
    assert.ok(calls.every((call) => call.credentials === 'include'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('completeLogin stays on the form when /me fails after login', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      if (String(url).endsWith('/api/auth/login')) {
        return new Response(JSON.stringify({ email: 'singh@templeunderground.com' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    };
    const result = await completeLogin(
      'http://localhost:3001',
      'singh@templeunderground.com',
      'password',
    );
    assert.deepEqual(result, { ok: false, message: SESSION_UNVERIFIED_AFTER_LOGIN });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('bootstrap redirects on 401 unless the request just came from login', () => {
  assert.deepEqual(decideSessionBootstrap(200, { fromLogin: false }), { kind: 'authenticated' });
  assert.deepEqual(decideSessionBootstrap(404, { fromLogin: false }), { kind: 'legacy' });
  assert.deepEqual(decideSessionBootstrap(401, { fromLogin: false }), { kind: 'redirect-login' });
  assert.deepEqual(decideSessionBootstrap(401, { fromLogin: true }), {
    kind: 'loop-blocked',
    message: SESSION_UNAVAILABLE_AFTER_LOGIN,
  });
});

test('signOut navigates only on 204 or 401; 403/5xx/network stay put', async () => {
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
