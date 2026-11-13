import { PAYMENT_METHOD_LABEL, type PaymentMethod } from '@/lib/finance';
import { formatUsdFromCents } from '@/lib/shareFormats';

export const GYM_NAME = 'Temple Underground';
export const RECEIPT_TIME_ZONE = 'America/New_York';

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
  amount: string;
  rows: ReceiptCardRow[];
  receiptRef: string;
};

const UUID_LIKE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function shortReceiptRef(entryId: string): string {
  const hex = entryId.replace(/-/g, '').replace(/[^0-9a-f]/gi, '').slice(0, 8).toUpperCase();
  return hex ? `TU-${hex}` : '';
}

export function formatReceiptDateTime(recordedAt: Date, timeZone = RECEIPT_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(recordedAt);
}

export function paymentModeLabel(method: PaymentMethod): string {
  return PAYMENT_METHOD_LABEL[method];
}

export function buildReceiptCardModel(input: ReceiptCardInput): ReceiptCardModel {
  const rows: ReceiptCardRow[] = [{ label: 'Person', value: input.personName.trim() }];
  const plan = input.planName?.trim();
  if (plan) rows.push({ label: 'Plan', value: plan });
  rows.push(
    { label: 'Payment', value: paymentModeLabel(input.paymentMethod) },
    { label: 'Received by', value: input.receivedBy.trim() },
    { label: 'Date', value: formatReceiptDateTime(input.recordedAt) },
  );
  const note = input.note?.trim();
  if (note) rows.push({ label: 'Note', value: note });
  return {
    gymName: GYM_NAME,
    title: 'Receipt',
    amount: formatUsdFromCents(input.amountCents),
    rows,
    receiptRef: shortReceiptRef(input.entryId),
  };
}

export function receiptCardContainsDatabaseId(model: ReceiptCardModel, entryId: string): boolean {
  const haystack = [model.gymName, model.title, model.amount, model.receiptRef, ...model.rows.map((row) => `${row.label} ${row.value}`)].join('\n');
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

export function printReceipt(printFn?: () => void): void {
  if (printFn) {
    printFn();
    return;
  }
  globalThis.window?.print();
}
