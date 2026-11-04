import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getDefaultApiBase } from '@/lib/admin-api';
import { authLogin, authMe, mapLoginFailure } from '@/lib/auth-api';
import { validateReturnTo } from '@/lib/return-to';

function redirectTargetOrDashboardHome(returnTo: string | null): string {
  return returnTo ?? '/';
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const apiBase = useMemo(() => getDefaultApiBase(), []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submitted = useRef(false);

  const returnToParam = params.get('return_to');
  const validatedReturnTo = validateReturnTo(returnToParam, { isDev: Boolean(import.meta.env?.DEV) });
  const target = redirectTargetOrDashboardHome(validatedReturnTo);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const me = await authMe(apiBase, controller.signal);
        if (!me.ok) return;
        if (validatedReturnTo) {
          window.location.assign(validatedReturnTo);
          return;
        }
        navigate('/', { replace: true });
      } catch {
        // ignore network errors; the login form will display errors on submit
      }
    })();
    return () => controller.abort();
  }, [apiBase, navigate, validatedReturnTo]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading || submitted.current) return;
    submitted.current = true;
    setLoading(true);
    setError('');
    try {
      const result = await authLogin(apiBase, email.trim(), password);
      if (result.ok) {
        if (validatedReturnTo) {
          window.location.assign(validatedReturnTo);
          return;
        }
        navigate('/', { replace: true });
        return;
      }
      setError(mapLoginFailure(result.status, result.data));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sign in.');
    } finally {
      submitted.current = false;
      setLoading(false);
    }
  }

  return (
    <main className="unlock-page">
      <div className="unlock-card">
        <p className="brand-mark">TEMPLE / UNDERGROUND</p>
        <h1>Sign in</h1>
        <p className="muted">Use your admin email and password.</p>
        <form onSubmit={onSubmit} className="stack">
          <label htmlFor="email">Email</label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (error) setError('');
            }}
            disabled={loading}
          />
          <label htmlFor="password">Password</label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              if (error) setError('');
            }}
            disabled={loading}
          />
          <Button disabled={loading || !email.trim() || !password}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
          {error ? (
            <p role="alert" className="error-message">
              {error}
            </p>
          ) : null}
          {validatedReturnTo ? (
            <p className="muted text-sm">After sign-in: {target}</p>
          ) : returnToParam ? (
            <p className="muted text-sm">After sign-in: dashboard home</p>
          ) : null}
        </form>
      </div>
    </main>
  );
}

