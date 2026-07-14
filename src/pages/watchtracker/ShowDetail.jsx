import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronRight, Tv, Link2, Check, MoreVertical, Clock, Trash2 } from 'lucide-react';
import {
  getShow, getShowMetadata, fetchEpisodes, setEpisodeWatched, markEpisodesWatched,
  updateShow, getEpisodeMetadata,
} from '../../lib/watchtracker';
import { tmdbImageUrl, tmdbConfigured, tmdbStatus } from '../../lib/tmdb';
import EditCell from '../cashflow/EditCell';
import ConfirmDialog from '../cashflow/ConfirmDialog';
import ProgressBar from './ProgressBar';
import RatingAndProviders from './RatingAndProviders';
import CastList from './CastList';
import AddTitleModal from './AddTitleModal';

// Human summary for the catch-up prompt — lists episodes when they're all in
// one season, otherwise just a count spanning the seasons involved.
function gapMessage(missing) {
  const seasons = [...new Set(missing.map((m) => m.season_number))];
  if (seasons.length === 1) {
    const eps = missing.map((m) => m.episode_number).join(', ');
    return `Season ${seasons[0]}, episode${missing.length > 1 ? 's' : ''} ${eps} ${missing.length > 1 ? "aren't" : "isn't"} marked watched yet.`;
  }
  return `${missing.length} earlier episodes across seasons ${Math.min(...seasons)}–${Math.max(...seasons)} aren't marked watched yet.`;
}

export default function ShowDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [show, setShow] = useState(null);
  const [meta, setMeta] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showMatch, setShowMatch] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  // { season, episode, missing: [episode_number, ...] } — offered after
  // marking an episode watched when earlier ones in the same season aren't.
  const [gapPrompt, setGapPrompt] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: showData } = await getShow(id);
      if (!active) return;
      setShow(showData);
      if (showData?.tmdb_id && tmdbConfigured) {
        getShowMetadata(showData.tmdb_id).then(({ data }) => { if (active) setMeta(data); });
      }
      const { data: epData } = await fetchEpisodes(id);
      if (!active) return;
      setEpisodes(epData ?? []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [id]);

  const reloadShow = async () => {
    const { data } = await getShow(id);
    setShow(data);
  };

  const onMatched = async () => {
    setShowMatch(false);
    const { data: showData } = await getShow(id);
    setShow(showData);
    setMeta(null);
    if (showData?.tmdb_id && tmdbConfigured) {
      getShowMetadata(showData.tmdb_id).then(({ data }) => setMeta(data));
    }
  };

  const markWatched = async (season, episode, watched) => {
    await setEpisodeWatched({ show_id: id, season_number: season, episode_number: episode }, watched);
    const { data: freshEpisodes } = await fetchEpisodes(id);
    setEpisodes(freshEpisodes ?? []);
    reloadShow();
    if (watched) {
      const watchedKey = new Set((freshEpisodes ?? []).map((e) => `${e.season_number}:${e.episode_number}`));
      // Every episode that airs before (season, episode) and isn't watched —
      // all of every earlier season, plus this season up to the one before
      // the one just marked. Uses TMDB's per-season episode_count; falls back
      // to just this season if there's no metadata to enumerate earlier ones.
      const seasonsMeta = (meta?.raw_json?.seasons ?? []).filter((sm) => sm.season_number >= 1);
      const missing = [];
      if (seasonsMeta.length) {
        for (const sm of seasonsMeta) {
          if (sm.season_number > season) continue;
          const upto = sm.season_number === season ? episode - 1 : (sm.episode_count || 0);
          for (let n = 1; n <= upto; n++) {
            if (!watchedKey.has(`${sm.season_number}:${n}`)) missing.push({ season_number: sm.season_number, episode_number: n });
          }
        }
      } else {
        for (let n = 1; n < episode; n++) {
          if (!watchedKey.has(`${season}:${n}`)) missing.push({ season_number: season, episode_number: n });
        }
      }
      if (missing.length > 0) setGapPrompt({ missing });
    }
  };

  const confirmMarkGap = async () => {
    await markEpisodesWatched(id, gapPrompt.missing);
    const { data } = await fetchEpisodes(id);
    setEpisodes(data ?? []);
    reloadShow();
    setGapPrompt(null);
  };

  const toggleWatchLater = async () => {
    setShowMenu(false);
    await updateShow(id, { is_for_later: !show.is_for_later });
    reloadShow();
  };

  const removeShow = async () => {
    await updateShow(id, { is_followed: false, is_for_later: false });
    navigate('/watch-tracker/shows');
  };

  if (loading) return <div className="py-12 text-center text-zinc-600">Loading…</div>;
  if (!show) return <div className="py-12 text-center text-zinc-600">Show not found.</div>;

  const watchedSet = new Set(episodes.map((e) => `${e.season_number}:${e.episode_number}`));
  const totalEpisodes = meta?.number_of_episodes ?? null;
  const watchedCount = show.ep_watch_count ?? episodes.length;
  const status = tmdbStatus(meta);
  const seasons = meta?.number_of_seasons
    ? Array.from({ length: meta.number_of_seasons }, (_, i) => i + 1)
    : [...new Set(episodes.map((e) => e.season_number))].sort((a, b) => a - b);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Link to="/watch-tracker/shows" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300">
          <ArrowLeft size={14} /> Back to Shows
        </Link>
        <ShowMenu
          open={showMenu}
          onOpen={() => setShowMenu((o) => !o)}
          onClose={() => setShowMenu(false)}
          isWatchLater={show.is_for_later}
          onToggleWatchLater={toggleWatchLater}
          onRemove={() => { setShowMenu(false); setShowRemoveConfirm(true); }}
        />
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="h-56 w-40 shrink-0 rounded-lg bg-zinc-800 overflow-hidden flex items-center justify-center self-start">
          {meta?.poster_path
            ? <img src={tmdbImageUrl(meta.poster_path, 'w342')} alt="" className="h-full w-full object-cover" />
            : <Tv className="text-zinc-700" size={32} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-zinc-100">{show.series_name}</h1>
            {status && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                status === 'Ended' || status === 'Canceled'
                  ? 'bg-zinc-700 text-zinc-300'
                  : 'bg-emerald-500/20 text-emerald-300'
              }`}>
                {status}
              </span>
            )}
            {show.is_for_later && (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                <Clock size={10} /> Watch Later
              </span>
            )}
            <button
              onClick={() => setShowMatch(true)}
              className="flex items-center gap-1 rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] font-medium text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
              title="Re-point this show at a different TMDB match — keeps your notes and watch history"
            >
              <Link2 size={10} /> {show.tmdb_id ? 'Re-match' : 'Match to TMDB'}
            </button>
          </div>
          {meta?.network && <div className="mt-0.5 text-xs text-zinc-500">{meta.network}</div>}
          {meta?.overview && <p className="mt-2 text-sm text-zinc-400">{meta.overview}</p>}

          <div className="mt-3 text-xs text-zinc-500">
            {watchedCount}{totalEpisodes ? ` / ${totalEpisodes}` : ''} episodes
          </div>
          {totalEpisodes > 0 && <ProgressBar value={watchedCount} total={totalEpisodes} className="mt-1.5 max-w-xs" />}

          <div className="mt-3">
            <RatingAndProviders tmdbId={show.tmdb_id} mediaType="tv" meta={meta} />
          </div>

          <div className="mt-3 max-w-md">
            <EditCell
              value={show.notes}
              onSave={(v) => updateShow(show.id, { notes: v }).then(reloadShow)}
              placeholder="Add a note…"
              className="text-xs text-zinc-400"
            />
          </div>
        </div>
      </div>

      <CastList meta={meta} />

      <div className="mt-6 space-y-3">
        {seasons.map((season) => (
          <SeasonBlock
            key={season}
            tmdbId={show.tmdb_id}
            season={season}
            episodeCount={meta?.raw_json?.seasons?.find((s) => s.season_number === season)?.episode_count}
            watchedSet={watchedSet}
            onToggle={markWatched}
          />
        ))}
        {seasons.length === 0 && (
          <div className="py-4 text-sm text-zinc-600">No episode data yet for this show.</div>
        )}
      </div>

      {showMatch && (
        <AddTitleModal mediaType="tv" mode="match" existingId={show.id} onClose={() => setShowMatch(false)} onAdded={onMatched} />
      )}

      <ConfirmDialog
        open={!!gapPrompt}
        title="Mark earlier episodes watched too?"
        message={gapPrompt && gapMessage(gapPrompt.missing)}
        confirmLabel="Mark all watched"
        onConfirm={confirmMarkGap}
        onCancel={() => setGapPrompt(null)}
      />

      <ConfirmDialog
        open={showRemoveConfirm}
        title="Remove this show?"
        message="Unfollows the show and takes it off your Watch List. Your notes and watched-episode history are kept — re-adding it later won't require re-marking anything."
        confirmLabel="Remove"
        onConfirm={() => { setShowRemoveConfirm(false); removeShow(); }}
        onCancel={() => setShowRemoveConfirm(false)}
      />
    </div>
  );
}

function ShowMenu({ open, onOpen, onClose, isWatchLater, onToggleWatchLater, onRemove }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open, onClose]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={onOpen}
        className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
        title="More actions"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-48 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl">
          <button
            onClick={onToggleWatchLater}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700"
          >
            <Clock size={14} /> {isWatchLater ? 'Remove from Watch Later' : 'Watch Later'}
          </button>
          <button
            onClick={onRemove}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-300 hover:bg-zinc-700"
          >
            <Trash2 size={14} /> Remove show
          </button>
        </div>
      )}
    </div>
  );
}

function SeasonBlock({ tmdbId, season, episodeCount, watchedSet, onToggle }) {
  const [expanded, setExpanded] = useState(false);
  const [descriptions, setDescriptions] = useState({}); // episode_number -> { name, overview, still_path }
  const [loadingDesc, setLoadingDesc] = useState(false);

  const episodeNumbers = episodeCount
    ? Array.from({ length: episodeCount }, (_, i) => i + 1)
    : [...watchedSet].filter((k) => k.startsWith(`${season}:`)).map((k) => Number(k.split(':')[1]));
  const watchedInSeason = episodeNumbers.filter((n) => watchedSet.has(`${season}:${n}`)).length;

  const toggleExpand = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && tmdbId && Object.keys(descriptions).length === 0) {
      setLoadingDesc(true);
      const results = await Promise.all(
        episodeNumbers.map((n) => getEpisodeMetadata(tmdbId, season, n).then(({ data }) => [n, data])),
      );
      setDescriptions(Object.fromEntries(results.filter(([, d]) => d)));
      setLoadingDesc(false);
    }
  };

  return (
    <div>
      <button
        onClick={toggleExpand}
        className="flex w-full items-center justify-between rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
      >
        <span className="flex items-center gap-1.5">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          Season {season}
        </span>
        <span className="text-zinc-500 text-xs">{watchedInSeason}/{episodeNumbers.length}</span>
      </button>
      {expanded && (
        <div className="mt-1.5 space-y-1.5">
          {loadingDesc && <div className="py-2 text-center text-xs text-zinc-600">Loading episode details…</div>}
          {episodeNumbers.map((n) => {
            const watched = watchedSet.has(`${season}:${n}`);
            const desc = descriptions[n];
            return (
              <div key={n} className="flex gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-2.5">
                <div className="h-14 w-24 shrink-0 rounded bg-zinc-800 overflow-hidden flex items-center justify-center">
                  {desc?.still_path
                    ? <img src={tmdbImageUrl(desc.still_path, 'w300')} alt="" className="h-full w-full object-cover" />
                    : <span className="text-xs text-zinc-700">{n}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm text-zinc-200">
                    <span className="text-zinc-500">E{n}</span>
                    <span className="truncate">{desc?.name || `Episode ${n}`}</span>
                  </div>
                  {desc?.overview && <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{desc.overview}</p>}
                </div>
                <button
                  onClick={() => onToggle(season, n, !watched)}
                  title={watched ? 'Click to unmark' : 'Mark watched'}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    watched ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-zinc-700 text-transparent hover:border-zinc-500'
                  }`}
                >
                  <Check size={16} strokeWidth={3} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
