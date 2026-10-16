import type { ReactNode } from 'react';
import type { WaiverDocument } from '../lib/types';
import {
  completenessFlags,
  contactLine,
  formatAddress,
  formatSignedAt,
  participantName,
  recordedText,
  yesNo,
} from '../lib/waiver-record';

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="detail-section">
      <h3>{title}</h3>
      <dl>{children}</dl>
    </section>
  );
}

const MEDICAL_YES_NO: { label: string; key: keyof WaiverDocument }[] = [
  { label: 'Heart disease', key: 'heart_disease' },
  { label: 'Shortness of breath', key: 'shortness_of_breath' },
  { label: 'High blood pressure', key: 'high_blood_pressure' },
  { label: 'Smoking', key: 'smoking' },
  { label: 'Diabetes', key: 'diabetes' },
  { label: 'Family history', key: 'family_history' },
  { label: 'Workouts', key: 'workouts' },
  { label: 'Medication', key: 'medication' },
  { label: 'Alcohol', key: 'alcohol' },
  { label: 'Knees', key: 'injuries_knees' },
  { label: 'Lower back', key: 'injuries_lower_back' },
  { label: 'Neck / shoulders', key: 'injuries_neck_shoulders' },
  { label: 'Hip / pelvis', key: 'injuries_hip_pelvis' },
  { label: 'Other injury', key: 'injuries_other_has' },
  { label: 'Recent injury', key: 'had_recent_injury' },
  { label: 'Physician cleared', key: 'physician_cleared' },
];

const MEDICAL_TEXT: { label: string; key: keyof WaiverDocument }[] = [
  { label: 'Last physical', key: 'last_physical' },
  { label: 'Exercise restriction', key: 'exercise_restriction' },
  { label: 'Other injury details', key: 'injuries_other_details' },
  { label: 'Injury details', key: 'injury_details' },
  { label: 'Clearance notes', key: 'clearance_notes' },
];

export function WaiverCard({
  row,
  expanded,
  onToggle,
}: {
  row: WaiverDocument;
  expanded: boolean;
  onToggle: () => void;
}) {
  const detailId = `waiver-${row.waiver_id}`;
  const contact = contactLine(row);
  const address = formatAddress(row);
  const flags = completenessFlags(row);

  return (
    <article className="waiver-card">
      <button
        type="button"
        className="waiver-summary"
        aria-expanded={expanded}
        aria-controls={detailId}
        onClick={onToggle}
      >
        <span className="summary-topline">
          <span className="summary-name">{participantName(row.participant_full_name)}</span>
          <span className="summary-action">{expanded ? 'Hide' : 'View'}</span>
        </span>
        <span className="summary-meta">Signed {formatSignedAt(row.signed_at_utc)}</span>
        {contact && <span className="summary-contact">{contact}</span>}
        <span className="summary-tags">
          {flags.map((flag) => (
            <span key={flag.id} className={`flag ${flag.tone}`}>
              {flag.label}
            </span>
          ))}
        </span>
      </button>

      {expanded && (
        <div id={detailId} className="waiver-details">
          <DetailSection title="Participant">
            <DetailRow label="Name" value={participantName(row.participant_full_name)} />
            <DetailRow label="Email" value={recordedText(row.participant_email)} />
            <DetailRow label="Cell phone" value={recordedText(row.participant_cell_phone)} />
            <DetailRow label="Home phone" value={recordedText(row.participant_home_phone)} />
            {address && <DetailRow label="Address" value={address} />}
          </DetailSection>

          <DetailSection title="Emergency contact">
            <DetailRow label="Name" value={recordedText(row.emergency_contact_name)} />
            <DetailRow label="Relationship" value={recordedText(row.emergency_contact_relationship)} />
            <DetailRow label="Phone" value={recordedText(row.emergency_contact_phone)} />
            <DetailRow label="Email" value={recordedText(row.emergency_contact_email)} />
          </DetailSection>

          <DetailSection title="Waiver">
            <DetailRow label="Signed at" value={formatSignedAt(row.signed_at_utc)} />
            <DetailRow label="Consent acknowledged" value={yesNo(row.consent_acknowledged)} />
            <DetailRow label="Review confirmed" value={yesNo(row.review_confirm_accuracy)} />
            <DetailRow label="Risk assumption initials" value={recordedText(row.initials_risk_assumption)} />
            <DetailRow label="Release initials" value={recordedText(row.initials_release)} />
            <DetailRow label="Indemnification initials" value={recordedText(row.initials_indemnification)} />
            <DetailRow label="Media release initials" value={recordedText(row.initials_media_release)} />
          </DetailSection>

          <details className="disclosure">
            <summary>Record ids</summary>
            <dl>
              <DetailRow label="Waiver id" value={row.waiver_id} />
              <DetailRow label="Participant id" value={recordedText(row.participant_id)} />
            </dl>
          </details>

          <section className="detail-section">
            <h3>Documents</h3>
            <p className="scope-note">
              Signed PDF opens from dashboard People. This viewer cannot request signed URLs.
            </p>
          </section>

          <details className="disclosure">
            <summary>Medical answers (sensitive)</summary>
            <dl>
              {MEDICAL_YES_NO.map((field) => (
                <DetailRow
                  key={field.key}
                  label={field.label}
                  value={yesNo(row[field.key] as boolean | null)}
                />
              ))}
              {MEDICAL_TEXT.map((field) => (
                <DetailRow
                  key={field.key}
                  label={field.label}
                  value={recordedText(row[field.key] as string | null)}
                />
              ))}
            </dl>
          </details>
        </div>
      )}
    </article>
  );
}
