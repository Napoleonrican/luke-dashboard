import { useState, useEffect, useCallback } from 'react';
import { GitCompare } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SOURCE_LABELS } from './sourceLabels';

// AC v2 Phase 2 QA view (V2-REDESIGN.md §7, Phase 2 acceptance criteria):
// "Build the dashboard diff view: shadow decision vs. what Layers 1/2 actually
// did, side by side." Pairs each controller_shadow row with the live row
// (executor / goal_follower / comfort_mode) closest to it in time, so Luke can
// see agreement/disagreement at a glance instead of reading two logs by hand.
// Read-only — never writes anything, never touches the AC.

const LIVE_SOURCES = ['executor', 'goal_follower', 'comfort_mode'];
const PAIR_WINDOW_MIN = 10; // a live row within this many minutes counts as "the same moment"

function minutesBetween(a, b) {
  return Math.abs(new Date(a) - new Date(b)) / 60000;
}

// Very rough agree/disagree signal from free-text `detail` — both sides log
// human-readable strings, not structured fields, so this is pattern matching,
// not a real diff. Good enough to flag things worth a closer look.
function classify(shadowDetail, liveDetail) {
  if (!liveDetail) return 'no-live';
  const s = (shadowDetail || '').toLowerCase();
  const l = (liveDetail || '').toLowerCase();
  const numsFrom = (str) => (str.match(/\d+(\.\d+)?/g) || []).map(Number);
  const sNums = numsFrom(s);
  const lNums = numsFrom(l);
  const sameSetpoint = sNums.length && lNums.length && sNums[0] === lNums[0];
  const sameMode = ['cool', 'eco', 'dry', 'off', 'turbo'].find((m) => s.includes(m) && l.includes(m));
  if (sameSetpoint && sameMode) return 'agree';
  if (sameMode && !sNums.length && !lNums.length) return 'agree';
  return 'differ';
}

const TONE = {
  agree: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5',
  differ: 'text-amber-400 border-amber-500/30 bg-amber-500/5',
  'no-live': 'text-zinc-500 border-zinc-700/60 bg-zinc-900/40',
};
const TONE_LABEL = { agree: 'agrees', differ: 'differs', 'no-live': 'no live match nearby' };

export default function Shadow() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(24);

  const load = useCallback(async (h) => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const since = new Date(Date.now() - h * 3600_000).toISOString();

    const [{ data: shadow }, { data: live }] = await Promise.all([
      supabase
        .from('ac_change_log')
        .select('ts,source,action,detail,reason')
        .eq('source', 'controller_shadow')
        .gte('ts', since)
        .order('ts', { ascending: false })
        .limit(300),
      supabase
        .from('ac_change_log')
        .select('ts,source,action,detail,reason')
        .in('source', LIVE_SOURCES)
        .gte('ts', since)
        .order('ts', { ascending: false })
        .limit(500),
    ]);

    const paired = (shadow ?? []).map((sh) => {
      let nearest = null;
      let nearestMin = Infinity;
      for (const lv of live ?? []) {
        const m = minutesBetween(sh.ts, lv.ts);
        if (m < nearestMin) { nearestMin = m; nearest = lv; }
      }
      const matched = nearest && nearestMin <= PAIR_WINDOW_MIN ? nearest : null;
      return { shadow: sh, live: matched, liveGapMin: matched ? nearestMin : null,
        verdict: classify(sh.detail, matched?.detail) };
    });

    setRows(paired);
    setLoading(false);
  }, []);

  useEffect(() => { load(hours); }, [load, hours]);

  const agreeCount = rows.filter((r) => r.verdict === 'agree').length;
  const differCount = rows.filter((r) => r.verdict === 'differ').length;
  const noLiveCount = rows.filter((r) => r.verdict === 'no-live').length;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <GitCompare size={16} className="text-zinc-400" />
        <span className="text-sm font-semibold text-zinc-100">Shadow vs. Live (v2 QA)</span>
        <select
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className="ml-auto text-xs bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-300"
        >
          <option value={24}>Last 24h</option>
          <option value={72}>Last 3 days</option>
          <option value={168}>Last 7 days</option>
        </select>
        <button onClick={() => load(hours)} className="text-[11px] text-zinc-500 hover:text-zinc-300">
          Refresh
        </button>
      </div>

      <p className="text-xs text-zinc-500 mb-3 leading-relaxed">
        Phase 2 QA view (V2-REDESIGN.md §7): every <code className="text-zinc-400">controller_shadow</code>{' '}
        decision, paired with whatever the live layers ({LIVE_SOURCES.map((s) => SOURCE_LABELS[s] || s).join(', ')})
        actually did within {PAIR_WINDOW_MIN} minutes of it. This never writes anything — it only reads{' '}
        <code className="text-zinc-400">ac_change_log</code>. The setpoint/mode match is pattern-matched from the
        free-text log lines, so treat &quot;differs&quot; as &quot;worth a look,&quot; not a verified bug.
      </p>

      {!loading && rows.length > 0 && (
        <div className="flex items-center gap-3 mb-3 text-xs">
          <span className="text-emerald-400">{agreeCount} agree</span>
          <span className="text-amber-400">{differCount} differ</span>
          <span className="text-zinc-500">{noLiveCount} no live match</span>
          <span className="text-zinc-600 ml-auto">{rows.length} shadow decisions</span>
        </div>
      )}

      {loading ? (
        <div className="text-xs text-zinc-500 py-2">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-zinc-500 py-2">
          No shadow decisions logged in this window yet. The controller only writes a
          <code className="text-zinc-400"> controller_shadow</code> row when it decides + records a plan — during
          Schedule Override it defers silently and logs nothing here.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <div key={i} className={`rounded-lg border p-2.5 ${TONE[r.verdict]}`}>
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border border-current">
                  {TONE_LABEL[r.verdict]}
                </span>
                <span className="text-[11px] text-zinc-600 ml-auto">
                  {new Date(r.shadow.ts).toLocaleString()}
                </span>
              </div>

              <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                    Shadow ({SOURCE_LABELS.controller_shadow})
                  </div>
                  <div className="text-xs text-zinc-200 mt-0.5">{r.shadow.detail || r.shadow.action}</div>
                  {r.shadow.reason && <div className="text-[11px] text-zinc-500 mt-0.5 leading-snug">{r.shadow.reason}</div>}
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                    Live {r.live ? `(${SOURCE_LABELS[r.live.source] || r.live.source}, ${r.liveGapMin.toFixed(0)}m away)` : ''}
                  </div>
                  {r.live ? (
                    <>
                      <div className="text-xs text-zinc-200 mt-0.5">{r.live.detail || r.live.action}</div>
                      {r.live.reason && <div className="text-[11px] text-zinc-500 mt-0.5 leading-snug">{r.live.reason}</div>}
                    </>
                  ) : (
                    <div className="text-xs text-zinc-600 mt-0.5 italic">nothing within {PAIR_WINDOW_MIN}m</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
