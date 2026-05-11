import { useState } from 'react';
import { Lock } from 'lucide-react';

const PASSWORD = 'Napoleon21!';
const STORAGE_KEY = 'dashboard_auth';

export default function ProtectedRoute({ children }) {
  const [authed, setAuthed] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true');
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);

  if (authed) return children;

  function handleSubmit(e) {
    e.preventDefault();
    if (input === PASSWORD) {
      localStorage.setItem(STORAGE_KEY, 'true');
      setAuthed(true);
    } else {
      setError(true);
      setInput('');
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-xl shadow-black/40">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="rounded-xl bg-zinc-800 p-3 text-zinc-400">
            <Lock size={22} strokeWidth={1.75} />
          </div>
          <div className="text-center">
            <h2 className="text-base font-semibold text-zinc-100">Private Access</h2>
            <p className="mt-1 text-xs text-zinc-500">Personal dashboard — private access only</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(false); }}
            placeholder="Password"
            autoFocus
            className={`w-full rounded-lg border bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-zinc-500 ${
              error ? 'border-red-500/60' : 'border-zinc-700'
            }`}
          />
          {error && (
            <p className="text-xs text-red-400">Incorrect password.</p>
          )}
          <button
            type="submit"
            className="rounded-lg bg-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-600 active:bg-zinc-500"
          >
            Unlock
          </button>
        </form>
      </div>
    </div>
  );
}
