import { describe, expect, it, vi } from 'vitest';
import type { ReceiptCardInput } from './receiptCard';
import {
  RECEIPT_PRINT_ATTR,
  buildReceiptCardModel,
  buildReceiptEmailSubject,
  buildReceiptMailtoHref,
  buildReceiptShareText,
  formatReceiptDateTime,
  printReceipt,
  receiptCardContainsDatabaseId,
  shortReceiptRef,
} from './receiptCard';

const ENTRY_ID = 'a1b2c3d4-e5f6-4789-8abc-def012345678';
const RECORDED_AT = new Date('2026-11-13T16:20:00.000Z');
const DATE_LINE = 'Nov 13, 2026 · 11:20 AM ET';

const sample: ReceiptCardInput = {
  personName: 'Alex Rivera',
  planName: 'Unlimited monthly',
  amountCents: 8900,
  paymentMethod: 'cash',
  receivedBy: 'Singh',
  recordedAt: RECORDED_AT,
  note: 'November dues',
  entryId: ENTRY_ID,
};

describe('shortReceiptRef', () => {
  it('uses a short gym prefix, not the database UUID', () => {
    expect(shortReceiptRef(ENTRY_ID)).toBe('TU-A1B2C3D4');
    expect(shortReceiptRef(ENTRY_ID)).not.toBe(ENTRY_ID);
  });
});

describe('formatReceiptDateTime', () => {
  it('formats one America/New_York line with ET, not EST/EDT', () => {
    expect(formatReceiptDateTime(RECORDED_AT)).toBe(DATE_LINE);
    expect(formatReceiptDateTime(RECORDED_AT)).not.toMatch(/EST|EDT|GMT/);
  });
});

describe('receipt card text', () => {
  it('shows gym, person, plan, amount, payment, received by, date, and note', () => {
    const card = buildReceiptCardModel(sample);
    expect(card.gymName).toBe('Temple Underground');
    expect(card.title).toBe('Receipt');
    expect(card.kicker).toBe('Temple Underground · Receipt');
    expect(card.amount).toBe('$89.00');
    expect(card.dateLine).toBe(DATE_LINE);
    expect(card.rows).toEqual([
      { label: 'Person', value: 'Alex Rivera' },
      { label: 'Plan', value: 'Unlimited monthly' },
      { label: 'Payment', value: 'Cash' },
      { label: 'Received by', value: 'Singh' },
      { label: 'Date', value: DATE_LINE },
      { label: 'Note', value: 'November dues' },
    ]);
    expect(card.receiptRef).toBe('TU-A1B2C3D4');
    expect(receiptCardContainsDatabaseId(card, ENTRY_ID)).toBe(false);
  });

  it('keeps plan and note rows when empty so print layout stays a 2×3 grid', () => {
    const card = buildReceiptCardModel({
      ...sample,
      planName: '  ',
      note: null,
    });
    expect(card.rows.map((row) => row.label)).toEqual([
      'Person',
      'Plan',
      'Payment',
      'Received by',
      'Date',
      'Note',
    ]);
    expect(card.rows.find((row) => row.label === 'Plan')?.value).toBe('');
    expect(card.rows.find((row) => row.label === 'Note')?.value).toBe('');
  });

  it('labels Cash App as two words', () => {
    const card = buildReceiptCardModel({ ...sample, paymentMethod: 'cashapp', planName: null, note: null });
    expect(card.rows.find((row) => row.label === 'Payment')?.value).toBe('Cash App');
  });
});

describe('share text', () => {
  it('is friendly receipt copy without database IDs', () => {
    const text = buildReceiptShareText(sample);
    expect(text).toBe(
      [
        'Temple Underground receipt',
        '',
        'Alex Rivera',
        'Unlimited monthly',
        'Amount received: $89.00',
        'Payment: Cash',
        'Received by Singh',
        DATE_LINE,
        'Note: November dues',
      ].join('\n'),
    );
    expect(text).not.toContain(ENTRY_ID);
    expect(text).not.toMatch(/Log entry ID/i);
  });

  it('omits plan and note lines when absent', () => {
    const text = buildReceiptShareText({ ...sample, planName: null, note: '' });
    expect(text).not.toContain('Unlimited monthly');
    expect(text).not.toContain('Note:');
  });
});

describe('mailto helper', () => {
  it('prefills subject and body, and the person email when present', () => {
    const subject = buildReceiptEmailSubject('Alex Rivera');
    const body = buildReceiptShareText(sample);
    const href = buildReceiptMailtoHref({
      to: 'alex@example.com',
      subject,
      body,
    });
    expect(subject).toBe('Temple Underground receipt — Alex Rivera');
    expect(href.startsWith('mailto:alex@example.com?')).toBe(true);
    const query = new URL(href).searchParams;
    expect(query.get('subject')).toBe(subject);
    expect(query.get('body')).toBe(body);
    expect(href).not.toContain(ENTRY_ID);
  });

  it('still builds a mailto when the person has no email', () => {
    const href = buildReceiptMailtoHref({
      to: '  ',
      subject: 'Temple Underground receipt',
      body: 'body',
    });
    expect(href.startsWith('mailto:?')).toBe(true);
    expect(href).toContain('subject=Temple%20Underground%20receipt');
    expect(href).toContain('body=body');
  });
});

describe('print helper', () => {
  it('invokes the provided print function', () => {
    const printFn = vi.fn();
    printReceipt(printFn);
    expect(printFn).toHaveBeenCalledTimes(1);
  });

  it('falls back to window.print', () => {
    const print = vi.fn();
    vi.stubGlobal('window', { print });
    printReceipt();
    expect(print).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('records two-copy vs single-copy print mode', () => {
    const setAttribute = vi.fn();
    vi.stubGlobal('document', { documentElement: { setAttribute } });
    const printFn = vi.fn();
    printReceipt(printFn, 'two');
    expect(setAttribute).toHaveBeenCalledWith(RECEIPT_PRINT_ATTR, 'two');
    printReceipt(printFn, 'single');
    expect(setAttribute).toHaveBeenCalledWith(RECEIPT_PRINT_ATTR, 'single');
    vi.unstubAllGlobals();
  });
});
