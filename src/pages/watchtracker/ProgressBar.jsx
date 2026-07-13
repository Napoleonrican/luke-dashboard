// Thin watched/total episode-count bar under a poster, matching TVTime's
// watch-list poster progress strip.
export default function ProgressBar({ value, total, className = '' }) {
  if (!total) return null;
  const pct = Math.max(0, Math.min(100, (value / total) * 100));
  return (
    <div className={`h-1 w-full overflow-hidden rounded-full bg-zinc-800 ${className}`}>
      <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
    </div>
  );
}
