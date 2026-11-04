import { describe, expect, it } from 'vitest';
import { DEV_API_BASE_URL, PRODUCTION_API_BASE_URL, resolveApiBaseUrl } from './admin-api';

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

