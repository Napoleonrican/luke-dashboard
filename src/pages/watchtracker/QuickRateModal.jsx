import { useState, useEffect, useMemo } from 'react';
import { X, Star } from 'lucide-react';
import { tmdbImageUrl } from '../../lib/tmdb';
import { fmtDate } from '../cashflow/format';

const BATCH_SIZE = 5;
const LABELS = { 1: 'Bad', 2: 'Meh', 3: 'Good', 4: 'Great', 5: 'Loved it' };

// "Improve your recommendations" — a short, bottom-sheet rating session:
// shows an unrated watched title, its poster, and (when we have it) the
// date you last watched it, then a labeled 1-5 star picker. Advances
// through a small batch automatically so rating a dozen titles doesn't
// feel like a chore, with a checkpoint every 5 to keep going or stop.
// Media-type agnostic — candidates are pre-normalized by the caller to
// { id, title, tmdb_id, watched_at }; persistence goes through the
// caller's onRate so this component doesn't care if it's a show or movie.
export default function QuickRateModal({ candidates, icon: FallbackIcon, getMeta, onRate, onRated, onClose }) {
  const [mounted, setMounted] = useState(false);
  const [handled, setHandled] = useState(new Set()); // ids rated/skipped this session
  const [batch, setBatch] = useState(() => pickBatch(candidates, new Set()));
  const [index, setIndex] = useState(0);
  const [meta, setMeta] = useState(null);
  const [hoverStar, setHoverStar] = useState(null);

  useEffect(() => { requestAnimationFrame(() => setMounted(true)); }, []);

  const current = batch[index];

  useEffect(() => {
    let active = true;
    if (current?.tmdb_id) {
      getMeta(current.tmdb_id).then(({ data }) => { if (active) setMeta({ tmdbId: current.tmdb_id, data }); });
    }
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.tmdb_id]);

  const currentMeta = meta?.tmdbId === current?.tmdb_id ? meta.data : null;

  const remaining = useMemo(
    () => candidates.filter((c) => !handled.has(c.id)),
    [candidates, handled],
  );

  const advance = (id) => {
    const nextHandled = new Set(handled);
    if (id) nextHandled.add(id);
    setHandled(nextHandled);
    if (index + 1 < batch.length) {
      setIndex(index + 1);
    } else {
      setBatch([]); // empty batch = show the checkpoint screen
    }
  };

  const rate = async (n) => {
    await onRate(current.id, n);
    onRated?.(current.id, n);
    advance(current.id);
  };

  const skip = () => advance(current?.id);

  const rateMore = () => {
    const next = pickBatch(candidates, handled);
    setBatch(next);
    setIndex(0);
  };

  const close = () => {
    setMounted(false);
    setTimeout(onClose, 200);
  };

  const showCheckpoint = batch.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={close}>
      <div
        className={`w-full max-w-md rounded-t-2xl border border-b-0 border-zinc-700 bg-zinc-900 shadow-2xl transition-transform duration-300 ${
          mounted ? 'translate-y-0' : 'translate-y-full'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <h3 className="text-sm font-semibold text-zinc-100">Improve your recommendations</h3>
          <button onClick={close} className="text-zinc-500 hover:text-zinc-300"><X size={16} /></button>
        </div>

        {showCheckpoint ? (
          <div className="p-6 text-center">
            <p className="text-sm text-zinc-300">
              {remaining.length > 0 ? 'Nice work! Want to keep going?' : "That's everything you've watched — nice work!"}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              {remaining.length > 0 && (
                <button
                  onClick={rateMore}
                  className="rounded-lg bg-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/30"
                >
                  Rate 5 more ({remaining.length} left)
                </button>
              )}
              <button
                onClick={close}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:border-zinc-500"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5">
            <div className="mb-3 text-center text-[11px] uppercase tracking-widest text-zinc-600">
              {index + 1} of {batch.length}
            </div>
            <div className="flex gap-4">
              <div className="h-32 w-24 shrink-0 overflow-hidden rounded-lg bg-zinc-800">
                {currentMeta?.poster_path
                  ? <img src={tmdbImageUrl(currentMeta.poster_path, 'w185')} alt="" className="h-full w-full object-cover" />
                  : <div className="flex h-full w-full items-center justify-center"><FallbackIcon className="text-zinc-700" size={22} /></div>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-zinc-100">{current.title}</div>
                <p className="mt-1 text-xs text-zinc-500">
                  {current.watched_at
                    ? `You last watched this on ${fmtDate(current.watched_at)}. How would you rate it?`
                    : 'How would you rate this?'}
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-center gap-2" onMouseLeave={() => setHoverStar(null)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => rate(n)}
                  onMouseEnter={() => setHoverStar(n)}
                  className="flex flex-col items-center gap-1 p-1"
                >
                  <Star size={26} className={n <= (hoverStar ?? 0) ? 'fill-amber-400 text-amber-400' : 'text-zinc-700'} />
                </button>
              ))}
            </div>
            <div className="mt-1 text-center text-xs font-medium text-amber-300">
              {hoverStar ? LABELS[hoverStar] : ' '}
            </div>

            <button onClick={skip} className="mt-3 block w-full text-center text-xs text-zinc-600 hover:text-zinc-400">
              Skip
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function pickBatch(candidates, handled) {
  return candidates
    .filter((c) => !handled.has(c.id))
    .sort((a, b) => (b.watched_at || '').localeCompare(a.watched_at || ''))
    .slice(0, BATCH_SIZE);
}
