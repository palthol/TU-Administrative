import { describe, expect, it } from 'vitest';
import {
  destinationFromHashValue,
  operatorError,
  parseDollarsToCents,
} from './finance';

describe('destinationFromHashValue', () => {
  it('defaults to Cash', () => {
    expect(destinationFromHashValue('')).toBe('Cash');
    expect(destinationFromHashValue('#unknown')).toBe('Cash');
  });

  it('maps each destination hash', () => {
    expect(destinationFromHashValue('#cash')).toBe('Cash');
    expect(destinationFromHashValue('#invoice')).toBe('Invoice');
    expect(destinationFromHashValue('#recent')).toBe('Recent');
    expect(destinationFromHashValue('#formal')).toBe('Formal');
    expect(destinationFromHashValue('#more')).toBe('More');
  });
});

describe('parseDollarsToCents', () => {
  it('parses currency-ish input', () => {
    expect(parseDollarsToCents('12.34')).toBe(1234);
    expect(parseDollarsToCents('$1,200.50')).toBe(120050);
  });

  it('rejects non-positive amounts', () => {
    expect(parseDollarsToCents('0')).toBeNull();
    expect(parseDollarsToCents('-3')).toBeNull();
    expect(parseDollarsToCents('abc')).toBeNull();
  });
});

describe('operatorError', () => {
  it('maps auth and migration-ish failures', () => {
    expect(operatorError(401, {})).toMatch(/Session expired/);
    expect(operatorError(403, {})).toMatch(/staff role/);
    expect(operatorError(500, { error: 'relation personal_finance_entries does not exist' })).toMatch(/0017/);
  });
});
