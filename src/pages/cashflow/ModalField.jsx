import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { fmt } from './format';

// Labeled field wrapper for the full-row editor modals.
export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs text-zinc-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

// Collapsible "More details" section for the modals. Starts collapsed; the
// caller passes the secondary fields as children.
export function MoreDetails({ label = 'More details', children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-zinc-800 pt-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-zinc-500 hover:text-zinc-300 transition-colors mb-3"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {label}
      </button>
      {open && children}
    </div>
  );
}

// Always-open input for the modals; commits on blur / Enter / change.
//   type: 'text' | 'number' | 'currency' | 'date' | 'select' | 'checkbox'
export function ModalEdit({ value, type = 'text', options = [], onCommit }) {
  const [draft, setDraft] = useState(value ?? '');
  // Re-sync the draft when the underlying value changes (React's recommended
  // "adjust state during render" pattern — avoids an effect).
  const [prev, setPrev] = useState(value);
  if (value !== prev) { setPrev(value); setDraft(value ?? ''); }

  const base = 'w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-sm text-white focus:border-emerald-600 focus:outline-none';

  if (type === 'checkbox') {
    return (
      <input
        type="checkbox" checked={!!value}
        onChange={(e) => onCommit(e.target.checked)}
        className="h-4 w-4 accent-emerald-500 cursor-pointer"
      />
    );
  }

  if (type === 'select') {
    return (
      <select
        value={draft ?? ''} className={base}
        onChange={(e) => { setDraft(e.target.value); onCommit(e.target.value || null); }}
      >
        {(value == null || !options.includes(value)) && <option value="">—</option>}
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  const numeric = type === 'number' || type === 'currency';

  const commit = () => {
    const out = draft === '' ? null : (numeric ? (parseFloat(draft) || 0) : draft);
    if (out !== (value ?? null)) onCommit(out);
  };

  const input = (
    <input
      type={numeric ? 'number' : type === 'date' ? 'date' : 'text'}
      value={draft ?? ''} className={type === 'currency' ? `${base} pl-6` : base}
      step={numeric ? '0.01' : undefined}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );

  // Currency: leading "$" adornment so money fields read as money.
  if (type === 'currency') {
    return (
      <span className="relative block">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-zinc-500">$</span>
        {input}
      </span>
    );
  }

  return input;
}

// Always-editable dollar amount, tuned for quick numeric entry in a row/line:
// no click-to-start (just focus it), no native number spinner (it's a text
// input under the hood, so nothing to disable), right-justified, and once you
// click away it collapses to a rounded whole-dollar figure — the fiddly cents
// only show up while you're actually typing.
//
// `nullable` is for genuinely-optional amounts (e.g. a credit limit or finance
// charge that may never be set): an unset value reads as "—" and clearing the
// field commits null instead of coercing to $0. Left off, behavior is identical
// to before (null ⇒ $0), which is what always-present amounts like a balance
// want.
export function AmountEdit({ value, onCommit, className = '', nullable = false }) {
  const draftFor = (v) => (nullable ? (v == null ? '' : String(v)) : String(v ?? 0));
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(draftFor(value));
  const [prev, setPrev] = useState(value);
  if (value !== prev && !focused) { setPrev(value); setDraft(draftFor(value)); }

  const commit = () => {
    setFocused(false);
    if (nullable && draft.trim() === '') {
      if (value != null) onCommit(null);
      else setDraft('');
      return;
    }
    const parsed = draft === '' ? 0 : (parseFloat(draft) || 0);
    if (parsed !== (value ?? 0)) onCommit(parsed);
    else setDraft(draftFor(value));
  };

  const empty = nullable && value == null;
  return (
    <input
      type="text" inputMode="decimal"
      value={focused ? draft : (empty ? '' : fmt(value))}
      placeholder={nullable ? '—' : undefined}
      onFocus={(e) => { setDraft(draftFor(value)); setFocused(true); e.target.select(); }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      className={`w-full bg-transparent text-right tabular-nums rounded px-1.5 py-1 -mx-1.5 border border-transparent hover:border-zinc-700 focus:border-emerald-600 focus:bg-zinc-800 focus:outline-none transition-colors ${className}`}
    />
  );
}
