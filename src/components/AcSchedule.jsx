import { useState, useEffect, useCallback } from 'react';
import { CalendarClock, Plus, Trash2, Save, Power } from 'lucide-react';
import { supabase } from '../lib/supabase';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // bit 0 = Sunday
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Confirmed working on the AWFS12WW (2026-06-13). "Eco" = the SDK's ENERGY_SAVER.
const MODES = ['Cool', 'Eco', 'Fan', 'Dry', 'Turbo Cool'];
const FANS = ['Auto', 'Low', 'Medium', 'High'];
const EVERY_DAY = 127;

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

export default function AcSchedule() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [dirty, setDirty] = useState(() => new Set()); // ids with unsaved edits

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const { data } = await supabase
      .from('ac_schedule')
      .select('*')
      .order('position', { ascending: true })
      .order('time_local', { ascending: true });
    setRows(data ?? []);
    setDirty(new Set());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addRow() {
    const position = rows.length ? Math.max(...rows.map((r) => r.position)) + 1 : 1;
    const { data } = await supabase
      .from('ac_schedule')
      .insert({ position, days: EVERY_DAY, time_local: '00:00', action: 'on', temp_f: 72, mode: 'Eco', fan: 'Auto' })
      .select()
      .single();
    if (data) setRows((p) => [...p, data]);
  }

  async function saveRow(row) {
    setSavingId(row.id);
    const { id, ...fields } = row;
    await supabase
      .from('ac_schedule')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id);
    setSavingId(null);
    setDirty((p) => { const n = new Set(p); n.delete(id); return n; });
  }

  async function deleteRow(id) {
    await supabase.from('ac_schedule').delete().eq('id', id);
    setRows((p) => p.filter((r) => r.id !== id));
    setDirty((p) => { const n = new Set(p); n.delete(id); return n; });
  }

  function patch(id, field, value) {
    setRows((p) => p.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    setDirty((p) => new Set(p).add(id));
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 mb-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <CalendarClock size={16} className="text-amber-400" />
          <span className="text-sm font-semibold text-zinc-100">AC Schedule</span>
        </div>
        <button
          onClick={addRow}
          className="text-xs px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700 transition-colors min-h-[36px] flex items-center gap-1.5"
        >
          <Plus size={13} /> Add entry
        </button>
      </div>

      <p className="text-xs text-zinc-500 mb-4 leading-relaxed">
        This is the live schedule the executor applies to your AC — each entry takes effect at its
        time. The agent tunes it automatically toward your goals; you can also edit any block here.
      </p>

      {/* ── Current schedule (editable) ── */}
      {loading ? (
        <div className="text-sm text-zinc-500 py-6 text-center">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-zinc-500 py-4">
          No entries yet — click &ldquo;Add entry&rdquo; to create your first schedule block.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
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
                  className="bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-lg px-2 py-1.5 text-xs min-h-[34px]"
                />

                {/* Action */}
                <select
                  value={r.action}
                  onChange={(e) => patch(r.id, 'action', e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-lg px-2 py-1.5 text-xs min-h-[34px]"
                >
                  <option value="on">Turn On</option>
                  <option value="off">Turn Off</option>
                </select>

                {r.action === 'on' && (
                  <>
                    {/* Temp */}
                    <input
                      type="number"
                      min={60}
                      max={86}
                      value={r.temp_f ?? ''}
                      onChange={(e) => patch(r.id, 'temp_f', e.target.value === '' ? null : Number(e.target.value))}
                      className="w-16 bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-lg px-2 py-1.5 text-xs min-h-[34px]"
                    />
                    <span className="text-xs text-zinc-500">°F</span>

                    {/* Mode */}
                    <select
                      value={r.mode ?? ''}
                      onChange={(e) => patch(r.id, 'mode', e.target.value)}
                      className="bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-lg px-2 py-1.5 text-xs min-h-[34px]"
                    >
                      {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>

                    {/* Fan */}
                    <select
                      value={r.fan ?? 'Auto'}
                      onChange={(e) => patch(r.id, 'fan', e.target.value)}
                      title="Fan speed"
                      className="bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-lg px-2 py-1.5 text-xs min-h-[34px]"
                    >
                      {FANS.map((f) => <option key={f} value={f}>{`Fan: ${f}`}</option>)}
                    </select>
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
                {' · '}{r.action === 'on' ? `${r.temp_f ?? '—'}°F ${r.mode ?? ''}${r.fan ? ` · Fan ${r.fan}` : ''}` : 'Off'}
                {!r.enabled && ' · (disabled)'}
                {dirty.has(r.id) && <span className="text-cyan-500"> · unsaved</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
