import { useState, useEffect } from 'react';
import { Search, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { fetchShows, getShowsMetaCached } from '../../lib/watchtracker';
import { tmdbStatus } from '../../lib/tmdb';
import useScrollRestoration from '../../hooks/useScrollRestoration';
import ShowCard from './ShowCard';
import AddTitleModal from './AddTitleModal';

const STALE_DAYS = 30;
const RECENT_SEASON_DAYS = 120;
const FINISHED_STATUSES = new Set(['Ended', 'Canceled']);
const GRID = 'grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6';

// True if any season's air_date falls within the last RECENT_SEASON_DAYS —
// catches "a new season just dropped" even for a show whose last watch was
// a while ago (e.g. caught up on last season, next one just premiered).
function hasRecentSeason(meta) {
  const seasons = meta?.raw_json?.seasons ?? [];
  const cutoff = Date.now() - RECENT_SEASON_DAYS * 24 * 60 * 60 * 1000;
  return seasons.some((se) => se.air_date && new Date(se.air_date).getTime() >= cutoff);
}

// meta.number_of_episodes counts every planned episode, including ones from
// an announced-but-not-yet-aired season — comparing watched count against
// that makes a genuinely caught-up show ("Returning Series", nothing new
// out yet) look behind, and it lands in Watch Next instead of Caught Up.
// Count only what's actually aired (via last_episode_to_air + per-season
// episode counts), falling back to the raw total if that's missing.
function airedEpisodeCount(meta) {
  const last = meta?.raw_json?.last_episode_to_air;
  // Season 0 is TMDB's "Specials" bucket — not part of the regular-episode
  // numbering wt_episodes/ep_watch_count tracks, and the show detail page's
  // own season list already excludes it too. Counting it here inflated the
  // aired total past what's actually trackable, so a fully-watched show
  // (e.g. 49/49 real episodes) never reached "watched >= aired" and stayed
  // stuck out of Finished/Caught Up.
  const seasons = (meta?.raw_json?.seasons ?? []).filter((se) => se.season_number > 0);
  if (!last || last.season_number < 1 || seasons.length === 0) return meta?.number_of_episodes ?? null;
  let count = 0;
  for (const se of seasons) {
    if (se.season_number < last.season_number) count += se.episode_count || 0;
    else if (se.season_number === last.season_number) count += last.episode_number || 0;
  }
  return count;
}

// TVTime-style home sectioning: Watch Next (in progress and recently
// watched, OR a new season just came out), Haven't watched for a while (in
// progress, gone quiet, oldest last-watched first), Haven't started
// (followed but never opened), Watch Later (explicitly set aside via the
// show's "..." menu — pulled out of every other bucket), Caught Up (caught
// up but still airing), Finished (caught up + TMDB says the show has ended/
// been canceled). `metaByTmdbId` only has whatever's already cached locally
// — no live TMDB calls happen just to sort shows into buckets.
function sectionShows(shows, metaByTmdbId) {
  const active = shows.filter((s) => s.is_followed && !s.is_archived);

  const watchLater = active.filter((s) => s.is_for_later);
  const notWatchLater = active.filter((s) => !s.is_for_later);

  const caughtUpState = (s) => {
    const meta = metaByTmdbId.get(s.tmdb_id);
    const aired = airedEpisodeCount(meta);
    if (!meta || aired == null) return null;
    if ((s.ep_watch_count ?? 0) < aired) return null;
    return FINISHED_STATUSES.has(tmdbStatus(meta)) ? 'finished' : 'caughtUp';
  };

  const finished = notWatchLater.filter((s) => caughtUpState(s) === 'finished');
  const caughtUp = notWatchLater.filter((s) => caughtUpState(s) === 'caughtUp');
  const rest = notWatchLater.filter((s) => caughtUpState(s) === null);
  const inProgress = rest.filter((s) => (s.ep_watch_count ?? 0) > 0);
  const notStarted = rest.filter((s) => !(s.ep_watch_count > 0))
    .sort((a, b) => (b.followed_at || '').localeCompare(a.followed_at || ''));

  const staleCutoff = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;
  const isStale = (s) => !s.last_watched_at || new Date(s.last_watched_at).getTime() < staleCutoff;
  const isNewSeason = (s) => hasRecentSeason(metaByTmdbId.get(s.tmdb_id));

  const watchNext = inProgress.filter((s) => !isStale(s) || isNewSeason(s))
    .sort((a, b) => (b.last_watched_at || '').localeCompare(a.last_watched_at || ''));
  const haventWatched = inProgress.filter((s) => isStale(s) && !isNewSeason(s))
    .sort((a, b) => (a.last_watched_at || '').localeCompare(b.last_watched_at || ''));

  return { watchNext, haventWatched, notStarted, watchLater, caughtUp, finished };
}

export default function Shows() {
  const [shows, setShows] = useState([]);
  const [metaByTmdbId, setMetaByTmdbId] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState('sections'); // sections | archived | all
  const [showAdd, setShowAdd] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  useScrollRestoration('/watch-tracker/shows', !loading);

  useEffect(() => {
    let active = true;
    fetchShows().then(async ({ data, error: err }) => {
      if (!active) return;
      const list = data ?? [];
      setShows(list);
      setError(err);
      const tmdbIds = [...new Set(list.map((s) => s.tmdb_id).filter(Boolean))];
      const { data: metaRows } = await getShowsMetaCached(tmdbIds);
      if (active) setMetaByTmdbId(new Map((metaRows ?? []).map((m) => [m.tmdb_id, m])));
      setLoading(false);
    });
    return () => { active = false; };
  }, [reloadKey]);

  const handleMeta = (tmdbId, meta) => {
    setMetaByTmdbId((prev) => (prev.get(tmdbId) === meta ? prev : new Map(prev).set(tmdbId, meta)));
  };

  const matchesQuery = (s) => s.series_name.toLowerCase().includes(query.toLowerCase());

  if (loading) return <div className="py-12 text-center text-zinc-600">Loading shows…</div>;
  if (error) return <div className="py-12 text-center text-red-400/90">Couldn&rsquo;t load shows.</div>;

  const searching = query.trim().length > 0;
  const { watchNext, haventWatched, notStarted, watchLater, caughtUp, finished } = sectionShows(shows.filter(matchesQuery), metaByTmdbId);

  const listView = {
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
        <button
          onClick={() => setShowAdd(true)}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
        >
          <Plus size={13} /> Add show
        </button>
      </div>

      {view === 'sections' || searching ? (
        <div className="space-y-6">
          <Section title="Watch Next" shows={watchNext} onMeta={handleMeta} />
          <Section title="Haven't watched for a while" shows={haventWatched} onMeta={handleMeta} />
          <Section title="Haven't started" shows={notStarted} onMeta={handleMeta} />
          <CollapsibleSection title="Watch Later" shows={watchLater} onMeta={handleMeta} />
          <CollapsibleSection title="Caught up" shows={caughtUp} onMeta={handleMeta} />
          <CollapsibleSection title="Finished" shows={finished} onMeta={handleMeta} />
          {watchNext.length + haventWatched.length + notStarted.length + watchLater.length + caughtUp.length + finished.length === 0 && (
            <div className="py-12 text-center text-zinc-600">No shows match.</div>
          )}
        </div>
      ) : (
        <div className={GRID}>
          {listView.length === 0 && <div className="col-span-full py-12 text-center text-zinc-600">No shows match.</div>}
          {listView.map((show) => <ShowCard key={show.id} show={show} onMeta={handleMeta} />)}
        </div>
      )}

      {showAdd && (
        <AddTitleModal mediaType="tv" onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); reload(); }} />
      )}
    </div>
  );
}

function Section({ title, shows, onMeta }) {
  if (shows.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-600">{title}</h3>
      <div className={GRID}>
        {shows.map((show) => <ShowCard key={show.id} show={show} onMeta={onMeta} />)}
      </div>
    </div>
  );
}

function CollapsibleSection({ title, shows, onMeta }) {
  const [open, setOpen] = useState(false);
  if (shows.length === 0) return null;
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-zinc-600 hover:text-zinc-400"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {title} ({shows.length})
      </button>
      {open && (
        <div className={GRID}>
          {shows.map((show) => <ShowCard key={show.id} show={show} onMeta={onMeta} />)}
        </div>
      )}
    </div>
  );
}
