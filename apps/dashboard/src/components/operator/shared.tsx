import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cell, label, type Row } from "@/lib/operator";
import { readAdmin } from "@/lib/operator-api";

export type Connection = { apiBase: string; adminKey: string };
export type ReadState<T> = {
  data?: T;
  error?: string;
  loading: boolean;
  refreshed?: Date;
  retry: () => void;
};

export function useRead<T>(
  load: (signal: AbortSignal) => Promise<T>,
  identity: string,
): ReadState<T> {
  const [retryCount, setRetryCount] = useState(0);
  const [state, setState] = useState<{
    identity: string;
    data?: T;
    error?: string;
    loading: boolean;
    refreshed?: Date;
  }>({ identity, loading: true });
  useEffect(() => {
    const controller = new AbortController();
    setState((previous) => ({
      ...(previous.identity === identity ? previous : {}),
      identity,
      loading: true,
      error: undefined,
    }));
    void load(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ identity, data, loading: false, refreshed: new Date() });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState((previous) => ({
            ...previous,
            identity,
            loading: false,
            error:
              error instanceof Error && error.name === "TimeoutError"
                ? "Request timed out. Retry this read."
                : error instanceof Error
                  ? error.message
                  : "Connection unavailable.",
          }));
      });
    return () => controller.abort();
  }, [load, identity, retryCount]);
  return {
    ...(state.identity === identity ? state : { loading: true }),
    retry: () => setRetryCount((n) => n + 1),
  };
}

export function useEndpoint<T>(connection: Connection, path: string) {
  const { apiBase, adminKey } = connection;
  const load = useCallback(
    (signal: AbortSignal) => readAdmin<T>(apiBase, adminKey, path, signal),
    [apiBase, adminKey, path],
  );
  return useRead(load, path);
}

export function Panel({
  title,
  hint,
  children,
  action,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="operator-panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {hint && <p className="muted">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ReadStatus({ state }: { state: ReadState<unknown> }) {
  return (
    <div className="read-status" aria-live="polite" aria-atomic="true">
      {state.loading && (
        <p role="status">
          {state.data
            ? "Refreshing… Previous values remain visible."
            : "Loading…"}
        </p>
      )}
      {state.error && (
        <div role="alert">
          <p>{state.error}</p>
          {state.data !== undefined && (
            <p>Previous values are stale; verify before acting.</p>
          )}
          <Button variant="outline" onClick={state.retry}>
            Retry
          </Button>
        </div>
      )}
      {state.refreshed && (
        <p className="muted text-xs">
          Last refreshed{" "}
          {state.refreshed.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      )}
    </div>
  );
}

export function Records({
  rows,
  fields,
  empty = "No records returned in this scope.",
}: {
  rows: Row[];
  fields: string[];
  empty?: string;
}) {
  if (!rows.length) return <p className="empty-state">{empty}</p>;
  const columns = fields.filter((field) => rows.some((row) => field in row));
  if (!columns.length)
    return (
      <p className="empty-state">
        The response has no supported display fields.
      </p>
    );
  return (
    <>
      <div className="record-table">
        <table>
          <thead>
            <tr>
              {columns.map((field) => (
                <th
                  scope="col"
                  key={field}
                  className={field.endsWith("_cents") ? "numeric" : ""}
                >
                  {label(field)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map((field) => (
                  <td
                    key={field}
                    className={field.endsWith("_cents") ? "numeric" : ""}
                  >
                    {cell(row[field], field)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="record-cards">
        {rows.map((row, i) => (
          <article key={i} className="record-card">
            <dl>
              {columns.map((field) => (
                <div key={field}>
                  <dt>{label(field)}</dt>
                  <dd>{cell(row[field], field)}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    </>
  );
}

export function Limitation({ children }: { children: ReactNode }) {
  return <p className="scope-note">{children}</p>;
}
