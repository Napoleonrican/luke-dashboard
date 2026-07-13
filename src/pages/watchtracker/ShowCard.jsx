import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Star, Bookmark, Check, Repeat, Tv } from 'lucide-react';
import { getShowMetadata, fetchEpisodes, setEpisodeWatched, bumpRewatch, updateShow } from '../../lib/watchtracker';
import { tmdbImageUrl, tmdbConfigured } from '../../lib/tmdb';
import EditCell from '../cashflow/EditCell';
import ProgressBar from './ProgressBar';
import RatingAndProviders from './RatingAndProviders';

// One show's card: poster + follow/favorite/watchlist badges + progress, with
// an expand-in-place season/episode grid for the core "mark watched" loop
// (matches TVTime's own interaction — no separate detail route).
export default function ShowCard({ show, onChange }) {
  const [open, setOpen] = useState(false);
  const [meta, setMeta] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  useEffect(() => {
    let active = true;
    if (tmdbConfigured && show.tmdb_id) {
      getShowMetadata(show.tmdb_id).then(({ data }) => { if (active) setMeta(data); });
    }
    return () => { active = false; };
  }, [show.tmdb_id]);

  const loadEpisodes = async () => {
    setLoadingEpisodes(true);
    const { data } = await fetchEpisodes(show.id);
    setEpisodes(data ?? []);
    setLoadingEpisodes(false);
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && episodes.length === 0) loadEpisodes();
  };

  const watchedSet = new Set(episodes.map((e) => `${e.season_number}:${e.episode_number}`));
  const totalEpisodes = meta?.number_of_episodes ?? null;
  const watchedCount = show.ep_watch_count ?? episodes.length;

  const markWatched = async (season, episode, watched) => {
    await setEpisodeWatched({ show_id: show.id, season_number: season, episode_number: episode }, watched);
    await loadEpisodes();
  };

  const seasons = meta?.number_of_seasons
    ? Array.from({ length: meta.number_of_seasons }, (_, i) => i + 1)
    : [...new Set(episodes.map((e) => e.season_number))].sort((a, b) => a - b);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      <button onClick={toggle} className="flex w-full items-start gap-3 p-3 text-left hover:bg-zinc-800/50 transition-colors">
        <div className="h-24 w-16 shrink-0 rounded-md bg-zinc-800 overflow-hidden flex items-center justify-center">
          {meta?.poster_path
            ? <img src={tmdbImageUrl(meta.poster_path, 'w185')} alt="" className="h-full w-full object-cover" />
            : <Tv className="text-zinc-700" size={22} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {open ? <ChevronDown size={14} className="text-zinc-500 shrink-0" /> : <ChevronRight size={14} className="text-zinc-500 shrink-0" />}
            <span className="truncate font-medium text-zinc-100">{show.series_name}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            {show.is_followed && <Badge color="#ef4444" icon={Check} label="Following" />}
            {show.is_for_later && <Badge color="#f59e0b" icon={Bookmark} label="Watchlist" />}
            {show.is_favorited && <Badge color="#eab308" icon={Star} label="Favorite" />}
          </div>
          <div className="mt-1.5 text-xs text-zinc-500">
            {watchedCount}{totalEpisodes ? ` / ${totalEpisodes}` : ''} episodes
            {show.last_watched_season != null && (
              <span> · last watched S{show.last_watched_season}E{show.last_watched_episode_number}</span>
            )}
          </div>
          {totalEpisodes > 0 && <ProgressBar value={watchedCount} total={totalEpisodes} className="mt-1.5" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-zinc-800 p-3">
          <RatingAndProviders tmdbId={show.tmdb_id} mediaType="tv" meta={meta} />
          <div className="mb-2 mt-2">
            <EditCell
              value={show.notes}
              onSave={(v) => updateShow(show.id, { notes: v }).then(() => onChange?.())}
              placeholder="Add a note…"
              className="text-xs text-zinc-400"
            />
          </div>
          {loadingEpisodes ? (
            <div className="py-4 text-center text-xs text-zinc-600">Loading episodes…</div>
          ) : (
            <div className="space-y-3">
              {seasons.map((season) => (
                <SeasonRow
                  key={season}
                  season={season}
                  episodeCount={meta?.raw_json?.seasons?.find((s) => s.season_number === season)?.episode_count}
                  watchedSet={watchedSet}
                  episodes={episodes.filter((e) => e.season_number === season)}
                  onToggle={markWatched}
                  onRewatch={async (ep) => { await bumpRewatch(ep.id, ep.watch_count + 1); await loadEpisodes(); }}
                />
              ))}
              {seasons.length === 0 && (
                <div className="py-2 text-xs text-zinc-600">No episode data yet for this show.</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Badge({ color, icon: Icon, label }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium"
      style={{ color, backgroundColor: `${color}22` }}
    >
      <Icon size={10} />
      {label}
    </span>
  );
}

function SeasonRow({ season, episodeCount, watchedSet, episodes, onToggle, onRewatch }) {
  const [expanded, setExpanded] = useState(false);
  const count = episodeCount || Math.max(...episodes.map((e) => e.episode_number), 0) || episodes.length;
  const episodeNumbers = count ? Array.from({ length: count }, (_, i) => i + 1) : episodes.map((e) => e.episode_number);
  const watchedInSeason = episodeNumbers.filter((n) => watchedSet.has(`${season}:${n}`)).length;

  return (
    <div>
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between rounded-lg bg-zinc-800/60 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
      >
        <span>Season {season}</span>
        <span className="text-zinc-500">{watchedInSeason}/{episodeNumbers.length}</span>
      </button>
      {expanded && (
        <div className="mt-1.5 grid grid-cols-6 gap-1.5 sm:grid-cols-10">
          {episodeNumbers.map((n) => {
            const watched = watchedSet.has(`${season}:${n}`);
            const epRow = episodes.find((e) => e.episode_number === n);
            return (
              <button
                key={n}
                onClick={() => (watched ? onRewatch(epRow) : onToggle(season, n, true))}
                onContextMenu={(e) => { e.preventDefault(); onToggle(season, n, !watched); }}
                title={watched
                  ? `S${season}E${n} · watched${epRow?.watch_count > 1 ? ` (${epRow.watch_count}x)` : ''} — click to log a rewatch, right-click to unmark`
                  : `S${season}E${n} — click to mark watched`}
                className={`relative flex h-8 items-center justify-center rounded-md text-[11px] font-medium transition-colors ${
                  watched ? 'bg-red-500/20 text-red-300 border border-red-500/40' : 'bg-zinc-800 text-zinc-500 border border-zinc-700 hover:border-zinc-600'
                }`}
              >
                {n}
                {epRow?.watch_count > 1 && (
                  <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-purple-500/80 text-[8px] text-white">
                    <Repeat size={8} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
