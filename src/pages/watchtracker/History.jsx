import { useState, useEffect } from 'react';
import { Tv, Clapperboard } from 'lucide-react';
import { fetchShows, fetchMovies } from '../../lib/watchtracker';
import { Th, Td, StateRow } from '../cashflow/tableparts';

// Flat chronological list of the most-recently-watched episode per show, plus
// followed movies — read-only for phase 1 (no per-watch-event history kept).
export default function HistoryPage() {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    Promise.all([fetchShows(), fetchMovies()]).then(([{ data: shows }, { data: movies }]) => {
      const showRows = (shows ?? [])
        .filter((s) => s.last_watched_at)
        .map((s) => ({
          kind: 'episode',
          label: `${s.series_name} — S${s.last_watched_season}E${s.last_watched_episode_number}`,
          at: s.last_watched_at,
        }));
      const movieRows = (movies ?? [])
        .filter((m) => m.is_followed)
        .map((m) => ({ kind: 'movie', label: m.movie_name, at: m.release_date }));
      setRows([...showRows, ...movieRows].sort((a, b) => (b.at || '').localeCompare(a.at || '')));
    });
  }, []);

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900 text-zinc-500">
          <tr>
            <Th>Type</Th>
            <Th>Title</Th>
            <Th>Date</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {rows === null && <StateRow colSpan={3}>Loading history…</StateRow>}
          {rows?.length === 0 && <StateRow colSpan={3}>No watch history yet.</StateRow>}
          {rows?.map((r, i) => (
            <tr key={i} className="hover:bg-zinc-900/60">
              <Td>
                {r.kind === 'episode'
                  ? <Tv size={13} className="text-red-400" />
                  : <Clapperboard size={13} className="text-amber-400" />}
              </Td>
              <Td className="text-zinc-200">{r.label}</Td>
              <Td className="text-zinc-500">{r.at ? String(r.at).slice(0, 10) : '—'}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
