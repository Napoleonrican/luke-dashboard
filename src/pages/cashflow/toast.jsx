import { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

// Lightweight, dependency-free toast for the Cashflow module. A single
// <ToastHost> mounted in CashflowLayout renders every message; any table can
// fire one by importing notifyError() — no prop threading required.
//
// This exists so optimistic writes (update/add/remove/delete) can surface a
// failure instead of silently keeping a local change the DB rejected.

let nextId = 0;
const listeners = new Set();

export function notifyError(message) {
  const toast = { id: ++nextId, message, tone: 'error' };
  listeners.forEach((fn) => fn(toast));
}

export function ToastHost() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const add = (t) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, 6000);
    };
    listeners.add(add);
    return () => { listeners.delete(add); };
  }, []);

  const dismiss = (id) => setToasts((prev) => prev.filter((x) => x.id !== id));

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-red-800 bg-red-950/95 px-3.5 py-3 text-sm text-red-100 shadow-xl shadow-black/40 backdrop-blur"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-400" />
          <span className="min-w-0 flex-1">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
            className="shrink-0 text-red-300/70 transition-colors hover:text-red-100"
          >
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
