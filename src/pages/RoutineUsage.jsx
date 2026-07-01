import { useState, useEffect, useCallback } from 'react';
import { Gauge, RefreshCw, Bot } from 'lucide-react';
import TopNav from '../components/TopNav';
import { supabase } from '../lib/supabase';

// Routine Usage — real per-run token accounting for the cloud routines.
// Each routine logs a row to ai_routine_logs at the end of its run (summed
// from its own Claude Code transcript). This page rolls those up so Luke can
// see which agents burn the most and plan model/schedule changes accordingly.
//
// Token classes are billed very differently — cache_read is heavily discounted
// — so we NEVER collapse them into one headline number. We show fresh input,
// output, and cache-write together (the "full-price-ish" load) and keep
// cache-read in its own muted column so it doesn't inflate the picture.

const K = (n) => {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
};

// "Billable-ish" load: fresh input + output + cache writes. Excludes the
// discounted cache reads. This is the number that best tracks bucket impact.
const billableLoad = (r) =>
  (r.input_tokens || 0) + (r.output_tokens || 0) + (r.cache_creation_tokens || 0);

function sinceDays(rows, days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return rows.filter((r) => new Date(r.run_at).getTime() >= cutoff);
}

export default function RoutineUsage() {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(!!supabase);
  const [window, setWindow]   = useState(7); // days

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from('ai_routine_logs')
      .select('*')
      .order('run_at', { ascending: false })
      .limit(1000);
    setRows(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const windowed = sinceDays(rows, window);

  // Per-routine rollup over the selected window.
  const byRoutine = Object.values(
    windowed.reduce((acc, r) => {
      const key = r.routine || 'unknown';
      if (!acc[key]) {
        acc[key] = {
          routine: key, model: r.model, repo: r.repo, runs: 0,
          input: 0, output: 0, cacheWrite: 0, cacheRead: 0,
        };
      }
      const a = acc[key];
      a.runs += 1;
      a.input      += r.input_tokens || 0;
      a.output     += r.output_tokens || 0;
      a.cacheWrite += r.cache_creation_tokens || 0;
      a.cacheRead  += r.cache_read_tokens || 0;
      a.model = r.model || a.model; // latest wins
      return acc;
    }, {})
  ).sort((a, b) => (b.input + b.output + b.cacheWrite) - (a.input + a.output + a.cacheWrite));

  const totalBillable = windowed.reduce((s, r) => s + billableLoad(r), 0);
  const totalCacheRead = windowed.reduce((s, r) => s + (r.cache_read_tokens || 0), 0);
  const perDayBillable = window > 0 ? totalBillable / window : 0;

  return (
    <div className="min-h-screen text-white">
      <TopNav />
      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Gauge size={18} className="text-emerald-400" />
              <h1 className="text-lg font-semibold">Routine Usage</h1>
            </div>
            <p className="text-xs text-zinc-500">
              Real token burn per agent, summed from each run's transcript. Plan model &amp; schedule changes from here.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50 mt-0.5 flex-shrink-0"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Window toggle */}
        <div className="flex gap-1.5 mb-5">
          {[1, 7, 30].map((d) => (
            <button
              key={d}
              onClick={() => setWindow(d)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                window === d
                  ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700'
                  : 'bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300'
              }`}
            >
              {d === 1 ? 'Last 24h' : `Last ${d} days`}
            </button>
          ))}
        </div>

        {!supabase && (
          <div className="text-center py-12 text-zinc-600 text-sm">
            Supabase isn't configured, so usage can't load.
          </div>
        )}

        {supabase && !loading && rows.length === 0 && (
          <div className="text-center py-12 text-zinc-600 text-sm">
            No runs logged yet. Once the routines run with the usage-logging step, they'll show up here.
          </div>
        )}

        {supabase && windowed.length > 0 && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                <p className="text-[10px] uppercase tracking-wide text-zinc-600 mb-1">Billable load</p>
                <p className="text-xl font-semibold text-emerald-300">{K(totalBillable)}</p>
                <p className="text-[10px] text-zinc-600 mt-0.5">input + output + cache writes</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                <p className="text-[10px] uppercase tracking-wide text-zinc-600 mb-1">Per day</p>
                <p className="text-xl font-semibold text-zinc-200">{K(Math.round(perDayBillable))}</p>
                <p className="text-[10px] text-zinc-600 mt-0.5">{windowed.length} runs total</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                <p className="text-[10px] uppercase tracking-wide text-zinc-600 mb-1">Cache reads</p>
                <p className="text-xl font-semibold text-zinc-500">{K(totalCacheRead)}</p>
                <p className="text-[10px] text-zinc-600 mt-0.5">heavily discounted</p>
              </div>
            </div>

            {/* Per-routine table */}
            <p className="text-[10px] uppercase tracking-wide text-zinc-600 mb-2">By routine</p>
            <div className="space-y-2 mb-8">
              {byRoutine.map((r) => {
                const load = r.input + r.output + r.cacheWrite;
                const share = totalBillable > 0 ? Math.round((load / totalBillable) * 100) : 0;
                return (
                  <div key={r.routine} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Bot size={13} className="text-emerald-400 flex-shrink-0" />
                      <span className="text-sm font-medium text-zinc-200 flex-1 min-w-0 truncate">{r.routine}</span>
                      {r.model && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 flex-shrink-0">
                          {r.model.replace('claude-', '')}
                        </span>
                      )}
                      <span className="text-[10px] text-zinc-500 flex-shrink-0">{r.runs} run{r.runs !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500/70 rounded-full" style={{ width: `${share}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-emerald-300 flex-shrink-0 w-12 text-right">{K(load)}</span>
                    </div>
                    <div className="flex gap-3 text-[10px] text-zinc-600">
                      <span>in {K(r.input)}</span>
                      <span>out {K(r.output)}</span>
                      <span>cache-w {K(r.cacheWrite)}</span>
                      <span className="text-zinc-700">cache-r {K(r.cacheRead)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Recent runs */}
            <p className="text-[10px] uppercase tracking-wide text-zinc-600 mb-2">Recent runs</p>
            <div className="space-y-1.5">
              {windowed.slice(0, 30).map((r) => (
                <div key={r.id} className="bg-zinc-900/60 border border-zinc-800/60 rounded-lg px-3 py-2 flex items-center gap-2">
                  <span className="text-[11px] text-zinc-400 flex-shrink-0 w-28 truncate">{r.routine}</span>
                  <span className="text-[10px] text-zinc-600 flex-shrink-0 w-24">
                    {new Date(r.run_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                  <span className="text-[11px] text-zinc-500 flex-1 min-w-0 truncate">{r.summary || '—'}</span>
                  <span className="text-[11px] font-medium text-emerald-300/80 flex-shrink-0">{K(billableLoad(r))}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
