import assert from 'node:assert/strict';
import test from 'node:test';
import { validateReturnTo } from '../src/lib/return-to.ts';

test('validateReturnTo accepts https templeunderground.com and subdomains', () => {
  assert.equal(
    validateReturnTo('https://templeunderground.com', { isDev: false }),
    'https://templeunderground.com/',
  );
  assert.equal(
    validateReturnTo('https://admin.templeunderground.com/login', { isDev: false }),
    'https://admin.templeunderground.com/login',
  );
  assert.equal(
    validateReturnTo(' https://finance.templeunderground.com/#cash ', { isDev: false }),
    'https://finance.templeunderground.com/#cash',
  );
});

test('validateReturnTo accepts localhost http only in dev', () => {
  assert.equal(
    validateReturnTo('http://localhost:5174/login', { isDev: true }),
    'http://localhost:5174/login',
  );
  assert.equal(validateReturnTo('http://localhost:5174/login', { isDev: false }), null);
});

test('validateReturnTo rejects evil hosts and non-https schemes', () => {
  assert.equal(validateReturnTo('javascript:alert(1)', { isDev: true }), null);
  assert.equal(validateReturnTo('https://templeunderground.com.evil.com', { isDev: true }), null);
  assert.equal(validateReturnTo('https://evil.com', { isDev: true }), null);
  assert.equal(validateReturnTo('http://templeunderground.com', { isDev: true }), null);
  assert.equal(validateReturnTo('//admin.templeunderground.com/login', { isDev: true }), null);
  assert.equal(validateReturnTo('   ', { isDev: true }), null);
});

test('validateReturnTo rejects URLs with basic auth', () => {
  assert.equal(
    validateReturnTo('https://templeunderground.com@evil.com/', { isDev: true }),
    null,
  );
  assert.equal(validateReturnTo('https://user:pass@admin.templeunderground.com/', { isDev: true }), null);
});

