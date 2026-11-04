import assert from 'node:assert/strict';
import test from 'node:test';
import { authLogin, authMe, mapLoginFailure } from '../src/lib/auth-api.ts';

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

test('authLogin maps 429 rate_limited and 503 provider-down to friendly copy', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => {
      assert.equal(init.credentials, 'include');
      return new Response(JSON.stringify({ error: 'rate_limited' }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      });
    };
    const limited = await authLogin('http://localhost:3001', 'singh@templeunderground.com', 'password');
    assert.equal(limited.ok, false);
    assert.equal(limited.status, 429);
    assert.equal(
      mapLoginFailure(limited.status, limited.data),
      'Too many sign-in attempts. Wait a moment and try again.',
    );

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: 'unavailable' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    const down = await authLogin('http://localhost:3001', 'singh@templeunderground.com', 'password');
    assert.equal(down.status, 503);
    assert.equal(
      mapLoginFailure(down.status, down.data),
      'Sign-in is temporarily unavailable. Try again shortly.',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

