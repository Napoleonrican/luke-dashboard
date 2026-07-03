import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Radar, Lock, ArrowRight, CircleDot } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/useAuth';
import AuthModal from './AuthModal';

// Mirrors the Projects tab (mc_projects, migration 033): status → dot color.
const STATUS = {
  active: 'bg-emerald-500',
  paused: 'bg-amber-500',
  shipped: 'bg-sky-500',
  idea: 'bg-zinc-500',
};
const STALLED_DAYS = 14;

const daysSince = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
function ago(iso) {
  const d = daysSince(iso);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function Shell({ children }) {
  return (
    <section className="animate-enter min-h-[300px] rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
      <div className="mb-4 flex items-center gap-2">
        <Radar size={18} className="text-cyan-400" />
        <h2 className="text-sm font-semibold text-zinc-100">Mission Control</h2>
        <Link to="/mission-control" className="group ml-auto flex items-center gap-1 text-xs text-zinc-500 hover:text-cyan-400">
          Open <ArrowRight size={13} />
        </Link>
      </div>
      {children}
    </section>
  );
}

// Locked placeholder shown in the center slot when not signed in — the rest of
// the dashboard renders normally around it; the sign-in happens in a modal.
function LockedCard({ onUnlock }) {
  return (
    <Shell>
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <div className="rounded-xl bg-zinc-800 p-3 text-zinc-400"><Lock size={22} strokeWidth={1.75} /></div>
        <p className="max-w-xs text-sm text-zinc-400">
          Mission Control is private. Sign in to see what changed and what needs you — the rest of your dashboard stays available.
        </p>
        <button
          type="button"
          onClick={onUnlock}
          className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-600"
        >
          Unlock
        </button>
      </div>
    </Shell>
  );
}

function LiveContent() {
  const [threads, setThreads] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(!!supabase);

  const load = useCallback(async () => {
    if (!supabase) return; // loading already starts false when Supabase is absent
    const [{ data: t }, { data: p }] = await Promise.all([
      supabase.from('mc_threads').select('*').order('updated_at', { ascending: false }),
      // Projects now live in mc_projects (033), sorted oldest-activity-first so
      // stalled initiatives surface — same ordering as the Projects tab.
      supabase.from('mc_projects').select('*').order('last_activity_at', { ascending: true }),
    ]);
    setThreads(t || []);
    setProjects(p || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Shell><p className="py-12 text-center text-sm text-zinc-600">Loading…</p></Shell>;

  const needsYou = threads.filter((t) => t.status === 'needs_you');
  // Surface what's live (not shipped) — the initiatives actually in flight.
  const live = projects.filter((p) => p.status !== 'shipped');

  return (
    <Shell>
      {/* What needs you */}
      <div className="mb-2 flex items-center gap-2">
        <CircleDot size={13} className="text-amber-400" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Needs you</h3>
        {needsYou.length > 0 && <span className="rounded-full bg-amber-900/40 px-1.5 text-[10px] text-amber-300">{needsYou.length}</span>}
      </div>
      {needsYou.length === 0 ? (
        <p className="mb-4 text-xs text-zinc-600">Nothing waiting on you right now.</p>
      ) : (
        <div className="mb-4 space-y-2">
          {needsYou.slice(0, 4).map((t) => (
            <Link key={t.id} to="/mission-control" className="block rounded-lg border border-zinc-800 bg-zinc-950/40 p-2.5 transition-colors hover:border-zinc-700">
              <div className="mb-0.5 flex items-center gap-1.5 text-[10px] text-zinc-600">
                <span>{t.repo}</span>{t.github_issue && <span>#{t.github_issue}</span>}
              </div>
              <p className="text-sm leading-snug text-zinc-100">{t.title}</p>
            </Link>
          ))}
        </div>
      )}

      {/* Projects in flight — the major initiatives (mc_projects) */}
      <div className="mb-2 flex items-center gap-2 border-t border-zinc-800 pt-3">
        <Radar size={13} className="text-cyan-400" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Projects in flight</h3>
      </div>
      {live.length === 0 ? (
        <p className="text-xs text-zinc-600">No active projects — your Sidekick fills these in on its next run.</p>
      ) : (
        <div className="space-y-2">
          {live.slice(0, 4).map((p) => {
            const stalled = p.status !== 'shipped' && daysSince(p.last_activity_at) >= STALLED_DAYS;
            return (
              <div key={p.id} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-2.5">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS[p.status] || STATUS.active}`} />
                  <span className="flex-1 truncate text-sm font-medium text-zinc-200">{p.title}</span>
                  {stalled && <span className="rounded-full bg-amber-900/40 px-1.5 text-[9px] font-semibold text-amber-300">stalled</span>}
                  <span className="shrink-0 text-[10px] text-zinc-600">{ago(p.last_activity_at)}</span>
                </div>
                {(p.current || p.blurb) && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-400">{p.current || p.blurb}</p>}
              </div>
            );
          })}
        </div>
      )}
    </Shell>
  );
}

export default function MissionControlCenter() {
  const { session, loading } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);

  if (loading) return <Shell><p className="py-12 text-center text-sm text-zinc-600">Checking session…</p></Shell>;

  return (
    <>
      {session ? <LiveContent /> : <LockedCard onUnlock={() => setModalOpen(true)} />}
      {modalOpen && <AuthModal onClose={() => setModalOpen(false)} />}
    </>
  );
}
