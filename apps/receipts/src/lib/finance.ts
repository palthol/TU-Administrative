export const PAYMENT_METHODS = ['cash', 'card', 'cashapp', 'venmo', 'paypal', 'zelle', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const destinations = ['Cash', 'Invoice', 'Recent', 'Formal', 'More'] as const;
export type Destination = (typeof destinations)[number];

export type Staff = {
  display_name: string;
  role: string;
  auth_method?: string;
};

export type Connection = {
  apiBase: string;
  adminKey: string;
};

export type PersonalEntry = {
  id: string;
  entry_kind: string;
  member_display_name: string;
  amount_cents: number;
  method?: string | null;
  issued_by: string;
  notes?: string | null;
  due_at?: string | null;
  invoice_status?: string | null;
  account_id?: string | null;
  charge_id?: string | null;
  created_at?: string;
};

export type ChargeDiscountRow = {
  id: string;
  charge_id: string;
  discount_type: 'flat' | 'percent';
  flat_amount_cents?: number | null;
  percent_basis_points?: number | null;
  applied_amount_cents: number;
  label: string;
  reason?: string | null;
  created_by?: string | null;
  created_at?: string;
};

export type ParticipantSearchAccount = {
  account_id: string;
  role?: string | null;
  account_status?: string | null;
};

export type ParticipantSearchRow = {
  participant_id: string;
  full_name: string;
  email?: string | null;
  cell_phone?: string | null;
  home_phone?: string | null;
  account_count: number;
  preferred_account_id?: string | null;
  accounts?: ParticipantSearchAccount[];
};

export type BoardSelection = {
  accountId: string;
  chargeId: string;
  memberName: string;
  amountHint?: string;
};

export function fromHash(): Destination {
  return destinations.find((d) => `#${d.toLowerCase()}` === window.location.hash) || 'Cash';
}

export function parseDollarsToCents(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '');
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export function defaultTomorrowIsoDate() {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return t.toISOString().slice(0, 10);
}

export function operatorError(status: number, data: { error?: string }): string {
  if (status === 401) return 'Session expired. Unlock again.';
  if (status === 403) return 'Your staff role cannot perform this action.';
  const key = data.error;
  if (!key) return `Unavailable (HTTP ${status}).`;
  if (/relation|does not exist|migration|undefined_table/i.test(key)) {
    return 'This billing table may not be available yet (check migrations 0017/0019).';
  }
  return `Could not complete: ${key}.`;
}

export async function shareOrCopy(text: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return 'shared';
    }
  } catch {
    /* fall through */
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/** Pure helpers for unit tests — destination hash parsing without window. */
export function destinationFromHashValue(hash: string): Destination {
  const normalized = hash.startsWith('#') ? hash : `#${hash}`;
  return destinations.find((d) => `#${d.toLowerCase()}` === normalized.toLowerCase()) || 'Cash';
}
