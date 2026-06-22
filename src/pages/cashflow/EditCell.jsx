import { useState } from 'react';
import { Check, X, Pencil } from 'lucide-react';

// Inline-editable cell. Click to edit; Enter commits, Escape cancels.
//   type: 'text' | 'number' | 'date' | 'select'
//   options: [{ value, label }] when type === 'select'
//   display: optional fn to format the read-only value
export default function EditCell({
  value, type = 'text', options = [], onSave, display, className = '', placeholder = '—',
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');

  const start = () => { setDraft(value ?? ''); setEditing(true); };
  const cancel = () => { setDraft(value ?? ''); setEditing(false); };
  const commit = () => {
    let out = draft;
    if (type === 'number') out = draft === '' ? null : (parseFloat(draft) || 0);
    if (type === 'date') out = draft === '' ? null : draft;
    if (type === 'text' || type === 'select') out = draft === '' ? null : draft;
    onSave(out);
    setEditing(false);
  };

  if (editing) {
    if (type === 'select') {
      return (
        <span className="flex items-center gap-1">
          <select
            autoFocus value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') cancel(); }}
            className="rounded border border-emerald-600 bg-zinc-800 px-1 py-0.5 text-xs text-white focus:outline-none"
          >
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button onClick={commit} className="text-emerald-400 hover:text-emerald-300"><Check size={13} /></button>
          <button onClick={cancel} className="text-zinc-500 hover:text-zinc-300"><X size={13} /></button>
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1">
        <input
          autoFocus
          type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
          step={type === 'number' ? '0.01' : undefined}
          className="w-full min-w-[5rem] rounded border border-emerald-600 bg-zinc-800 px-1.5 py-0.5 text-xs text-white focus:outline-none"
        />
        <button onClick={commit} className="text-emerald-400 hover:text-emerald-300 shrink-0"><Check size={13} /></button>
        <button onClick={cancel} className="text-zinc-500 hover:text-zinc-300 shrink-0"><X size={13} /></button>
      </span>
    );
  }

  const shown = display ? display(value) : (value ?? placeholder);
  return (
    <button
      onClick={start}
      className={`group inline-flex items-center gap-1 text-left hover:text-white transition-colors ${className}`}
    >
      {shown}
      <Pencil size={10} className="opacity-0 group-hover:opacity-40 shrink-0" />
    </button>
  );
}
