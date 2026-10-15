import type { WaiverDocument } from '../lib/types';
import { WaiverCard } from './WaiverCard';

export function WaiverList({
  rows,
  expandedId,
  onToggle,
}: {
  rows: WaiverDocument[];
  expandedId: string | null;
  onToggle: (id: string) => void;
}) {
  if (!rows.length) return null;
  return (
    <div className="waiver-list">
      {rows.map((row) => (
        <WaiverCard
          key={row.waiver_id}
          row={row}
          expanded={expandedId === row.waiver_id}
          onToggle={() => onToggle(row.waiver_id)}
        />
      ))}
    </div>
  );
}
