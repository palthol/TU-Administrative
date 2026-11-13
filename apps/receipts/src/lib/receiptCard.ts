import { PAYMENT_METHOD_LABEL, type PaymentMethod } from '@/lib/finance';
import { formatUsdFromCents } from '@/lib/shareFormats';

export const GYM_NAME = 'Temple Underground';
export const RECEIPT_TIME_ZONE = 'America/New_York';
export const RECEIPT_KICKER = 'Temple Underground · Receipt';
export const RECEIPT_MEMBER_KICKER = 'Temple Underground · Receipt · Member Copy';
export const RECEIPT_GYM_KICKER = 'Temple Underground · Receipt · Gym Copy';
export const RECEIPT_PRINT_ATTR = 'data-receipt-print';

export type ReceiptPrintCopies = 'two' | 'single';

export type ReceiptCardInput = {
  personName: string;
  planName?: string | null;
  amountCents: number;
  paymentMethod: PaymentMethod;
  receivedBy: string;
  recordedAt: Date;
  note?: string | null;
  entryId: string;
};

export type ReceiptCardRow = {
  label: string;
  value: string;
};

export type ReceiptCardModel = {
  gymName: string;
  title: string;
  kicker: string;
  memberKicker: string;
  gymKicker: string;
  amount: string;
  dateLine: string;
  rows: ReceiptCardRow[];
  receiptRef: string;
};

const UUID_LIKE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function shortReceiptRef(entryId: string): string {
  const hex = entryId.replace(/-/g, '').replace(/[^0-9a-f]/gi, '').slice(0, 8).toUpperCase();
  return hex ? `TU-${hex}` : '';
}

export function formatReceiptDateTime(recordedAt: Date, timeZone = RECEIPT_TIME_ZONE): string {
  const datePart = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(recordedAt);
  const timePart = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(recordedAt);
  return `${datePart} · ${timePart} ET`;
}

export function paymentModeLabel(method: PaymentMethod): string {
  return PAYMENT_METHOD_LABEL[method];
}

export function buildReceiptCardModel(input: ReceiptCardInput): ReceiptCardModel {
  const dateLine = formatReceiptDateTime(input.recordedAt);
  return {
    gymName: GYM_NAME,
    title: 'Receipt',
    kicker: RECEIPT_KICKER,
    memberKicker: RECEIPT_MEMBER_KICKER,
    gymKicker: RECEIPT_GYM_KICKER,
    amount: formatUsdFromCents(input.amountCents),
    dateLine,
    rows: [
      { label: 'Person', value: input.personName.trim() },
      { label: 'Plan', value: input.planName?.trim() ?? '' },
      { label: 'Payment', value: paymentModeLabel(input.paymentMethod) },
      { label: 'Received by', value: input.receivedBy.trim() },
      { label: 'Note', value: input.note?.trim() ?? '' },
    ],
    receiptRef: shortReceiptRef(input.entryId),
  };
}

export function receiptCardContainsDatabaseId(model: ReceiptCardModel, entryId: string): boolean {
  const haystack = [
    model.gymName,
    model.title,
    model.kicker,
    model.amount,
    model.dateLine,
    model.receiptRef,
    ...model.rows.map((row) => `${row.label} ${row.value}`),
  ].join('\n');
  if (UUID_LIKE.test(haystack)) return true;
  const id = entryId.trim();
  return Boolean(id) && haystack.includes(id);
}

export function buildReceiptShareText(input: ReceiptCardInput): string {
  const plan = input.planName?.trim();
  const note = input.note?.trim();
  const lines = [
    `${GYM_NAME} receipt`,
    '',
    input.personName.trim(),
    ...(plan ? [plan] : []),
    `Amount received: ${formatUsdFromCents(input.amountCents)}`,
    `Payment: ${paymentModeLabel(input.paymentMethod)}`,
    `Received by ${input.receivedBy.trim()}`,
    formatReceiptDateTime(input.recordedAt),
    ...(note ? [`Note: ${note}`] : []),
  ];
  return lines.join('\n');
}

export function buildReceiptEmailSubject(personName: string): string {
  const who = personName.trim();
  return who ? `${GYM_NAME} receipt — ${who}` : `${GYM_NAME} receipt`;
}

export function buildReceiptMailtoHref(params: {
  to?: string | null;
  subject: string;
  body: string;
}): string {
  const query = `subject=${encodeURIComponent(params.subject)}&body=${encodeURIComponent(params.body)}`;
  const to = params.to?.trim() ?? '';
  return to ? `mailto:${to}?${query}` : `mailto:?${query}`;
}

export function applyReceiptPrintCopies(copies: ReceiptPrintCopies): void {
  const value = copies === 'single' ? 'single' : 'two';
  globalThis.document?.documentElement?.setAttribute(RECEIPT_PRINT_ATTR, value);
}

export function printReceipt(printFn?: () => void, copies: ReceiptPrintCopies = 'two'): void {
  applyReceiptPrintCopies(copies);
  if (printFn) {
    printFn();
    return;
  }
  globalThis.window?.print();
}
