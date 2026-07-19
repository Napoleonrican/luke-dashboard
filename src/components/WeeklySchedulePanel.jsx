import { useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Weekly Schedule — pulled out of the Shift Setup modal so it can live on the
// Gig Tracker's pre-shift landing screen (right below "Last Shift"), with its
// own edit modal for pasting a new week in. Self-contained: only needs the
// parent's `weeklySchedule` state and a callback to update it after a save.

function parseTime(val) {
  if (val == null) return null;
  const s = String(val).trim();
  if (!s) return null;
  // "5:00 PM" / "11:30 AM" (Excel renders times in 12h format on paste)
  const ampm = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = parseInt(ampm[2], 10);
    if (/pm/i.test(ampm[3])) { if (h !== 12) h += 12; }
    else { if (h === 12) h = 0; }
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  // "17:30" — already 24h
  const hhmm = s.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) return `${String(parseInt(hhmm[1])).padStart(2, '0')}:${hhmm[2]}`;
  // Excel time fraction (0–1), e.g. 0.7708 = 18:30
  const n = parseFloat(s);
  if (!isNaN(n) && n > 0 && n < 1) {
    const totalMin = Math.round(n * 1440);
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  return null;
}

function parseMoney(val) {
  if (val == null) return null;
  const s = String(val).trim().replace(/[$,]/g, '');
  if (s === '') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parsePastedSchedule(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return null;

  const parsed = lines.map(line => {
    const cols = line.split('\t');
    return {
      lob:          cols[0] != null && cols[0] !== '' ? parseFloat(cols[0]) : null,
      dow:          cols[1]?.trim() || null,
      area:         cols[2]?.trim() || null,
      earliest:     parseTime(cols[3]),
      latest:       parseTime(cols[4]),
      type:         cols[5]?.trim() || null,
      min_earnings: parseMoney(cols[6]),
      min_hours:    parseMoney(cols[7]),
      max_earnings: parseMoney(cols[8]),
      max_hours:    parseMoney(cols[9]),
    };
  });

  const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return WEEK_DAYS.map(dow =>
    parsed.find(r => r.dow === dow) ?? {
      lob: null, dow, area: null, earliest: null, latest: null,
      type: null, min_earnings: null, min_hours: null, max_earnings: null, max_hours: null,
    }
  );
}

function getThisWeekStart() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

// Type badge — categorical color coding (green/amber), mirroring the "Order"
// vs "Hourly-Test" color coding from the source workbook.
function TypeBadge({ type }) {
  if (!type) return <span className="text-zinc-600">—</span>;
  const isOrder = /order/i.test(type) && !/hourly/i.test(type);
  const cls = isOrder
    ? 'bg-emerald-900/50 text-emerald-300 border-emerald-800'
    : 'bg-amber-900/40 text-amber-300 border-amber-800';
  return (
    <span className={`inline-block text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${cls}`}>
      {type}
    </span>
  );
}

// Green→amber→red heat-scale color for a numeric value, relative to the
// min/max of that same field across the week — the same idea as the
// conditional-formatting color scale used in the source workbook, just
// computed per-column at render time instead of baked into cell fills.
function heatColor(value, lo, hi) {
  if (value == null || !Number.isFinite(lo) || !Number.isFinite(hi) || hi === lo) return '#a1a1aa'; // zinc-400
  const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
  const hue = t * 120; // 0 = red, 60 = amber, 120 = green
  return `hsl(${hue}, 65%, 58%)`;
}

function columnRange(rows, field) {
  const values = rows.map(r => r[field]).filter(v => v != null && Number.isFinite(v));
  if (values.length === 0) return [0, 0];
  return [Math.min(...values), Math.max(...values)];
}

// Stacked, wrap-friendly rows instead of a wide table — the 7-column table
// this replaced needed horizontal scrolling on phone-width screens; this
// never does, regardless of viewport width.
function ScheduleRows({ rows }) {
  const [minEarnLo, minEarnHi] = columnRange(rows, 'min_earnings');
  const [maxEarnLo, maxEarnHi] = columnRange(rows, 'max_earnings');
  const [minHoursLo, minHoursHi] = columnRange(rows, 'min_hours');
  const [maxHoursLo, maxHoursHi] = columnRange(rows, 'max_hours');

  return (
    <div className="divide-y divide-zinc-800">
      {rows.map((row, i) => {
        const hasShift = row.area || row.type || row.min_earnings != null || row.max_earnings != null;
        return (
          <div key={i} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-zinc-100">{row.dow || '—'}</span>
              <TypeBadge type={row.type} />
            </div>
            {hasShift ? (
              <div className="mt-1.5 flex items-center justify-between gap-3 text-xs">
                <span className="text-zinc-400 truncate">{row.area || '—'}</span>
                <span className="tabular-nums shrink-0 flex items-center gap-1 font-medium">
                  <span style={{ color: heatColor(row.min_earnings, minEarnLo, minEarnHi) }}>
                    {row.min_earnings != null ? `$${row.min_earnings.toFixed(0)}` : '—'}
                  </span>
                  <span style={{ color: heatColor(row.min_hours, minHoursLo, minHoursHi) }}>
                    /{row.min_hours ?? '—'}h
                  </span>
                  <span className="text-zinc-700 mx-0.5">→</span>
                  <span style={{ color: heatColor(row.max_earnings, maxEarnLo, maxEarnHi) }}>
                    {row.max_earnings != null ? `$${row.max_earnings.toFixed(0)}` : '—'}
                  </span>
                  <span style={{ color: heatColor(row.max_hours, maxHoursLo, maxHoursHi) }}>
                    /{row.max_hours ?? '—'}h
                  </span>
                </span>
              </div>
            ) : (
              <div className="mt-1 text-xs text-zinc-600">Off</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function WeeklySchedulePanel({ weeklySchedule, onScheduleSaved }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [preview, setPreview] = useState(null);
  const [upsertStatus, setUpsertStatus] = useState(null);

  function openModal() {
    setPasteText('');
    setPreview(null);
    setUpsertStatus(null);
    setModalOpen(true);
  }

  async function confirmPastedSchedule() {
    if (!preview || !supabase) return;
    setUpsertStatus('saving');
    const record = {
      week_start_date: getThisWeekStart(),
      rows: preview,
      source_label: 'paste-ui',
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from('weekly_schedule')
      .upsert(record, { onConflict: 'week_start_date' });
    if (error) {
      console.error('[weekly_schedule upsert]', error.message);
      setUpsertStatus('error');
    } else {
      onScheduleSaved(record);
      setPasteText('');
      setPreview(null);
      setUpsertStatus('ok');
      setModalOpen(false);
    }
  }

  return (
    <>
      <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Weekly Schedule</span>
          <button
            onClick={openModal}
            className="text-xs font-semibold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg px-3 py-1.5 min-h-[32px] transition-colors"
          >
            Edit
          </button>
        </div>
        <div className="px-4 pb-4 border-t border-zinc-800 pt-3">
          {weeklySchedule ? (
            <>
              <div className="text-xs text-zinc-500 mb-2">
                Week of {weeklySchedule.week_start_date} &middot; Updated {new Date(weeklySchedule.updated_at).toLocaleDateString()}
              </div>
              <ScheduleRows rows={weeklySchedule.rows || []} />
            </>
          ) : (
            <div className="text-xs text-zinc-500">No schedule loaded yet — tap Edit to paste one in.</div>
          )}
        </div>
      </div>

      {/* Paste-schedule modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
          <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-3 border-b border-zinc-800 shrink-0">
            <h2 className="text-lg font-bold text-zinc-100">Weekly Schedule</h2>
            <button
              onClick={() => setModalOpen(false)}
              className="flex items-center justify-center w-10 h-10 rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              aria-label="Close weekly schedule"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-5 max-w-lg mx-auto w-full space-y-4">
            {weeklySchedule && (
              <div>
                <div className="text-xs text-zinc-500 mb-2">
                  Current — week of {weeklySchedule.week_start_date} &middot; Updated {new Date(weeklySchedule.updated_at).toLocaleDateString()}
                </div>
                <ScheduleRows rows={weeklySchedule.rows || []} />
              </div>
            )}

            {upsertStatus === 'error' && (
              <div className="text-xs text-red-400">Save failed — check console.</div>
            )}

            <div className="space-y-2">
              <div className="text-xs text-zinc-500">
                In Excel, select AX3:BG9 on the Scheduling tab, copy, then paste below.
              </div>
              <textarea
                rows={8}
                value={pasteText}
                onChange={e => {
                  setPasteText(e.target.value);
                  const parsed = parsePastedSchedule(e.target.value);
                  setPreview(parsed?.length > 0 ? parsed : null);
                }}
                placeholder="Paste tab-delimited rows here…"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none focus:border-zinc-500 font-mono resize-none"
              />

              {preview && (
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Preview ({preview.length} rows):</div>
                  <ScheduleRows rows={preview} />
                </div>
              )}
            </div>
          </div>

          <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3 border-t border-zinc-800 shrink-0 max-w-lg mx-auto w-full flex gap-2">
            <button
              onClick={confirmPastedSchedule}
              disabled={!preview || upsertStatus === 'saving'}
              className="flex-1 bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white font-semibold rounded-2xl py-4 min-h-[60px] transition-colors"
            >
              {upsertStatus === 'saving' ? 'Saving…' : 'Confirm & Save'}
            </button>
            <button
              onClick={() => setModalOpen(false)}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold px-6 rounded-2xl min-h-[60px] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
