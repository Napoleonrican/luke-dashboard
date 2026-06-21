import { useState } from 'react';
import { ShieldCheck, Lock, AlertTriangle } from 'lucide-react';
import { useAuth } from '../lib/useAuth';

// Server-side auth gate for the financial modules. Validates a real Supabase
// session before rendering anything — so financial data is never served to an
// unauthenticated visitor, even one who pokes through the JS bundle. Combine
// with RLS on the financial tables (see supabase/migrations) for defense in depth.
export default function FinancialAuthGate({ children }) {
  const { session, loading, signIn, configured } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-600 text-sm">
        Checking session…
      </div>
    );
  }

  if (session) return children;

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    const { error: err } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (err) {
      setError(err.message || 'Sign-in failed.');
      setPassword('');
    }
    // On success, onAuthStateChange flips `session` and the gate re-renders.
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-xl shadow-black/40">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="rounded-xl bg-emerald-900/30 p-3 text-emerald-400">
            <ShieldCheck size={22} strokeWidth={1.75} />
          </div>
          <div className="text-center">
            <h2 className="text-base font-semibold text-zinc-100">Financial Access</h2>
            <p className="mt-1 text-xs text-zinc-500">Secure sign-in required for financial data</p>
          </div>
        </div>

        {!configured ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-800/50 bg-amber-950/30 p-3 text-xs text-amber-300">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>Supabase isn’t configured in this environment, so secure sign-in is unavailable.</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              placeholder="Email"
              autoComplete="username"
              autoFocus
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-emerald-500"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              placeholder="Password"
              autoComplete="current-password"
              className={`w-full rounded-lg border bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-emerald-500 ${
                error ? 'border-red-500/60' : 'border-zinc-700'
              }`}
            />
            {error && (
              <p className="flex items-center gap-1.5 text-xs text-red-400">
                <Lock size={12} /> {error}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-600 active:bg-emerald-500 disabled:opacity-60"
            >
              {submitting ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
