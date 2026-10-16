import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  displayDate,
  searchPath,
  SEARCH_LIMIT,
  type Account,
  type Participant,
  type Row,
} from "@/lib/operator";
import { readAdmin } from "@/lib/operator-api";
import {
  composeWaiverPdf,
  findWaiverRecord,
  presentWaiverPdfError,
  readSignaturePng,
  sourceFromRecord,
} from "@/lib/waiver-pdf";
import {
  Limitation,
  Panel,
  ReadStatus,
  useEndpoint,
  useRead,
  type Connection,
} from "./shared";

export function ParticipantLookup({
  connection,
  query,
  setQuery,
  selected,
  onSelect,
  onPayer,
}: {
  connection: Connection;
  query: string;
  setQuery: (q: string) => void;
  selected: Participant | null;
  onSelect: (p: Participant) => void;
  onPayer: (account: Account) => void;
}) {
  const [debounced, setDebounced] = useState(query);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setActive(-1);
    const timer = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);
  const path = searchPath(debounced);
  const { apiBase, adminKey } = connection;
  const load = useCallback(
    (signal: AbortSignal) =>
      path
        ? readAdmin<{ rows: Participant[] }>(apiBase, adminKey, path, signal)
        : Promise.resolve({ rows: [] }),
    [apiBase, adminKey, path],
  );
  const state = useRead(load, path || "idle");
  const settled = debounced === query;
  const rows = settled && path ? (state.data?.rows ?? []) : [];
  return (
    <section className="participant-lookup" aria-label="Participant lookup">
      <label className="search-label" htmlFor="participant-search">
        Find a participant{" "}
        <span className="muted text-xs">Name, email or phone</span>
      </label>
      <div className="search-field">
        <Input
          id="participant-search"
          ref={inputRef}
          value={query}
          placeholder="Search people…"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={query.trim().length >= 2 && rows.length > 0}
          aria-controls={
            query.trim().length >= 2 ? "participant-results" : undefined
          }
          aria-activedescendant={
            active >= 0 && rows[active]
              ? `participant-result-${active}`
              : undefined
          }
          aria-describedby="search-guidance"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && rows.length) {
              e.preventDefault();
              setActive((i) => (i + 1) % rows.length);
            }
            if (e.key === "ArrowUp" && rows.length) {
              e.preventDefault();
              setActive((i) => (i <= 0 ? rows.length - 1 : i - 1));
            }
            if (e.key === "Enter" && rows.length && active >= 0) {
              e.preventDefault();
              onSelect(rows[active]);
            }
            if (e.key === "Escape") {
              setQuery("");
              setActive(-1);
            }
          }}
        />
        {query && (
          <Button
            variant="ghost"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
          >
            Clear
          </Button>
        )}
      </div>
      <p id="search-guidance" className="muted text-sm">
        Enter at least two characters. Use ↑ / ↓ and Enter to select, or
        choose a result.
      </p>
      {query.trim().length >= 2 && (
        <div className="search-results">
          {!settled ? (
            <p role="status">Searching…</p>
          ) : (
            <ReadStatus state={state} />
          )}
          {settled && !state.loading && !state.error && rows.length === 0 && (
            <p className="empty-state">
              No matches. Try another name or contact detail.
            </p>
          )}
          <div
            id="participant-results"
            role="listbox"
            aria-label="Participant matches"
            className="search-option-list"
          >
            {rows.map((p, i) => (
              <button
                type="button"
                role="option"
                id={`participant-result-${i}`}
                aria-selected={selected?.participant_id === p.participant_id}
                key={p.participant_id}
                className={`person-result ${active === i ? "focused-result" : ""}`}
                onClick={() => onSelect(p)}
              >
                <strong>{p.full_name}</strong>
                <span>
                  {p.email || "Email not recorded"} ·{" "}
                  {p.cell_phone || p.home_phone || "Phone not recorded"}
                </span>
                <span>
                  {p.account_count} linked payer account
                  {p.account_count === 1 ? "" : "s"}
                </span>
              </button>
            ))}
          </div>
          {rows.length >= SEARCH_LIMIT && (
            <Limitation>
              Showing the first 25 matches. Refine your search to find the
              correct person.
            </Limitation>
          )}
        </div>
      )}
      {selected && (
        <Panel
          title={selected.full_name}
          hint="Selected participant • identity and linked payer context"
        >
          <p>
            {selected.email || "Email not recorded"}
            <br />
            {selected.cell_phone || selected.home_phone || "Phone not recorded"}
          </p>
          <div className="payer-options">
            {selected.accounts?.map((account) => (
              <article className="record-card" key={account.account_id}>
                <h3>
                  {account.account_primary_contact_name ||
                    "Payer name not recorded"}
                </h3>
                <p className="muted">
                  {account.role || "Role not recorded"} ·{" "}
                  {account.account_status || "Status not recorded"}
                </p>
                {selected.preferred_account_id === account.account_id && (
                  <p className="text-sm">
                    Suggested payer — choose explicitly for review.
                  </p>
                )}
                <Button variant="outline" onClick={() => onPayer(account)}>
                  Review this payer
                </Button>
              </article>
            ))}
          </div>
          {!selected.accounts?.length && (
            <p>No linked payer returned by this search.</p>
          )}
          <Limitation>
            This is search context, not a complete profile or household.
            Enrollment and recurring terms await supported detail reads. Waivers
            below cover only the loaded page.
          </Limitation>
        </Panel>
      )}
    </section>
  );
}

export function Waivers({
  connection,
  selected,
}: {
  connection: Connection;
  selected: Participant | null;
}) {
  const [offset, setOffset] = useState(0);
  const [onlySelected, setOnlySelected] = useState(false);
  const [detail, setDetail] = useState<Row | null>(null);
  const state = useEndpoint<{ rows: Row[] }>(
    connection,
    `/api/admin/waivers?limit=50&offset=${offset}`,
  );
  const rows = state.data?.rows;
  const visibleRows = rows?.filter(
    (row) =>
      !onlySelected ||
      (selected && row.participant_id === selected.participant_id),
  );
  useEffect(() => {
    setOnlySelected(false);
    setDetail(null);
  }, [selected?.participant_id]);
  useEffect(() => {
    setDetail(null);
  }, [offset]);
  return (
    <Panel
      title="Signed waivers"
      hint="Recent first • 50 records per page"
      action={
        <Button
          variant="outline"
          onClick={state.retry}
          disabled={state.loading}
        >
          Refresh list
        </Button>
      }
    >
      <Limitation>
        Page starting at record {offset + 1}. This list cannot prove that a
        person has no waiver. Document links expire after five minutes.
      </Limitation>
      {selected && (
        <label className="check-filter">
          <input
            type="checkbox"
            checked={onlySelected}
            onChange={(e) => setOnlySelected(e.target.checked)}
          />
          Only {selected.full_name} on this loaded page
        </label>
      )}
      <ReadStatus state={state} />
      {visibleRows && visibleRows.length === 0 && (
        <p className="empty-state">
          {onlySelected
            ? "No waiver for this participant on the loaded page. Try another page."
            : "No waiver records returned on this page."}
        </p>
      )}
      <div className="waiver-list">
        {visibleRows?.map((row) => (
          <article className="record-card" key={String(row.waiver_id)}>
            <div>
              <h3>
                {String(row.participant_full_name || "Name not recorded")}
              </h3>
              <p className="muted">
                Signed {displayDate(row.signed_at_utc, true)}
              </p>
            </div>
            <Button variant="outline" onClick={() => setDetail(row)}>
              View document
            </Button>
          </article>
        ))}
      </div>
      <div className="pagination">
        <Button
          variant="outline"
          disabled={offset === 0 || state.loading}
          onClick={() => setOffset((n) => Math.max(0, n - 50))}
        >
          Previous page
        </Button>
        <Button
          variant="outline"
          disabled={
            state.loading || !rows || rows.length < 50 || Boolean(state.error)
          }
          onClick={() => setOffset((n) => n + 50)}
        >
          Next page
        </Button>
      </div>
      {detail && (
        <WaiverDocument
          key={String(detail.waiver_id)}
          connection={connection}
          row={detail}
          onClose={() => setDetail(null)}
        />
      )}
    </Panel>
  );
}

function WaiverDocument({
  connection,
  row,
  onClose,
}: {
  connection: Connection;
  row: Row;
  onClose: () => void;
}) {
  const state = useEndpoint<{
    signatureUrl?: string;
    documentSha256?: string;
    content_version?: string;
    locale?: string;
  }>(
    connection,
    `/api/admin/waivers/${encodeURIComponent(String(row.waiver_id))}`,
  );
  const [expired, setExpired] = useState(false);
  const [opening, setOpening] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdf, setPdf] = useState<{ url: string; filename: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const openAbort = useRef<AbortController | null>(null);
  const pdfUrl = useRef<string | null>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    setExpired(false);
    if (!state.refreshed) return;
    const timer = setTimeout(() => setExpired(true), 5 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [state.refreshed]);
  useEffect(
    () => () => {
      openAbort.current?.abort();
      if (pdfUrl.current) URL.revokeObjectURL(pdfUrl.current);
    },
    [],
  );
  const canOpen = Boolean(
    state.data?.signatureUrl && !expired && !state.error && !state.loading && !opening,
  );
  async function openSignedPdf() {
    const signatureUrl = state.data?.signatureUrl;
    if (!signatureUrl || expired) return;
    const popup = window.open("", "_blank");
    const controller = new AbortController();
    openAbort.current?.abort();
    openAbort.current = controller;
    setOpening(true);
    setPdfError(null);
    try {
      const record = await findWaiverRecord(
        (path) =>
          readAdmin<{ rows?: Record<string, unknown>[] }>(
            connection.apiBase,
            connection.adminKey,
            path,
            controller.signal,
          ),
        String(row.waiver_id),
        row.signed_at_utc,
      );
      const signaturePng = await readSignaturePng(signatureUrl, controller.signal);
      const composed = await composeWaiverPdf(
        sourceFromRecord(record, {
          signaturePng,
          locale: state.data?.locale,
          contentVersion: state.data?.content_version,
          documentSha256: state.data?.documentSha256,
        }),
      );
      if (controller.signal.aborted) {
        popup?.close();
        return;
      }
      const pdfBytes = new Uint8Array(composed.bytes.byteLength);
      pdfBytes.set(composed.bytes);
      const url = URL.createObjectURL(
        new Blob([pdfBytes], { type: "application/pdf" }),
      );
      const filename = `waiver-${String(row.waiver_id).replace(/[^a-zA-Z0-9._-]/g, "") || "document"}.pdf`;
      if (pdfUrl.current) URL.revokeObjectURL(pdfUrl.current);
      pdfUrl.current = url;
      setPdf({ url, filename });
      if (popup && !popup.closed) popup.location.href = url;
      else popup?.close();
    } catch (error) {
      popup?.close();
      if (controller.signal.aborted) return;
      const message = presentWaiverPdfError(error);
      if (message) setPdfError(message);
    } finally {
      if (!controller.signal.aborted) setOpening(false);
    }
  }
  return (
    <section className="document-detail" aria-label="Selected waiver document">
      <h3 ref={heading} tabIndex={-1}>
        Waiver for {String(row.participant_full_name || "selected participant")}
      </h3>
      <p>
        Signed {displayDate(row.signed_at_utc, true)} · Version{" "}
        {state.data?.content_version || "not returned"} ·{" "}
        {state.data?.locale || "Locale not returned"}
      </p>
      <p className="muted text-xs">
        Open signed PDF builds a reading copy from the signed waiver record. The
        archived file and its audit hash stay as stored.
      </p>
      <ReadStatus state={state} />
      {canOpen && (
        <Button type="button" variant="outline" onClick={() => void openSignedPdf()}>
          Open signed PDF
        </Button>
      )}
      {opening && <p role="status">Preparing the signed document…</p>}
      {pdfError && (
        <p role="alert">{pdfError}</p>
      )}
      {pdf && (
        <>
          <iframe className="pdf-preview" title="Signed waiver PDF" src={pdf.url} />
          <a className="operator-link" href={pdf.url} download={pdf.filename}>
            Download signed PDF
          </a>
        </>
      )}
      {expired && !pdf && (
        <p role="status">
          This signature link has expired. Refresh it to open the PDF.
        </p>
      )}
      <div className="actions">
        <Button
          variant="outline"
          onClick={state.retry}
          disabled={state.loading}
        >
          Refresh document link
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Close document
        </Button>
      </div>
      {!state.loading && state.data && !state.data.signatureUrl && (
        <p role="alert">
          The signature image link was not returned, so the signed document was
          not opened.
        </p>
      )}
    </section>
  );
}
