export type CompletenessInput = {
  review_confirm_accuracy?: boolean | null;
  medical_history_id?: string | null;
  emergency_contact_id?: string | null;
};

export type CompletenessFlag = {
  id: 'review' | 'medical' | 'emergency';
  label: string;
  tone: 'quiet' | 'warning';
};

export type PageSearchRow = {
  participant_full_name?: string | null;
  participant_email?: string | null;
  participant_cell_phone?: string | null;
  participant_home_phone?: string | null;
};

function filled(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function yesNo(value: boolean | null | undefined): 'Yes' | 'No' | 'Not recorded' {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return 'Not recorded';
}

export function recordedText(value: string | null | undefined): string {
  return filled(value) ?? 'Not recorded';
}

export function participantName(value: string | null | undefined): string {
  return filled(value) ?? 'Name not recorded';
}

export function completenessFlags(row: CompletenessInput): CompletenessFlag[] {
  const reviewConfirmed = row.review_confirm_accuracy === true;
  const medicalOnFile = Boolean(filled(row.medical_history_id));
  const emergencyOnFile = Boolean(filled(row.emergency_contact_id));
  return [
    {
      id: 'review',
      label: reviewConfirmed ? 'Review confirmed' : 'Review not confirmed',
      tone: 'quiet',
    },
    {
      id: 'medical',
      label: medicalOnFile ? 'Medical on file' : 'Medical missing',
      tone: medicalOnFile ? 'quiet' : 'warning',
    },
    {
      id: 'emergency',
      label: emergencyOnFile ? 'Emergency on file' : 'Emergency missing',
      tone: emergencyOnFile ? 'quiet' : 'warning',
    },
  ];
}

/** Client filter of the loaded page. Name, email, cell, and home phone only. */
export function filterLoadedPage<T extends PageSearchRow>(rows: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => {
    const haystack = [
      row.participant_full_name,
      row.participant_email,
      row.participant_cell_phone,
      row.participant_home_phone,
    ]
      .map((part) => filled(part))
      .filter((part): part is string => part !== null)
      .join('\n')
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function contactLine(row: PageSearchRow): string | null {
  const email = filled(row.participant_email);
  const phone = filled(row.participant_cell_phone) ?? filled(row.participant_home_phone);
  const parts = [email, phone].filter((part): part is string => part !== null);
  return parts.length ? parts.join(' · ') : null;
}

export function formatSignedAt(value: string | null | undefined): string {
  const raw = filled(value);
  if (!raw) return 'Not recorded';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatAddress(row: {
  participant_address_line?: string | null;
  participant_city?: string | null;
  participant_state?: string | null;
  participant_zip?: string | null;
}): string | null {
  const cityLine = [filled(row.participant_city), filled(row.participant_state)]
    .filter((part): part is string => part !== null)
    .join(', ');
  const locality = [cityLine, filled(row.participant_zip)]
    .filter((part): part is string => part !== null)
    .join(' ');
  const lines = [filled(row.participant_address_line), filled(locality)].filter(
    (part): part is string => part !== null,
  );
  return lines.length ? lines.join('\n') : null;
}
