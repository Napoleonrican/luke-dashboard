import { useState, useEffect, useCallback } from 'react';
import { Target } from 'lucide-react';
import { supabase } from '../../lib/supabase';

// Read-only view of ac_goal_schedule (AC v2) — the goal-only schedule
// controller.py actually plans against, distinct from the ac_schedule table
// the Schedule tab edits. Deliberately NOT an editor: the whole point of v2
// is less hand-tuning, not a second table to keep in sync by hand. What v2
// changes here should come from the daily agent (shown below) or, rarely, a
// direct edit outside the dashboard — not a live-editable grid that risks
// becoming its own source of drift the way ac_schedule vs ac_goal_schedule
// already did once (see the 2026-07-29 stale-schedule incident).

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EVERY_DAY = 127;
const hasDay = (mask, i) => (mask & (1 << i)) !== 0;

function daysLabel(mask) {
  if (mask === EVERY_DAY) return 'Every day';
  const on = DAY_NAMES.filter((_, i) => hasDay(mask, i));
  return on.length ? on.join(' ') : 'No days';
}

function fmtTime12(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

const PHASE_TONE = {
  sleep:   'text-indigo-400 border-indigo-500/30 bg-indigo-500/5',
  precool: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/5',
  home:    'text-emerald-400 border-emerald-500/30 bg-emerald-500/5',
  away:    'text-zinc-400 border-zinc-600/40 bg-zinc-800/20',
  off:     'text-zinc-600 border-zinc-700/40 bg-zinc-900/40',
};
const ROOM_LABEL = { bedroom: 'Bedroom', living: 'Living Room' };

export default function GoalSchedule() {
  const [rows, setRows] = useState([]);
  const [agentEdits, setAgentEdits] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const [{ data: sched }, { data: edits }] = await Promise.all([
      supabase
        .from('ac_goal_schedule')
        .select('id,position,days,time_local,phase,goal_room,goal_temp_f,deadband_f,quiet,enabled')
        .order('position'),
      supabase
        .from('ac_change_log')
        .select('ts,detail,reason')
        .eq('source', 'agent')
        .order('ts', { ascending: false })
        .limit(10),
    ]);
    setRows(sched ?? []);
    setAgentEdits(edits ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Target size={16} className="text-zinc-400" />
        <span className="text-sm font-semibold text-zinc-100">Goal Schedule (v2)</span>
        <button onClick={load} className="ml-auto text-[11px] text-zinc-500 hover:text-zinc-300">
          Refresh
        </button>
      </div>

      <p className="text-xs text-zinc-500 mb-3 leading-relaxed">
        What <code className="text-zinc-400">controller.py</code> actually plans against — goal room/temp and a
        phase template per block, no baseline temp/mode/fan (the controller derives device state from the goal +
        the learned thermal model). Read-only here on purpose: the daily agent tunes this table automatically
        (see recent edits below), and a second hand-editable copy is exactly the kind of drift that caused the
        controller to run on a stale schedule for several days in July.
      </p>

      {loading ? (
        <div className="text-xs text-zinc-500 py-2">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-zinc-500 py-2">
          ac_goal_schedule is empty — the controller has nothing to plan against.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-500 border-b border-zinc-800">
                <th className="py-1.5 pr-3">Time</th>
                <th className="py-1.5 pr-3">Days</th>
                <th className="py-1.5 pr-3">Phase</th>
                <th className="py-1.5 pr-3">Goal</th>
                <th className="py-1.5 pr-3">Deadband</th>
                <th className="py-1.5 pr-3">Quiet</th>
                <th className="py-1.5 pr-3">Enabled</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-zinc-900 last:border-0">
                  <td className="py-2 pr-3 tabular-nums text-zinc-200">{fmtTime12(r.time_local)}</td>
                  <td className="py-2 pr-3 text-zinc-400">{daysLabel(r.days)}</td>
                  <td className="py-2 pr-3">
                    <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border ${PHASE_TONE[r.phase] || PHASE_TONE.off}`}>
                      {r.phase}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-zinc-200">
                    {r.goal_room
                      ? `${ROOM_LABEL[r.goal_room] || r.goal_room} → ${r.goal_temp_f ?? '—'}°F`
                      : <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-zinc-400">±{r.deadband_f}°F</td>
                  <td className="py-2 pr-3 text-zinc-400">{r.quiet ? 'Yes' : '—'}</td>
                  <td className="py-2 pr-3">
                    {r.enabled
                      ? <span className="text-emerald-400">Yes</span>
                      : <span className="text-zinc-600">No</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-zinc-800">
        <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-2">Recent agent edits to this schedule</p>
        {agentEdits.length === 0 ? (
          <p className="text-xs text-zinc-600">No recent edits logged.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {agentEdits.map((e, i) => (
              <div key={i} className="text-xs">
                <span className="text-zinc-500 tabular-nums">{new Date(e.ts).toLocaleString()}</span>
                {' — '}
                <span className="text-zinc-300">{e.detail}</span>
                {e.reason && <span className="text-zinc-600"> · {e.reason}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
