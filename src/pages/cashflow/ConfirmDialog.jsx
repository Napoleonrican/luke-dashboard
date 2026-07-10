import { AlertTriangle } from 'lucide-react';

// Small centered confirmation modal for destructive actions (delete an
// account, remove an ad-hoc bill, …) — replaces native window.confirm() so it
// matches the module's dark/light theming and reads consistently across
// Cashflow instead of a jarring browser dialog.
//
//   open: the item/context being confirmed, or null to render nothing.
//   title/message: copy. `message` can reference the item via a render prop
//     pattern isn't needed here — callers just pass a string built ahead of time.
//   confirmLabel: defaults to "Delete".
//   onConfirm / onCancel: called with no arguments; the caller already has
//     the relevant id in closure scope.
export default function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-900/30 text-red-400">
            <AlertTriangle size={16} />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            <p className="mt-1 text-xs text-zinc-400">{message}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg border border-red-700 bg-red-900/40 px-3.5 py-2 text-sm font-medium text-red-300 hover:bg-red-900/60 hover:text-red-200 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
