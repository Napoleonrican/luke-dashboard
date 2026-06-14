import { useState, useEffect, useCallback } from 'react';
import { History } from 'lucide-react';
import { supabase } from '../../lib/supabase';

// Audit trail of every change pushed to the AC / schedule, from any source
// (the agent, the executor, or a manual edit). Read-only view of ac_change_log.
export default function AgentLog() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const { data } = await supabase
      .from('ac_change_log')
      .select('ts,source,action,detail,reason')
      .order('ts', { ascending: false })
      .limit(50);
    setRows(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const tone = {
    executor: 'text-cyan-400 border-cyan-500/30',
    agent: 'text-violet-400 border-violet-500/30',
    manual: 'text-zinc-400 border-zinc-600/40',
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center gap-2 mb-3">
        <History size={16} className="text-zinc-400" />
        <span className="text-sm font-semibold text-zinc-100">Agent Log</span>
        <button onClick={load} className="ml-auto text-[11px] text-zinc-500 hover:text-zinc-300">
          Refresh
        </button>
      </div>

      <p className="text-xs text-zinc-500 mb-3 leading-relaxed">
        Every schedule change and the reasoning behind it — the agent&apos;s daily decisions, the
        executor&apos;s pushes to the AC, and any manual edits.
      </p>

      {loading ? (
        <div className="text-xs text-zinc-500 py-2">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-zinc-500 py-2">
          No changes logged yet. Pushes from the executor or the agent will show up here.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-2.5">
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border ${tone[r.source] || tone.manual}`}>
                  {r.source}
                </span>
                <span className="text-zinc-100">{r.detail || r.action}</span>
                <span className="text-[11px] text-zinc-600 ml-auto">
                  {new Date(r.ts).toLocaleString()}
                </span>
              </div>
              {r.reason && <div className="text-xs text-zinc-500 mt-1 leading-relaxed">{r.reason}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
