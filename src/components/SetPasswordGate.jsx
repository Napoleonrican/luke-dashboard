import { useState } from 'react';
import { KeyRound, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/useAuth';

// First-run password setup for invited (non-owner) accounts.
//
// The Gig Ops collaborator is added via Supabase's "Invite user" flow rather
// than by creating an account with a password someone else picked — so she
// arrives here with a valid session but no password of her own yet. This gate
// makes her set one before the module renders, and records
// `user_metadata.password_set` so it never asks again.
//
// The owner is skipped entirely: Luke's account predates this and already has
// a password, so it would otherwise prompt him on every visit.
const MIN_LENGTH = 8;

export default function SetPasswordGate({ children }) {
  const { session, isOwner } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState('');
  const [saving, setSaving]     = useState(false);

  const needsPassword =
    session && !isOwner && !session.user?.user_metadata?.password_set;

  if (!needsPassword) return children;

  async function handleSubmit(e) {
    e.preventDefault();
    if (password.length < MIN_LENGTH) {
      setError(`Please use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Those two don't match.");
      return;
    }
    setSaving(true);
    setError('');
    // Sets the password and the flag in one call; onAuthStateChange fires
    // USER_UPDATED, `session` refreshes, and this gate falls through.
    const { error: err } = await supabase.auth.updateUser({
      password,
      data: { password_set: true },
    });
    setSaving(false);
    if (err) {
      setError(err.message || 'Could not save that password.');
      return;
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-xl shadow-black/40">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="rounded-xl bg-cyan-900/30 p-3 text-cyan-400">
            <KeyRound size={22} strokeWidth={1.75} />
          </div>
          <div className="text-center">
            <h2 className="text-base font-semibold text-zinc-100">Choose your password</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Pick something only you know — nobody else can see it.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(''); }}
            placeholder="New password"
            autoComplete="new-password"
            autoFocus
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-cyan-500"
          />
          <input
            type="password"
            value={confirm}
            onChange={(e) => { setConfirm(e.target.value); setError(''); }}
            placeholder="Type it again"
            autoComplete="new-password"
            className={`w-full rounded-lg border bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-cyan-500 ${
              error ? 'border-red-500/60' : 'border-zinc-700'
            }`}
          />
          {error && (
            <p className="flex items-center gap-1.5 text-xs text-red-400">
              <AlertTriangle size={12} /> {error}
            </p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-cyan-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-cyan-600 active:bg-cyan-500 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save and continue'}
          </button>
          <p className="text-center text-[11px] text-zinc-600">
            At least {MIN_LENGTH} characters. You'll use this to sign in from now on.
          </p>
        </form>
      </div>
    </div>
  );
}
