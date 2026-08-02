import { useState, useEffect, useCallback } from 'react';
import { Target, Plus, Trash2, Save, Power } from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ac_goal_schedule (AC v2) — as of 2026-08-02 this is the ONLY schedule table the
// AC actually reads (controller.py). The old ac_schedule table (Schedule tab) is
// frozen: it's kept around purely as the v1 rollback path, nothing writes to it
// automatically anymore, and nothing propagates its edits here. Editing it will NOT
// change what the AC does. This page is the real editor now.
//
// Previously this page was deliberately read-only, to avoid a second hand-editable
// copy drifting against ac_schedule (that drift caused a real incident — the
// controller ran on a stale schedule for days). Now that ac_goal_schedule is the
// single source of truth, that risk is gone and editing directly here is correct.

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // bit 0 = Sunday
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EVERY_DAY = 127;
const PHASES = ['sleep', 'precool', 'home', 'away', 'off'];
const GOAL_ROOMS = [['', 'No goal'], ['bedroom', 'Bedroom'], ['living', 'Living Room']];
const ROOM_LABEL = { bedroom: 'Bedroom', living: 'Living Room' };

const hasDay = (mask, i) => (mask & (1 << i)) !== 0;
const toggleDayBit = (mask, i) => mask ^ (1 << i);

function fmtTime12(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

function daysLabel(mask) {
  if (mask === EVERY_DAY) return 'Every day';
  const on = DAY_NAMES.filter((_, i) => hasDay(mask, i));
  return on.length ? on.join(' ') : 'No days';
}

const PHASE_TONE = {
  sleep:   'text-indigo-400 border-indigo-500/30 bg-indigo-500/5',
  precool: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/5',
  home:    'text-emerald-400 border-emerald-500/30 bg-emerald-500/5',
  away:    'text-zinc-400 border-zinc-600/40 bg-zinc-800/20',
  off:     'text-zinc-600 border-zinc-700/40 bg-zinc-900/40',
};

export default function GoalSchedule() {
  const [rows, setRows] = useState([]);
  const [agentEdits, setAgentEdits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [dirty, setDirty] = useState(() => new Set());

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const [{ data: sched }, { data: edits }] = await Promise.all([
      supabase
        .from('ac_goal_schedule')
        .select('id,position,days,time_local,phase,goal_room,goal_temp_f,deadband_f,quiet,enabled')
        .order('position', { ascending: true })
        .order('time_local', { ascending: true }),
      supabase
        .from('ac_change_log')
        .select('ts,detail,reason')
        .eq('source', 'agent')
        .order('ts', { ascending: false })
        .limit(10),
    ]);
    setRows(sched ?? []);
    setAgentEdits(edits ?? []);
    setDirty(new Set());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addRow() {
    const position = rows.length ? Math.max(...rows.map((r) => r.position)) + 1 : 1;
    const { data } = await supabase
      .from('ac_goal_schedule')
      .insert({ position, days: EVERY_DAY, time_local: '00:00', phase: 'home',
                goal_room: null, goal_temp_f: null, deadband_f: 2.0, quiet: false, enabled: true })
      .select()
      .single();
    if (data) setRows((p) => [...p, data]);
  }

  async function saveRow(row) {
    setSavingId(row.id);
    const { id, ...fields } = row;
    await supabase.from('ac_goal_schedule').update(fields).eq('id', id);
    setSavingId(null);
    setDirty((p) => { const n = new Set(p); n.delete(id); return n; });
  }

  async function deleteRow(id) {
    await supabase.from('ac_goal_schedule').delete().eq('id', id);
    setRows((p) => p.filter((r) => r.id !== id));
    setDirty((p) => { const n = new Set(p); n.delete(id); return n; });
  }

  function patch(id, field, value) {
    setRows((p) => p.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    setDirty((p) => new Set(p).add(id));
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-zinc-400" />
          <span className="text-sm font-semibold text-zinc-100">Goal Schedule (v2)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={addRow}
            className="text-xs px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700 transition-colors min-h-[36px] flex items-center gap-1.5"
          >
            <Plus size={13} /> Add block
          </button>
          <button onClick={load} className="text-[11px] text-zinc-500 hover:text-zinc-300">
            Refresh
          </button>
        </div>
      </div>

      <p className="text-xs text-zinc-500 mb-4 leading-relaxed">
        What <code className="text-zinc-400">controller.py</code> actually plans against, and the only schedule
        table that affects the AC. Each block is a goal (room/temp) plus a phase template — the controller derives
        device state from that + the learned thermal model, not from a stored setpoint/mode/fan. The old{' '}
        <strong className="text-zinc-400">Schedule</strong> tab is frozen (v1 rollback path only) — edits there no
        longer reach the AC.
      </p>

      {loading ? (
        <div className="text-sm text-zinc-500 py-6 text-center">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-zinc-500 py-4">
          ac_goal_schedule is empty — the controller has nothing to plan against. Click &ldquo;Add block&rdquo; or
          run <code className="text-zinc-400">sync_goal_schedule.py</code> on the Pi.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <div key={r.id} className={`rounded-lg border p-3 ${PHASE_TONE[r.phase] || PHASE_TONE.off}`}>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Day chips */}
                <div className="flex gap-1">
                  {DAYS.map((d, i) => (
                    <button
                      key={i}
                      onClick={() => patch(r.id, 'days', toggleDayBit(r.days, i))}
                      className={`h-7 w-7 rounded-md text-[11px] font-semibold transition-colors ${
                        hasDay(r.days, i) ? 'bg-amber-500/80 text-zinc-950' : 'bg-zinc-800 text-zinc-500'
                      }`}
                      title={DAY_NAMES[i]}
                    >
                      {d}
                    </button>
                  ))}
                </div>

                {/* Time */}
                <input
                  type="time"
                  value={String(r.time_local ?? '00:00').slice(0, 5)}
                  onChange={(e) => patch(r.id, 'time_local', e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-2 py-1.5 text-xs min-h-[34px]"
                />

                {/* Phase */}
                <select
                  value={r.phase}
                  onChange={(e) => patch(r.id, 'phase', e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-2 py-1.5 text-xs min-h-[34px] capitalize"
                >
                  {PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>

                {r.phase !== 'off' && (
                  <>
                    {/* Goal room + temp */}
                    <select
                      value={r.goal_room ?? ''}
                      onChange={(e) => {
                        const v = e.target.value || null;
                        patch(r.id, 'goal_room', v);
                        if (!v) patch(r.id, 'goal_temp_f', null);
                      }}
                      title="Goal room"
                      className="bg-zinc-950 border border-zinc-800 text-violet-300 rounded-lg px-2 py-1.5 text-xs min-h-[34px]"
                    >
                      {GOAL_ROOMS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                    </select>
                    {r.goal_room && (
                      <>
                        <input
                          type="number"
                          min={60}
                          max={86}
                          value={r.goal_temp_f ?? ''}
                          onChange={(e) => patch(r.id, 'goal_temp_f', e.target.value === '' ? null : Number(e.target.value))}
                          title="Goal temperature"
                          className="w-16 bg-zinc-950 border border-zinc-800 text-violet-300 rounded-lg px-2 py-1.5 text-xs min-h-[34px]"
                        />
                        <span className="text-xs text-zinc-500">°F</span>
                      </>
                    )}

                    {/* Deadband */}
                    <span className="text-xs text-zinc-600">±</span>
                    <input
                      type="number"
                      min={0.5}
                      max={5}
                      step={0.5}
                      value={r.deadband_f ?? ''}
                      onChange={(e) => patch(r.id, 'deadband_f', e.target.value === '' ? null : Number(e.target.value))}
                      title="Deadband (half-width, °F)"
                      className="w-14 bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg px-2 py-1.5 text-xs min-h-[34px]"
                    />
                    <span className="text-xs text-zinc-500">°F</span>

                    {/* Quiet */}
                    <button
                      onClick={() => patch(r.id, 'quiet', !r.quiet)}
                      title={r.quiet ? 'Quiet — no fan bumps, no Turbo' : 'Not quiet'}
                      className={`text-[11px] px-2 py-1.5 rounded-lg border transition-colors min-h-[34px] ${
                        r.quiet ? 'border-indigo-500/40 text-indigo-300 bg-indigo-500/10' : 'border-zinc-800 text-zinc-500'
                      }`}
                    >
                      Quiet
                    </button>
                  </>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1 ml-auto">
                  <button
                    onClick={() => patch(r.id, 'enabled', !r.enabled)}
                    title={r.enabled ? 'Enabled' : 'Disabled'}
                    className={`p-1.5 rounded-md transition-colors ${r.enabled ? 'text-emerald-400' : 'text-zinc-600'}`}
                  >
                    <Power size={15} />
                  </button>
                  <button
                    onClick={() => saveRow(r)}
                    disabled={savingId === r.id}
                    className={`p-1.5 rounded-md transition-colors ${
                      dirty.has(r.id) ? 'text-cyan-400 hover:text-cyan-300' : 'text-zinc-500 hover:text-cyan-400'
                    }`}
                    title={dirty.has(r.id) ? 'Unsaved changes — click to save' : 'Save'}
                  >
                    <Save size={15} />
                  </button>
                  <button
                    onClick={() => deleteRow(r.id)}
                    className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className="text-[11px] text-zinc-600 mt-2">
                {daysLabel(r.days)}
                {' · '}{fmtTime12(r.time_local)}
                {' · '}<span className="capitalize">{r.phase}</span>
                {r.goal_room && r.goal_temp_f != null && (
                  <span className="text-violet-400">{` · ${ROOM_LABEL[r.goal_room]} → ${r.goal_temp_f}°F`}</span>
                )}
                {r.deadband_f != null && ` · ±${r.deadband_f}°F`}
                {r.quiet && ' · quiet'}
                {!r.enabled && ' · (disabled)'}
                {dirty.has(r.id) && <span className="text-cyan-500"> · unsaved</span>}
              </div>
            </div>
          ))}
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
