import { useState } from 'react';
import { ShieldCheck, Lock, AlertTriangle, ShieldOff, MailCheck } from 'lucide-react';
import { useAuth } from '../lib/useAuth';
import { supabase } from '../lib/supabase';

// Self-service "email me a link so I can set a password" flow, shown only where
// `allowPasswordSetup` is set (the Gig Ops gate). This exists because Supabase's
// invite email redirects to the project's Site URL, which is Luke's hostname —
// and sessions are scoped per origin, so an invite consumed there would NOT
// carry over to Miranda's own hostname. Sending the link with
// `redirectTo: window.location.origin` pins it to whatever host she's actually
// on, so she sets her password and signs in without ever leaving her own URL.
function PasswordSetup() {
  const [open, setOpen]     = useState(false);
  const [email, setEmail]   = useState('');
  const [sent, setSent]     = useState(false);
  const [error, setError]   = useState('');
  const [sending, setSending] = useState(false);

  async function send(e) {
    e.preventDefault();
    if (!email.trim() || !supabase) return;
    setSending(true);
    setError('');
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    setSending(false);
    if (err) { setError(err.message || 'Could not send the email.'); return; }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-800/50 bg-emerald-950/30 p-3 text-xs text-emerald-300">
        <MailCheck size={15} className="shrink-0 mt-0.5" />
        <span>
          Check your email for a link. Opening it brings you back here and lets you choose a
          password.
        </span>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 w-full text-center text-[11px] text-zinc-500 underline decoration-dotted transition-colors hover:text-zinc-300"
      >
        First time here, or forgot your password?
      </button>
    );
  }

  return (
    <form onSubmit={send} className="mt-4 flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Enter your email and we'll send a link to set your password.
      </p>
      <input
        type="email"
        value={email}
        onChange={(e) => { setEmail(e.target.value); setError(''); }}
        placeholder="Email"
        autoComplete="username"
        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-cyan-500"
      />
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={sending || !email.trim()}
        className="rounded-lg bg-zinc-700 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-zinc-600 disabled:opacity-60"
      >
        {sending ? 'Sending…' : 'Send me a link'}
      </button>
    </form>
  );
}

// Server-side auth gate for private modules. Validates a real Supabase session
// before rendering anything — so gated data is never served to an
// unauthenticated visitor, even one who pokes through the JS bundle. Combine
// with RLS on the underlying tables (see supabase/migrations) for defense in
// depth. Copy defaults to the financial framing; pass `title` / `subtitle` to
// reuse it for other private modules (e.g. Mission Control).
//
// `requireOwner`: the collaborator now has her own real Supabase Auth login
// (for Gig Ops), so a valid session alone no longer implies "this is Luke."
// Every module that must stay Luke-only sets this — it checks identity, not
// just presence, of a session.
export default function FinancialAuthGate({
  children,
  title = 'Financial Access',
  subtitle = 'Secure sign-in required for financial data',
  requireOwner = false,
  allowPasswordSetup = false,
}) {
  const { session, loading, signIn, configured, isOwner } = useAuth();
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

  if (session && requireOwner && !isOwner) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-xl shadow-black/40 text-center">
          <div className="mb-4 flex justify-center">
            <div className="rounded-xl bg-red-900/30 p-3 text-red-400">
              <ShieldOff size={22} strokeWidth={1.75} />
            </div>
          </div>
          <h2 className="text-base font-semibold text-zinc-100">Not available on this account</h2>
          <p className="mt-2 text-xs text-zinc-500">
            This area is restricted. Signed in as {session.user?.email}.
          </p>
        </div>
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
            <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
            <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
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

        {configured && allowPasswordSetup && <PasswordSetup />}
      </div>
    </div>
  );
}
