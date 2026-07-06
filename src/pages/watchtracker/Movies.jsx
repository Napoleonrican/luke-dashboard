import { useState, useEffect } from 'react';
import { Check, Bookmark, Repeat } from 'lucide-react';
import { fetchMovies, updateMovie } from '../../lib/watchtracker';
import { Th, Td, StateRow, LoadErrorRow } from '../cashflow/tableparts';
import { fmtDate } from '../cashflow/format';
import EditCell from '../cashflow/EditCell';

export default function Movies() {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let active = true;
    fetchMovies().then(({ data, error: err }) => {
      if (!active) return;
      setMovies(data ?? []);
      setError(err);
      setLoading(false);
    });
    return () => { active = false; };
  }, [reloadKey]);

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900 text-zinc-500">
          <tr>
            <Th>Movie</Th>
            <Th>Status</Th>
            <Th>Release</Th>
            <Th>Rewatches</Th>
            <Th>Notes</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {loading && <StateRow colSpan={5}>Loading movies…</StateRow>}
          {!loading && error && <LoadErrorRow colSpan={5} onRetry={reload} />}
          {!loading && !error && movies.length === 0 && <StateRow colSpan={5}>No movies yet.</StateRow>}
          {!loading && !error && movies.map((m) => (
            <tr key={m.id} className="hover:bg-zinc-900/60">
              <Td className="font-medium text-zinc-200">{m.movie_name}</Td>
              <Td>
                <div className="flex gap-1.5">
                  {m.is_followed && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[11px] font-medium text-red-300">
                      <Check size={10} /> Watched
                    </span>
                  )}
                  {m.is_for_later && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                      <Bookmark size={10} /> Watchlist
                    </span>
                  )}
                </div>
              </Td>
              <Td>{fmtDate(m.release_date)}</Td>
              <Td>{m.rewatch_count > 0 ? (
                <span className="inline-flex items-center gap-1 text-purple-300"><Repeat size={11} /> {m.rewatch_count}</span>
              ) : '—'}</Td>
              <Td>
                <EditCell
                  value={m.notes}
                  onSave={(v) => updateMovie(m.id, { notes: v }).then(reload)}
                  placeholder="Add a note…"
                  className="text-zinc-400"
                />
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
