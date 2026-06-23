import { RotateCcw } from 'lucide-react';
import EditCell from './EditCell';
import { fmtDate, todayISO, daysUntil, daysToColor, updatedColor } from './format';

// "Days to next payment" as a heat-colored pill (red soon → green far; overdue = deep red).
export function DaysBadge({ iso }) {
  const d = daysUntil(iso);
  if (d == null) return <span className="text-zinc-600">—</span>;
  const c = daysToColor(d);
  const label = d < 0 ? `${Math.abs(d)}d overdue` : `${d}d`;
  return (
    <span className="rounded px-1.5 py-0.5 text-xs font-medium tabular-nums" style={{ color: c.color, background: c.background }}>
      {label}
    </span>
  );
}

// Editable "Updated" date with a freshness dot (stale = red) and a one-click
// "mark updated today" button.
export function UpdatedCell({ value, onSave }) {
  const c = updatedColor(value);
  return (
    <span className="inline-flex items-center gap-1.5">
      <EditCell
        type="date" value={value} onSave={onSave} display={fmtDate}
        className="rounded px-1.5 py-0.5 text-xs font-medium tabular-nums"
      />
      {value && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: c?.color }} title="freshness" />}
      <button
        onClick={() => onSave(todayISO())}
        title="Mark updated today"
        className="text-zinc-600 hover:text-emerald-400 transition-colors"
      >
        <RotateCcw size={11} />
      </button>
    </span>
  );
}
