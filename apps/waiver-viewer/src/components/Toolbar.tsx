import { SORTS, type SortMode } from '../lib/viewer-api';

export function Toolbar({
  query,
  onQueryChange,
  sortMode,
  onSortMode,
  start,
  end,
  onStart,
  onEnd,
  loading,
  onRefresh,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  sortMode: SortMode;
  onSortMode: (mode: SortMode) => void;
  start: string;
  end: string;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="toolbar">
      <label className="field" htmlFor="page-search">
        <span>Search this page</span>
        <input
          id="page-search"
          type="search"
          value={query}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Name, email, or phone"
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </label>

      <div className="toolbar-row">
        <div className="chip-row" role="group" aria-label="Sort">
          {(Object.keys(SORTS) as SortMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className="chip"
              aria-pressed={sortMode === mode}
              onClick={() => onSortMode(mode)}
            >
              {SORTS[mode].label}
            </button>
          ))}
        </div>
        <button type="button" className="secondary-button" onClick={onRefresh}>
          {loading ? 'Refreshing' : 'Refresh'}
        </button>
      </div>

      <div className="date-row" role="group" aria-label="Signed dates">
        <label className="field" htmlFor="signed-start">
          <span>Signed from</span>
          <input
            id="signed-start"
            type="date"
            value={start}
            onChange={(event) => onStart(event.target.value)}
          />
        </label>
        <label className="field" htmlFor="signed-end">
          <span>Signed through</span>
          <input
            id="signed-end"
            type="date"
            value={end}
            onChange={(event) => onEnd(event.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
