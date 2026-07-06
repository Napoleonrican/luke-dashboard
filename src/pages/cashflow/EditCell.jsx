import { useRef, useState } from 'react';
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
  // Leaving edit mode (Escape/Enter/Check/X) unmounts the focused input, which
  // fires a synchronous blur. Without this guard that blur re-runs commit() with
  // the still-typed draft — silently saving an edit the user just cancelled with
  // Escape (and double-firing onSave after a real commit). Set on every
  // programmatic exit; the blur handler consumes and clears it.
  const skipBlurCommit = useRef(false);

  const start = () => { skipBlurCommit.current = false; setDraft(value ?? ''); setEditing(true); };
  const cancel = () => { skipBlurCommit.current = true; setDraft(value ?? ''); setEditing(false); };
  const normalize = (raw) => {
    if (type === 'number') return raw === '' ? null : (parseFloat(raw) || 0);
    if (type === 'date') return raw === '' ? null : raw;
    return raw === '' ? null : raw; // text / select
  };
  const commit = (raw = draft) => {
    skipBlurCommit.current = true;
    onSave(normalize(raw));
    setEditing(false);
  };
  // A real click-away blur commits; a blur fired by unmounting on
  // cancel()/commit() is suppressed (and the flag reset for next time).
  const handleBlur = () => {
    if (skipBlurCommit.current) { skipBlurCommit.current = false; return; }
    commit();
  };

  // Commit on blur (click-away) to match ModalEdit's behavior. The Check/X
  // buttons preventDefault on mousedown so they don't steal focus / fire a
  // blur-commit before their own click handler runs — otherwise clicking
  // Cancel would commit first, defeating the cancel.
  const keepFocus = (e) => e.preventDefault();

  if (editing) {
    if (type === 'select') {
      return (
        <span className="flex items-center gap-1">
          <select
            autoFocus value={draft}
            onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }}
            onKeyDown={(e) => { if (e.key === 'Escape') cancel(); }}
            className="rounded border border-emerald-600 bg-zinc-800 px-1 py-0.5 text-xs text-white focus:outline-none"
          >
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button onMouseDown={keepFocus} onClick={cancel} className="text-zinc-500 hover:text-zinc-300"><X size={13} /></button>
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
          onBlur={handleBlur}
          step={type === 'number' ? '0.01' : undefined}
          className="w-full min-w-[5rem] rounded border border-emerald-600 bg-zinc-800 px-1.5 py-0.5 text-xs text-white focus:outline-none"
        />
        <button onMouseDown={keepFocus} onClick={() => commit()} className="text-emerald-400 hover:text-emerald-300 shrink-0"><Check size={13} /></button>
        <button onMouseDown={keepFocus} onClick={cancel} className="text-zinc-500 hover:text-zinc-300 shrink-0"><X size={13} /></button>
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
