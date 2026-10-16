import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Toolbar } from './components/Toolbar';
import { WaiverList } from './components/WaiverList';
import type { WaiverDocument, WaiverListResponse } from './lib/types';
import {
  AUTH_ME_PATH,
  PAGE_SIZE,
  SESSION_EXPIRED_EVENT,
  UNAVAILABLE_MESSAGE,
  ViewerRequestError,
  adminFetch,
  getDefaultApiBase,
  isSupportedStaff,
  queryForSort,
  viewerFetch,
  type SortMode,
  type Staff,
} from './lib/viewer-api';
import { filterLoadedPage } from './lib/waiver-record';

function useDebounced(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export default function App() {
  const [apiBase, setApiBase] = useState(getDefaultApiBase);
  const [draftKey, setDraftKey] = useState('');
  const [session, setSession] = useState<{ key: string; staff: Staff } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const loginAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const lock = () => {
      loginAbort.current?.abort();
      setSession(null);
      setDraftKey('');
      setLoading(false);
      setError('Session expired. Unlock to continue.');
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, lock);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, lock);
      loginAbort.current?.abort();
    };
  }, []);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (loading || !draftKey.trim()) return;
    const key = draftKey.trim();
    const controller = new AbortController();
    loginAbort.current = controller;
    setLoading(true);
    setError('');
    try {
      const { ok, status, data } = await adminFetch<{ ok?: boolean; staff?: Staff; error?: string }>(
        apiBase,
        key,
        AUTH_ME_PATH,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      if (!ok || !data.staff) {
        if (status === 401) throw new Error('That key was not accepted.');
        if (status === 403) throw new Error('Your staff role cannot access waivers.');
        throw new Error(data.error || `Unable to unlock (HTTP ${status}).`);
      }
      if (!isSupportedStaff(data.staff)) {
        throw new Error('The API did not return a supported staff identity.');
      }
      setSession({ key, staff: data.staff });
      setDraftKey('');
    } catch (caught) {
      if (!controller.signal.aborted) {
        setError(caught instanceof Error ? caught.message : 'Unable to unlock.');
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  if (!session) {
    return (
      <main className="unlock-page">
        <div className="unlock-card">
          <p className="brand-mark">TEMPLE / UNDERGROUND</p>
          <h1>Waiver review</h1>
          <p className="muted">See who signed and what’s missing.</p>
          <form onSubmit={unlock} className="stack">
            <label htmlFor="api-base">API base</label>
            <input
              id="api-base"
              type="url"
              required
              value={apiBase}
              onChange={(event) => setApiBase(event.target.value)}
              disabled={loading}
            />
            <label htmlFor="staff-key">Staff key</label>
            <input
              id="staff-key"
              type="password"
              autoComplete="off"
              required
              value={draftKey}
              onChange={(event) => setDraftKey(event.target.value)}
              disabled={loading}
              aria-describedby="key-help"
            />
            <p id="key-help" className="muted text-sm">
              Your key stays in memory and clears on lock or reload. Use your personal staff key,
              or the existing trusted operator key.
            </p>
            <button className="primary-button" disabled={loading || !draftKey.trim()}>
              {loading ? 'Checking identity…' : 'Unlock workspace'}
            </button>
            {error ? (
              <p role="alert" className="error-message">
                {error}
              </p>
            ) : null}
          </form>
          <p className="release-note">Phone-first waiver review</p>
        </div>
      </main>
    );
  }

  return (
    <WaiverWorkspace
      apiBase={apiBase}
      adminKey={session.key}
      staff={session.staff}
      onLock={() => {
        setSession(null);
        setDraftKey('');
        setError('');
      }}
    />
  );
}

function WaiverWorkspace({
  apiBase,
  adminKey,
  staff,
  onLock,
}: {
  apiBase: string;
  adminKey: string;
  staff: Staff;
  onLock: () => void;
}) {
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [offset, setOffset] = useState(0);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query, 250);
  const [rows, setRows] = useState<WaiverDocument[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [hasPage, setHasPage] = useState(false);
  const [pageStart, setPageStart] = useState(1);
  const hasPageRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);

    try {
      const data = await viewerFetch<WaiverListResponse>(
        apiBase,
        adminKey,
        queryForSort(sortMode, offset, start, end),
        { signal: controller.signal },
      );
      if (requestId !== requestRef.current) return;
      if (!Array.isArray(data.rows)) {
        throw new ViewerRequestError(UNAVAILABLE_MESSAGE, 200);
      }
      setRows(data.rows);
      setPageStart(offset + 1);
      setStale(false);
      hasPageRef.current = true;
      setHasPage(true);
      setExpandedId((current) =>
        current && data.rows?.some((row) => row.waiver_id === current) ? current : null,
      );
    } catch (caught) {
      if (controller.signal.aborted || requestId !== requestRef.current) return;
      setStale(hasPageRef.current);
      setError(caught instanceof ViewerRequestError ? caught.message : UNAVAILABLE_MESSAGE);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [adminKey, apiBase, end, offset, sortMode, start]);

  useEffect(() => {
    void load();
    return () => {
      abortRef.current?.abort();
    };
  }, [load]);

  const visibleRows = useMemo(
    () => filterLoadedPage(rows, debouncedQuery),
    [debouncedQuery, rows],
  );

  const showNoRows = hasPage && !error && rows.length === 0;
  const showNoMatches = hasPage && rows.length > 0 && visibleRows.length === 0;
  const nextDisabled = loading || Boolean(error) || rows.length < PAGE_SIZE;
  const roleLabel = staff.role.replaceAll('_', ' ');

  return (
    <main className="app-shell">
      <header className="page-header">
        <div className="header-row">
          <h1>Waivers</h1>
          <button type="button" className="secondary-button" onClick={onLock}>
            Lock
          </button>
        </div>
        <p className="staff-line">
          {staff.display_name} · {roleLabel}
        </p>
        <p>Review who signed and what’s missing.</p>
      </header>

      <Toolbar
        query={query}
        onQueryChange={setQuery}
        sortMode={sortMode}
        onSortMode={(mode) => {
          if (mode === sortMode) return;
          setSortMode(mode);
          setOffset(0);
        }}
        start={start}
        end={end}
        onStart={(value) => {
          setStart(value);
          setOffset(0);
        }}
        onEnd={(value) => {
          setEnd(value);
          setOffset(0);
        }}
        loading={loading}
        onRefresh={() => void load()}
      />

      {error && (
        <div className={stale ? 'banner stale' : 'banner error'} role="alert">
          <p>{stale ? `Stale. Showing the last loaded page. ${error}` : error}</p>
          <button type="button" className="secondary-button" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {hasPage && (
        <p className="scope-note">
          Page starting at record {pageStart}. This list cannot prove a person has no waiver.
        </p>
      )}

      {loading && hasPage && (
        <p className="refresh-note" role="status">
          Refreshing this page.
        </p>
      )}
      {loading && !hasPage && (
        <p className="empty-state" role="status">
          Loading waivers.
        </p>
      )}

      <section aria-label="Signed waivers" aria-busy={loading}>
        {showNoRows && <p className="empty-state">No waivers on this page.</p>}
        {showNoMatches && <p className="empty-state">Nothing on this page matches that search.</p>}
        <WaiverList
          rows={visibleRows}
          expandedId={expandedId}
          onToggle={(id) => setExpandedId((current) => (current === id ? null : id))}
        />
      </section>

      {hasPage && (
        <nav className="pager" aria-label="Pages">
          <button
            type="button"
            className="secondary-button"
            disabled={offset === 0 || loading}
            onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
          >
            Previous
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={nextDisabled}
            onClick={() => setOffset((current) => current + PAGE_SIZE)}
          >
            Next
          </button>
        </nav>
      )}
    </main>
  );
}
