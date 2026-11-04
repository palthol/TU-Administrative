import assert from 'node:assert/strict';
import test from 'node:test';
import { adminFetch } from '../src/lib/admin-api.ts';
import {
  PRODUCTION_LOGIN_URL,
  buildLoginRedirectUrl,
  getDefaultLoginUrl,
  redirectToLogin,
  resolveLoginUrl,
} from '../src/lib/login-url.ts';

test('adminFetch always sends credentials: include', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => {
      assert.equal(init.credentials, 'include');
      assert.equal(init.headers['x-admin-key'], undefined);
      return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    };
    const result = await adminFetch('http://localhost:3001', '', '/api/admin/auth/me');
    assert.equal(result.status, 401);
    assert.equal(result.ok, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('401 redirect URL uses the login helper and current page as return_to', () => {
  const current = 'https://finance.templeunderground.com/#cash';
  const redirectUrl = buildLoginRedirectUrl(PRODUCTION_LOGIN_URL, current);
  const parsed = new URL(redirectUrl);
  assert.equal(parsed.origin + parsed.pathname, PRODUCTION_LOGIN_URL);
  assert.equal(parsed.searchParams.get('return_to'), current);
});

test('redirectToLogin assigns login?return_to=<current URL>', () => {
  const originalLocation = globalThis.location;
  const assigned = [];
  try {
    globalThis.location = {
      href: 'https://waiverviewer.templeunderground.com/',
      assign(url) {
        assigned.push(String(url));
      },
    };
    redirectToLogin(globalThis.location.href);
    assert.equal(assigned.length, 1);
    const parsed = new URL(assigned[0]);
    assert.equal(parsed.toString().startsWith(`${getDefaultLoginUrl()}?`), true);
    assert.equal(parsed.searchParams.get('return_to'), 'https://waiverviewer.templeunderground.com/');
  } finally {
    globalThis.location = originalLocation;
  }
});

test('resolveLoginUrl defaults to production admin login outside of dev', () => {
  assert.equal(resolveLoginUrl(undefined, false), PRODUCTION_LOGIN_URL);
  assert.equal(resolveLoginUrl(' https://admin.templeunderground.com/login ', false), PRODUCTION_LOGIN_URL);
});
