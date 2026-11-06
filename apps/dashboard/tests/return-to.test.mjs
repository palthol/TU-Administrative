import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_RETURN_TO_ORIGINS,
  parseReturnToOrigins,
  validateReturnTo,
} from '../src/lib/return-to.ts';

test('production allowlist is the three deployed admin apps', () => {
  assert.deepEqual([...DEFAULT_RETURN_TO_ORIGINS], [
    'https://admin.templeunderground.com',
    'https://finance.templeunderground.com',
    'https://waiverviewer.templeunderground.com',
  ]);
});

test('validateReturnTo accepts exact production origins and paths', () => {
  assert.equal(
    validateReturnTo('https://admin.templeunderground.com/login', { isDev: false }),
    'https://admin.templeunderground.com/login',
  );
  assert.equal(
    validateReturnTo(' https://finance.templeunderground.com/#cash ', { isDev: false }),
    'https://finance.templeunderground.com/#cash',
  );
  assert.equal(
    validateReturnTo('https://waiverviewer.templeunderground.com/', { isDev: false }),
    'https://waiverviewer.templeunderground.com/',
  );
});

test('validateReturnTo rejects apex, sibling, and look-alike hosts', () => {
  assert.equal(validateReturnTo('https://templeunderground.com', { isDev: false }), null);
  assert.equal(validateReturnTo('https://signup.templeunderground.com', { isDev: false }), null);
  assert.equal(validateReturnTo('https://templeunderground.com.evil.com', { isDev: true }), null);
  assert.equal(validateReturnTo('https://admin.templeunderground.com.evil.com', { isDev: false }), null);
  assert.equal(validateReturnTo('https://evil.com', { isDev: true }), null);
});

test('validateReturnTo accepts localhost http only in dev', () => {
  assert.equal(
    validateReturnTo('http://localhost:5174/login', { isDev: true }),
    'http://localhost:5174/login',
  );
  assert.equal(validateReturnTo('http://localhost:5176/#cash', { isDev: true }), 'http://localhost:5176/#cash');
  assert.equal(validateReturnTo('http://localhost:5174/login', { isDev: false }), null);
});

test('validateReturnTo rejects evil schemes, protocol-relative URLs, and userinfo', () => {
  assert.equal(validateReturnTo('javascript:alert(1)', { isDev: true }), null);
  assert.equal(validateReturnTo('http://templeunderground.com', { isDev: true }), null);
  assert.equal(validateReturnTo('//admin.templeunderground.com/login', { isDev: true }), null);
  assert.equal(validateReturnTo('   ', { isDev: true }), null);
  assert.equal(validateReturnTo('https://templeunderground.com@evil.com/', { isDev: true }), null);
  assert.equal(validateReturnTo('https://user:pass@admin.templeunderground.com/', { isDev: true }), null);
});

test('VITE_RETURN_TO_ORIGINS adds extra https origins', () => {
  const extra = 'https://preview.templeunderground.com, https://user:x@evil.com, not-a-url';
  assert.deepEqual(parseReturnToOrigins(extra), ['https://preview.templeunderground.com']);
  assert.equal(
    validateReturnTo('https://preview.templeunderground.com/app', {
      isDev: false,
      extraOrigins: extra,
    }),
    'https://preview.templeunderground.com/app',
  );
  assert.equal(
    validateReturnTo('https://preview.templeunderground.com/app', { isDev: false }),
    null,
  );
});
