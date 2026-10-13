import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

export function Field({ id, label, children }: { id?: string; label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export function StatusBanner({
  message,
  variant,
  details,
}: {
  message: string | null;
  variant: 'ok' | 'err';
  details?: string | null;
}) {
  if (!message) return null;
  return (
    <div
      role={variant === 'err' ? 'alert' : 'status'}
      className={variant === 'ok' ? 'status-ok' : 'status-err'}
    >
      <p>{message}</p>
      {details ? (
        <details className="status-details">
          <summary>Details</summary>
          <pre>{details}</pre>
        </details>
      ) : null}
    </div>
  );
}

export function ScopeNote({ children }: { children: ReactNode }) {
  return <p className="scope-note">{children}</p>;
}

export function PageHeading({
  eyebrow,
  title,
  summary,
  badge,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  badge?: string;
}) {
  return (
    <header className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 tabIndex={-1} id="finance-heading">
          {title}
        </h1>
        <p className="muted">{summary}</p>
      </div>
      {badge ? <span className="release-badge">{badge}</span> : null}
    </header>
  );
}

export function FinancePanel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="operator-panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {description ? <p className="muted">{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}
