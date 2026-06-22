import { useState } from 'react';

// Labeled field wrapper for the full-row editor modals.
export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs text-zinc-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

// Always-open input for the modals; commits on blur / Enter / change.
//   type: 'text' | 'number' | 'date' | 'select' | 'checkbox'
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

  const commit = () => {
    const out = draft === '' ? null : (type === 'number' ? (parseFloat(draft) || 0) : draft);
    if (out !== (value ?? null)) onCommit(out);
  };

  return (
    <input
      type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
      value={draft ?? ''} className={base}
      step={type === 'number' ? '0.01' : undefined}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}
