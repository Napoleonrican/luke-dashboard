import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { fetchShows } from '../../lib/watchtracker';
import ShowCard from './ShowCard';

const STALE_DAYS = 30;

// TVTime-style home sectioning: Watch Next (in progress, most recently
// watched), Haven't watched for a while (in progress, gone quiet), Haven't
// started (followed but never opened). Purely derived from already-fetched
// wt_shows — no new fetch or table.
function sectionShows(shows) {
  const active = shows.filter((s) => s.is_followed && !s.is_archived);
  const inProgress = active.filter((s) => (s.ep_watch_count ?? 0) > 0);
  const notStarted = active.filter((s) => !(s.ep_watch_count > 0));

  const staleCutoff = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;
  const isStale = (s) => !s.last_watched_at || new Date(s.last_watched_at).getTime() < staleCutoff;

  const watchNext = inProgress.filter((s) => !isStale(s))
    .sort((a, b) => (b.last_watched_at || '').localeCompare(a.last_watched_at || ''));
  const haventWatched = inProgress.filter(isStale)
    .sort((a, b) => (a.last_watched_at || '').localeCompare(b.last_watched_at || ''));

  return { watchNext, haventWatched, notStarted };
}

export default function Shows() {
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState('sections'); // sections | watchlist | archived | all
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let active = true;
    fetchShows().then(({ data, error: err }) => {
      if (!active) return;
      setShows(data ?? []);
      setError(err);
      setLoading(false);
    });
    return () => { active = false; };
  }, [reloadKey]);

  const matchesQuery = (s) => s.series_name.toLowerCase().includes(query.toLowerCase());

  if (loading) return <div className="py-12 text-center text-zinc-600">Loading shows…</div>;
  if (error) return <div className="py-12 text-center text-red-400/90">Couldn&rsquo;t load shows.</div>;

  const searching = query.trim().length > 0;
  const { watchNext, haventWatched, notStarted } = sectionShows(shows.filter(matchesQuery));

  const listView = {
    watchlist: shows.filter((s) => s.is_for_later),
    archived: shows.filter((s) => s.is_archived),
    all: shows,
  }[view]?.filter(matchesQuery);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shows…"
            className="rounded-lg border border-zinc-700 bg-zinc-900 py-1.5 pl-8 pr-3 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-500"
          />
        </div>
        <div className="flex gap-1">
          {[
            ['sections', 'Watch List'],
            ['watchlist', 'Watchlist'],
            ['archived', 'Archived'],
            ['all', 'All'],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                view === key ? 'bg-red-500/20 text-red-300' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === 'sections' || searching ? (
        <div className="space-y-6">
          <Section title="Watch Next" shows={watchNext} onChange={reload} />
          <Section title="Haven't watched for a while" shows={haventWatched} onChange={reload} />
          <Section title="Haven't started" shows={notStarted} onChange={reload} />
          {watchNext.length + haventWatched.length + notStarted.length === 0 && (
            <div className="py-12 text-center text-zinc-600">No shows match.</div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {listView.length === 0 && <div className="col-span-full py-12 text-center text-zinc-600">No shows match.</div>}
          {listView.map((show) => <ShowCard key={show.id} show={show} onChange={reload} />)}
        </div>
      )}
    </div>
  );
}

function Section({ title, shows, onChange }) {
  if (shows.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-600">{title}</h3>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {shows.map((show) => <ShowCard key={show.id} show={show} onChange={onChange} />)}
      </div>
    </div>
  );
}
