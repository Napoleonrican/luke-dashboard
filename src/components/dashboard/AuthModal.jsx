import { useState, useEffect } from 'react';
import { ShieldCheck, Lock, AlertTriangle, X } from 'lucide-react';
import { useAuth } from '../../lib/useAuth';

// Centered sign-in modal — the same server-validated Supabase auth as
// FinancialAuthGate, but rendered as an overlay so the dashboard stays visible
// (blurred) behind it instead of the whole page being gated. Used to unlock the
// inline Mission Control panel without leaving the dashboard.
export default function AuthModal({ onClose, title = 'Mission Control', subtitle = 'Secure sign-in required' }) {
  const { signIn, configured } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    const { error: err } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (err) {
      setError(err.message || 'Sign-in failed.');
      setPassword('');
    } else {
      onClose(); // session flips via onAuthStateChange; panel re-renders live
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-xl shadow-black/40">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="rounded-xl bg-cyan-900/30 p-3 text-cyan-400">
            <ShieldCheck size={22} strokeWidth={1.75} />
          </div>
          <div className="text-center">
            <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
            <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
          </div>
        </div>

        {!configured ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-800/50 bg-amber-950/30 p-3 text-xs text-amber-300">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>Supabase isn&apos;t configured in this environment, so secure sign-in is unavailable.</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="email" value={email} autoComplete="username" autoFocus placeholder="Email"
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-cyan-500"
            />
            <input
              type="password" value={password} autoComplete="current-password" placeholder="Password"
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              className={`w-full rounded-lg border bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-cyan-500 ${error ? 'border-red-500/60' : 'border-zinc-700'}`}
            />
            {error && <p className="flex items-center gap-1.5 text-xs text-red-400"><Lock size={12} /> {error}</p>}
            <button
              type="submit" disabled={submitting}
              className="rounded-lg bg-cyan-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-cyan-600 active:bg-cyan-500 disabled:opacity-60"
            >
              {submitting ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
