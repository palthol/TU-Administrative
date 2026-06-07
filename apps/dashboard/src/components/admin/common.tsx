import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

export type AdminTabProps = {
  apiBase: string;
  adminKey: string;
  requireKey: () => string | null;
};

export function Field({ id, label, children }: { id?: string; label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export function StatusMessage({ message, variant }: { message: string | null; variant: 'ok' | 'err' }) {
  if (!message) return null;
  const cls =
    variant === 'ok'
      ? 'text-green-800 bg-green-50 border-green-200'
      : 'text-destructive bg-destructive/10 border-destructive/30';
  return (
    <p role="status" className={`mt-4 rounded-md border px-3 py-2 text-sm whitespace-pre-wrap ${cls}`}>
      {message}
    </p>
  );
}

export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

export function formatUsd(cents: number): string {
  const amount = Number.isFinite(cents) ? cents / 100 : 0;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function parseDollarsToCents(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '');
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export function SimpleDataTable({ rows }: { rows: Record<string, unknown>[] }) {
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  if (columns.length === 0) {
    return <p className="text-sm text-muted-foreground">No rows returned.</p>;
  }
  return (
    <div className="rounded-lg border border-border bg-card shadow-sm">
      <div className="max-h-[min(60vh,640px)] overflow-auto">
        <table className="w-full caption-bottom text-sm">
          <thead className="sticky top-0 z-10 border-b border-border bg-muted/95">
            <tr>
              {columns.map((c) => (
                <th
                  key={c}
                  className="h-10 px-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-border/60 hover:bg-muted/40">
                {columns.map((c) => (
                  <td
                    key={c}
                    className="px-3 py-2 align-top text-xs whitespace-nowrap max-w-[min(24rem,40vw)] truncate"
                    title={formatCell(row[c])}
                  >
                    {formatCell(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
