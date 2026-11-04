import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEV_API_BASE_URL,
  PRODUCTION_API_BASE_URL,
  resolveApiBaseUrl,
} from '../src/lib/admin-api.ts';

test('resolveApiBaseUrl prefers VITE_API_BASE_URL when set (trim + strip trailing slash)', () => {
  assert.equal(resolveApiBaseUrl(' https://api.example.test/ ', false), 'https://api.example.test');
  assert.equal(resolveApiBaseUrl('http://localhost:3001///', true), 'http://localhost:3001');
});

test('resolveApiBaseUrl defaults by mode when VITE_API_BASE_URL is unset/blank', () => {
  assert.equal(resolveApiBaseUrl(undefined, false), PRODUCTION_API_BASE_URL);
  assert.equal(resolveApiBaseUrl('   ', false), PRODUCTION_API_BASE_URL);
  assert.equal(resolveApiBaseUrl(undefined, true), DEV_API_BASE_URL);
});

