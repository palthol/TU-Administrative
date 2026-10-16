import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Toolbar } from './components/Toolbar';
import { WaiverList } from './components/WaiverList';
import type { WaiverDocument, WaiverListResponse } from './lib/types';
import {
  PAGE_SIZE,
  UNAVAILABLE_MESSAGE,
  ViewerRequestError,
  queryForSort,
  viewerFetch,
  type SortMode,
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
  }, [end, offset, sortMode, start]);

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

  return (
    <main className="app-shell">
      <header className="page-header">
        <h1>Waivers</h1>
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
