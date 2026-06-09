import { useState, useEffect, useCallback } from 'react';
import {
  CalendarClock, Plus, Trash2, Save, Power, Sparkles, LoaderCircle, ArrowRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // bit 0 = Sunday
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MODES = ['Cool', 'Eco', 'Energy Saver', 'Turbo Cool', 'Dry'];
const EVERY_DAY = 127;

const hasDay = (mask, i) => (mask & (1 << i)) !== 0;
const toggleDayBit = (mask, i) => mask ^ (1 << i);

// Defensively strip any stray XML-ish tags from stored recommendation text
// (older rows may have been saved before the advisor switched to clean JSON).
const stripTags = (s) => (typeof s === 'string' ? s.replace(/<\/?[a-z_]+>/gi, '').trim() : s);

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

// Render one change from the advisor in plain language.
function describeChange(c, byId) {
  if (c.action === 'add') {
    return {
      verb: 'Add',
      text: `${fmtTime12(c.time_local)} · ${c.temp_f != null ? `${c.temp_f}°F ` : ''}${c.mode ?? ''}${
        c.days != null && c.days !== EVERY_DAY ? ` · ${daysLabel(c.days)}` : ''
      }`,
      reason: c.reason,
    };
  }
  if (c.action === 'remove') {
    const e = byId[c.entry_id];
    return {
      verb: 'Remove',
      text: e ? `${fmtTime12(e.time_local)} · ${e.action === 'on' ? `${e.temp_f}°F ${e.mode}` : 'Off'}` : 'entry',
      reason: c.reason,
    };
  }
  // field edit
  const e = byId[c.entry_id];
  const where = e ? `${fmtTime12(e.time_local)} entry` : 'entry';
  const fieldLabel = { temp_f: 'temp', mode: 'mode', time_local: 'time', days: 'days', action: 'action' }[c.field] || c.field;
  const fromTo =
    c.field === 'time_local'
      ? `${fmtTime12(c.from)} → ${fmtTime12(c.to)}`
      : c.field === 'days'
      ? `${daysLabel(c.from)} → ${daysLabel(c.to)}`
      : `${c.from}${c.field === 'temp_f' ? '°F' : ''} → ${c.to}${c.field === 'temp_f' ? '°F' : ''}`;
  return { verb: 'Change', text: `${where} ${fieldLabel}: ${fromTo}`, reason: c.reason };
}

export default function AcSchedule() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [dirty, setDirty] = useState(() => new Set()); // ids with unsaved edits

  // Advisor recommendations
  const [recs, setRecs] = useState(null); // {summary, changes, rationale, generatedAt}
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState(null);

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

  // Load the most recent stored recommendation so advice persists between visits.
  const loadLatestRec = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from('schedule_recommendations')
      .select('summary,changes,rationale,generated_at')
      .order('generated_at', { ascending: false })
      .limit(1);
    if (data?.[0]) {
      setRecs({
        summary: stripTags(data[0].summary),
        changes: data[0].changes ?? [],
        rationale: stripTags(data[0].rationale),
        generatedAt: data[0].generated_at,
      });
    }
  }, []);

  useEffect(() => { load(); loadLatestRec(); }, [load, loadLatestRec]);

  async function addRow() {
    const position = rows.length ? Math.max(...rows.map((r) => r.position)) + 1 : 1;
    const { data } = await supabase
      .from('ac_schedule')
      .insert({ position, days: EVERY_DAY, time_local: '00:00', action: 'on', temp_f: 72, mode: 'Eco' })
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

  async function analyze() {
    setRecError(null);
    setRecLoading(true);
    try {
      const coords = await new Promise((resolve) => {
        if (!('geolocation' in navigator)) { resolve({ lat: null, lon: null }); return; }
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
          () => resolve({ lat: null, lon: null }), // weather is optional; proceed without it
          { timeout: 10000, maximumAge: 10 * 60 * 1000 }
        );
      });
      const res = await fetch('/api/schedule-advisor', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(coords),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setRecs(data);
    } catch (e) {
      setRecError(e.message || 'Something went wrong.');
    } finally {
      setRecLoading(false);
    }
  }

  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  const hasChanges = recs?.changes && recs.changes.length > 0;

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
        Enter the schedule you have set in the SmartHQ app. This is your baseline — the advisor reads it
        and recommends changes against it. (SmartHQ schedules can&apos;t be read automatically.)
      </p>

      {/* ── Current schedule (editable) ── */}
      {loading ? (
        <div className="text-sm text-zinc-500 py-6 text-center">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-zinc-500 py-4">
          No entries yet — click &ldquo;Add entry&rdquo; to mirror your SmartHQ schedule.
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
                {' · '}{r.action === 'on' ? `${r.temp_f ?? '—'}°F ${r.mode ?? ''}` : 'Off'}
                {!r.enabled && ' · (disabled)'}
                {dirty.has(r.id) && <span className="text-cyan-500"> · unsaved</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Advisor recommendations ── */}
      <div className="mt-5 pt-4 border-t border-zinc-800">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-cyan-400" />
            <span className="text-sm font-semibold text-zinc-100">Recommendations</span>
          </div>
          <button
            onClick={analyze}
            disabled={recLoading || rows.length === 0}
            className="text-xs px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors min-h-[36px] flex items-center gap-1.5 disabled:opacity-60"
          >
            {recLoading ? (
              <><LoaderCircle size={13} className="animate-spin" /> Analyzing…</>
            ) : (
              <><Sparkles size={13} /> {recs ? 'Re-analyze' : 'Analyze now'}</>
            )}
          </button>
        </div>

        {recError && <div className="text-xs text-red-400 mb-3">{recError}</div>}

        {recs?.summary && (
          <div className="text-sm text-zinc-200 leading-relaxed mb-3">{recs.summary}</div>
        )}

        {hasChanges ? (
          <div className="flex flex-col gap-2 mb-3">
            {recs.changes.map((c, i) => {
              const d = describeChange(c, byId);
              const tone =
                d.verb === 'Add' ? 'text-emerald-400 border-emerald-500/30'
                : d.verb === 'Remove' ? 'text-red-400 border-red-500/30'
                : 'text-amber-400 border-amber-500/30';
              return (
                <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                  <div className="flex items-center gap-2 flex-wrap text-sm">
                    <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border ${tone}`}>
                      {d.verb}
                    </span>
                    <ArrowRight size={12} className="text-zinc-600" />
                    <span className="text-zinc-100">{d.text}</span>
                  </div>
                  {d.reason && <div className="text-xs text-zinc-500 mt-1.5 leading-relaxed">{d.reason}</div>}
                </div>
              );
            })}
          </div>
        ) : recs && !recError ? (
          <div className="text-xs text-zinc-500 mb-3">No schedule changes recommended right now.</div>
        ) : !recLoading && !recError ? (
          <div className="text-xs text-zinc-500 mb-3">
            Get data-driven suggestions for your AC schedule from your indoor history, outdoor weather,
            and presence pattern. You apply any you like in the SmartHQ app.
          </div>
        ) : null}

        {recs?.rationale && (
          <details className="text-xs text-zinc-400 leading-relaxed">
            <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300 select-none">Why these suggestions</summary>
            <div className="mt-2 whitespace-pre-wrap">{recs.rationale}</div>
          </details>
        )}

        {hasChanges && (
          <div className="text-[11px] text-amber-500/80 mt-3 flex items-center gap-1.5">
            <CalendarClock size={12} />
            Apply changes you accept in the SmartHQ app, then update the schedule above to match.
          </div>
        )}

        {recs?.generatedAt && (
          <div className="text-[11px] text-zinc-600 mt-2">
            Generated {new Date(recs.generatedAt).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}
