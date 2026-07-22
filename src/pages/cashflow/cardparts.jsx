import { Maximize2, Trash2 } from 'lucide-react';

// ── Mobile card view for the wide Cashflow tables ─────────────────────────────
// Bills/Debts (and their many columns) are built desktop-first and scroll
// horizontally on a phone, which is fine for the primary desktop use but awkward
// for the "one-off checkup on my phone" case Luke asked for. These pieces render
// the same rows as a stacked, read-first card below `md`; the table stays the
// desktop layout (hidden md:block on the caller side).
//
// A card is a summary you tap to open the row's existing full-editor modal —
// that modal is already single-column on mobile, so all editing flows through it
// rather than trying to cram inline editors into a narrow card. Delete stays on
// the card (isolated with stopPropagation) so a quick removal doesn't need the
// modal.

// Container for the card list. `md:hidden` — the desktop table takes over at md+.
export function CardList({ children }) {
  return <div className="md:hidden space-y-3">{children}</div>;
}

// Message card mirroring the table's StateRow (loading / empty).
export function CardState({ children }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-8 text-center text-zinc-600">
      {children}
    </div>
  );
}

// Load-failure card mirroring LoadErrorRow so an error doesn't read as "empty".
export function CardLoadError({ onRetry }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-8 text-center">
      <span className="text-red-400/90">Couldn&rsquo;t load this data.</span>{' '}
      <button
        onClick={onRetry}
        className="font-medium text-emerald-400 underline underline-offset-2 transition-colors hover:text-emerald-300"
      >
        Retry
      </button>
    </div>
  );
}

// The card shell. Tapping anywhere opens the full editor (onOpen); the trash
// button removes the row without opening it.
export function Card({ dotColor, title, headline, onOpen, onDelete, deleteLabel, children, surfaceClass = 'bg-zinc-900 hover:bg-zinc-800/40' }) {
  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className={`rounded-xl border border-zinc-800 p-3.5 cursor-pointer transition-colors focus:outline-none focus:ring-1 focus:ring-emerald-600 ${surfaceClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: dotColor }} />
          <span className="font-semibold text-zinc-100 truncate">{title}</span>
          <Maximize2 size={12} className="text-zinc-600 shrink-0" />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {headline}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            aria-label={deleteLabel}
            title="Delete"
            className="text-red-400/70 hover:text-red-400 transition-colors p-3 -m-3"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
        {children}
      </dl>
    </div>
  );
}

// One label/value pair inside a Card. `full` spans both grid columns (e.g. for a
// date + days badge that needs the room).
export function CardField({ label, children, full = false }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <dt className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-zinc-200 tabular-nums">{children ?? <span className="text-zinc-600">—</span>}</dd>
    </div>
  );
}
