import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDefaultApiBase } from "@/lib/admin-api";
import { readAdmin } from "@/lib/operator-api";
import {
  localDate,
  type Account,
  type Participant,
  type Session,
  type Staff,
} from "@/lib/operator";
import { ParticipantLookup, Waivers } from "@/components/operator/People";
import { Today } from "@/components/operator/Today";
import { Classes } from "@/components/operator/Classes";
import { Billing } from "@/components/operator/Billing";
import { More } from "@/components/operator/Reports";
import type { Connection } from "@/components/operator/shared";

const destinations = ["Today", "People", "Billing", "Classes", "More"] as const;
type Destination = (typeof destinations)[number];
const fromHash = (): Destination =>
  destinations.find((d) => `#${d.toLowerCase()}` === window.location.hash) ||
  "Today";

export default function App() {
  const [apiBase, setApiBase] = useState(getDefaultApiBase);
  const [draftKey, setDraftKey] = useState("");
  const [session, setSession] = useState<{ key: string; staff: Staff } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const loginAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    const lock = () => {
      loginAbort.current?.abort();
      setSession(null);
      setDraftKey("");
      setLoading(false);
      setError("Session expired. Unlock to continue.");
    };
    window.addEventListener("operator-session-expired", lock);
    return () => {
      window.removeEventListener("operator-session-expired", lock);
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
    setError("");
    try {
      const data = await readAdmin<{ staff: Staff }>(
        apiBase,
        key,
        "/api/admin/auth/me",
        controller.signal,
      );
      if (
        !data.staff ||
        !["owner", "finance", "front_desk"].includes(data.staff.role)
      )
        throw new Error("The API did not return a supported staff identity.");
      if (!controller.signal.aborted) {
        setSession({ key, staff: data.staff });
        setDraftKey("");
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "Unable to unlock.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  if (!session)
    return (
      <main className="unlock-page">
        <div className="unlock-card">
          <p className="brand-mark">TEMPLE / UNDERGROUND</p>
          <h1>Operator workspace</h1>
          <p className="muted">
            People, classes and payer context, within reach.
          </p>
          <form onSubmit={unlock} className="stack">
            <label htmlFor="api-base">API base</label>
            <Input
              id="api-base"
              type="url"
              required
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
              disabled={loading}
            />
            <label htmlFor="staff-key">Staff key</label>
            <Input
              id="staff-key"
              type="password"
              autoComplete="off"
              required
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              disabled={loading}
              aria-describedby="key-help"
            />
            <p id="key-help" className="muted text-sm">
              Your key stays in memory and clears on lock or reload. Use your
              personal staff key, or the existing trusted operator key.
            </p>
            <Button disabled={loading || !draftKey.trim()}>
              {loading ? "Checking identity…" : "Unlock workspace"}
            </Button>
            {error && (
              <p role="alert" className="error-message">
                {error}
              </p>
            )}
          </form>
          <p className="release-note">
            Interim release · lookup and read-only operations
          </p>
        </div>
      </main>
    );
  return (
    <Workspace
      connection={{ apiBase, adminKey: session.key }}
      staff={session.staff}
      onLock={() => {
        setSession(null);
        setDraftKey("");
        setError("");
      }}
    />
  );
}

function Workspace({
  connection,
  staff,
  onLock,
}: {
  connection: Connection;
  staff: Staff;
  onLock: () => void;
}) {
  const [nav, setNav] = useState<Destination>(fromHash);
  const [visited, setVisited] = useState<Destination[]>([fromHash()]);
  const [query, setQuery] = useState("");
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [payer, setPayer] = useState<Account | null>(null);
  const [today, setToday] = useState(localDate);
  const [day, setDay] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [classSession, setClassSession] = useState<Session | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const scrollPositions = useRef<Partial<Record<Destination, number>>>({});
  const previous = useRef(nav);
  const receiptsUrl =
    import.meta.env.VITE_RECEIPTS_APP_URL || "http://localhost:5176";
  const viewerUrl =
    import.meta.env.VITE_WAIVER_VIEWER_APP_URL || "http://localhost:5177";
  useEffect(() => {
    const timer = setInterval(() => setToday(localDate()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const change = () => {
      if (
        destinations.some(
          (d) => `#${d.toLowerCase()}` === window.location.hash,
        ) ||
        !window.location.hash
      )
        setNav(fromHash());
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    setVisited((v) => (v.includes(nav) ? v : [...v, nav]));
    if (previous.current !== nav) {
      heading.current?.focus({ preventScroll: true });
      window.scrollTo(0, scrollPositions.current[nav] || 0);
      previous.current = nav;
    }
  }, [nav]);
  const go = (next: Destination) => {
    scrollPositions.current[nav] = window.scrollY;
    window.location.hash = next.toLowerCase();
    setNav(next);
  };
  const navLink = (name: Destination) => (
    <a
      key={name}
      href={`#${name.toLowerCase()}`}
      aria-current={nav === name ? "page" : undefined}
      onClick={(e) => {
        e.preventDefault();
        go(name);
      }}
    >
      <span className="nav-symbol" aria-hidden="true">
        {
          { Today: "◷", People: "◎", Billing: "$", Classes: "▦", More: "⋯" }[
            name
          ]
        }
      </span>
      {name}
    </a>
  );
  return (
    <div className="operator-shell">
      <a href="#workspace-main" className="skip-link">
        Skip to workspace
      </a>
      <aside className="operator-rail">
        <a
          href="#today"
          className="brand-mark"
          onClick={(e) => {
            e.preventDefault();
            go("Today");
          }}
        >
          TEMPLE
          <br />
          UNDERGROUND
        </a>
        <p className="rail-caption">OPERATOR WORKSPACE</p>
        <nav aria-label="Main navigation">{destinations.map(navLink)}</nav>
        <p className="rail-foot">
          LOOK UP.
          <br />
          UNDERSTAND.
          <br />
          ACT WITH CARE.
        </p>
      </aside>
      <div className="operator-body">
        <header className="workspace-header">
          <div>
            <p className="brand-mobile">TEMPLE / UNDERGROUND</p>
            <p className="staff-identity">
              {staff.display_name}{" "}
              <span className="role-badge">{staff.role.replace("_", " ")}</span>
            </p>
          </div>
          <div className="actions">
            <a
              className="mobile-more"
              href="#more"
              aria-current={nav === "More" ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                go("More");
              }}
            >
              More
            </a>
            <Button variant="outline" onClick={onLock}>
              Lock / Sign out
            </Button>
          </div>
        </header>
        <main id="workspace-main" className="workspace-main" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {nav === "Today" ? today : "TEMPLE UNDERGROUND"}
              </p>
              <h1 tabIndex={-1} ref={heading}>
                {nav === "Today" ? "At the desk" : nav}
              </h1>
              <p className="muted">
                {
                  {
                    Today: "Start with the person in front of you.",
                    People: "Find the right person and their linked payer.",
                    Billing:
                      "Review payer context before making a financial decision.",
                    Classes: "The gym’s local day, in time order.",
                    More: "Reports and the tools behind the desk.",
                  }[nav]
                }
              </p>
            </div>
            <span className="release-badge">Read-only interim release</span>
          </div>
          <ParticipantLookup
            connection={connection}
            query={query}
            setQuery={setQuery}
            selected={participant}
            onSelect={(p) => {
              setParticipant(p);
              setPayer(null);
              go("People");
            }}
            onPayer={(account) => {
              setPayer(account);
              go("Billing");
            }}
            showHelp={nav === "People"}
          />
          {visited.includes("Today") && (
            <div hidden={nav !== "Today"}>
              <Today
                connection={connection}
                today={today}
                month={month}
                setMonth={setMonth}
                onPerson={(name) => {
                  setQuery(name);
                  go("People");
                }}
                onClass={(session) => {
                  setClassSession(session);
                  setDay(localDate(new Date(session.starts_at)));
                  go("Classes");
                }}
              />
            </div>
          )}
          {visited.includes("People") && (
            <div hidden={nav !== "People"}>
              <Waivers connection={connection} selected={participant} />
            </div>
          )}
          {visited.includes("Billing") && (
            <div hidden={nav !== "Billing"}>
              <Billing
                connection={connection}
                payer={payer}
                onPeople={() => go("People")}
                receiptsUrl={receiptsUrl}
              />
            </div>
          )}
          {visited.includes("Classes") && (
            <div hidden={nav !== "Classes"}>
              <Classes
                connection={connection}
                day={day}
                setDay={setDay}
                session={classSession}
                setSession={setClassSession}
              />
            </div>
          )}
          {visited.includes("More") && (
            <div hidden={nav !== "More"}>
              <More
                connection={connection}
                receiptsUrl={receiptsUrl}
                viewerUrl={viewerUrl}
              />
            </div>
          )}
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {destinations.slice(0, 4).map(navLink)}
      </nav>
    </div>
  );
}
