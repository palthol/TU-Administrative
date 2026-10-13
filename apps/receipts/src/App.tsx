import { useEffect, useRef, useState, type FormEvent } from 'react';
import { adminFetch, getDefaultApiBase } from '@/lib/admin-api';
import {
  destinations,
  fromHash,
  type BoardSelection,
  type Connection,
  type Destination,
  type Staff,
} from '@/lib/finance';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Cash } from '@/components/finance/Cash';
import { Invoice } from '@/components/finance/Invoice';
import { Recent } from '@/components/finance/Recent';
import { Formal } from '@/components/finance/Formal';
import { More } from '@/components/finance/More';

const SUPPORTED_ROLES = ['owner', 'finance', 'front_desk'];

const navMeta: Record<Destination, { symbol: string; label: string }> = {
  Cash: { symbol: '$', label: 'Cash' },
  Invoice: { symbol: '≡', label: 'Invoice' },
  Recent: { symbol: '◷', label: 'Recent' },
  Formal: { symbol: '⌘', label: 'Formal' },
  More: { symbol: '···', label: 'More' },
};

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
    window.addEventListener('finance-session-expired', lock);
    return () => {
      window.removeEventListener('finance-session-expired', lock);
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
        '/api/admin/auth/me',
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      if (!ok || !data.staff) {
        if (status === 401) throw new Error('That key was not accepted.');
        if (status === 403) throw new Error('Your staff role cannot access finance.');
        throw new Error(data.error || `Unable to unlock (HTTP ${status}).`);
      }
      if (!SUPPORTED_ROLES.includes(data.staff.role)) {
        throw new Error('The API did not return a supported staff identity.');
      }
      setSession({ key, staff: data.staff });
      setDraftKey('');
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : 'Unable to unlock.');
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
          <h1>Finance workspace</h1>
          <p className="muted">Log cash, invoices, and careful formal payments.</p>
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
              Your key stays in memory and clears on lock or reload.
            </p>
            <Button disabled={loading || !draftKey.trim()}>
              {loading ? 'Checking identity…' : 'Unlock workspace'}
            </Button>
            {error ? (
              <p role="alert" className="error-message">
                {error}
              </p>
            ) : null}
          </form>
          <p className="release-note">Operator write tool · personal log + formal billing</p>
        </div>
      </main>
    );
  }

  return (
    <Workspace
      connection={{ apiBase, adminKey: session.key }}
      staff={session.staff}
      onLock={() => {
        setSession(null);
        setDraftKey('');
        setError('');
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
  const [boardSelection, setBoardSelection] = useState<BoardSelection | null>(null);
  const headingFocus = useRef(false);
  const scrollPositions = useRef<Partial<Record<Destination, number>>>({});
  const previous = useRef(nav);
  const defaultIssuedBy = staff.display_name || '';

  useEffect(() => {
    const change = () => {
      if (
        destinations.some((d) => `#${d.toLowerCase()}` === window.location.hash) ||
        !window.location.hash
      ) {
        setNav(fromHash());
      }
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);

  useEffect(() => {
    setVisited((v) => (v.includes(nav) ? v : [...v, nav]));
    if (previous.current !== nav) {
      const el = document.getElementById('finance-heading');
      if (headingFocus.current) el?.focus({ preventScroll: true });
      headingFocus.current = true;
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
      aria-current={nav === name ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault();
        go(name);
      }}
    >
      <span className="nav-symbol" aria-hidden>
        {navMeta[name].symbol}
      </span>
      {navMeta[name].label}
    </a>
  );

  return (
    <div className="operator-shell">
      <a className="skip-link" href="#finance-main">
        Skip to content
      </a>
      <aside className="operator-rail" aria-label="Finance destinations">
        <p className="brand-mark">TEMPLE / UNDERGROUND</p>
        <p className="rail-caption">FINANCE WORKSPACE</p>
        <nav>{destinations.map(navLink)}</nav>
        <p className="rail-foot">LOOK UP / LOG / ACT WITH CARE</p>
      </aside>
      <div className="operator-body">
        <header className="workspace-header">
          <div>
            <p className="brand-mobile">TEMPLE / UNDERGROUND</p>
            <p className="staff-identity">
              {staff.display_name}
              <span className="role-badge">{staff.role}</span>
            </p>
          </div>
          <div className="actions">
            <a
              className="mobile-more"
              href="#more"
              aria-current={nav === 'More' ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault();
                go('More');
              }}
            >
              More
            </a>
            <Button type="button" variant="outline" onClick={onLock}>
              Lock
            </Button>
          </div>
        </header>
        <main id="finance-main" className="workspace-main">
          {visited.includes('Cash') ? (
            <div hidden={nav !== 'Cash'}>
              <Cash connection={connection} defaultIssuedBy={defaultIssuedBy} />
            </div>
          ) : null}
          {visited.includes('Invoice') ? (
            <div hidden={nav !== 'Invoice'}>
              <Invoice connection={connection} defaultIssuedBy={defaultIssuedBy} />
            </div>
          ) : null}
          {visited.includes('Recent') ? (
            <div hidden={nav !== 'Recent'}>
              <Recent connection={connection} />
            </div>
          ) : null}
          {visited.includes('Formal') ? (
            <div hidden={nav !== 'Formal'}>
              <Formal
                connection={connection}
                defaultIssuedBy={defaultIssuedBy}
                selection={boardSelection}
                onSelectBoard={setBoardSelection}
              />
            </div>
          ) : null}
          {visited.includes('More') ? (
            <div hidden={nav !== 'More'}>
              <More connection={connection} defaultIssuedBy={defaultIssuedBy} />
            </div>
          ) : null}
        </main>
        <nav className="bottom-nav" aria-label="Finance destinations">
          {(['Cash', 'Invoice', 'Recent', 'Formal'] as const).map(navLink)}
        </nav>
      </div>
    </div>
  );
}
