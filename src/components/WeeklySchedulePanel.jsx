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

function ScheduleTable({ rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="text-xs w-full min-w-[480px]">
        <thead>
          <tr className="text-zinc-500 border-b border-zinc-700">
            <th className="text-left py-1 pr-2 font-medium">Day</th>
            <th className="text-left py-1 pr-2 font-medium">Zone</th>
            <th className="text-left py-1 pr-2 font-medium">Type</th>
            <th className="text-left py-1 pr-2 font-medium">Min$</th>
            <th className="text-left py-1 pr-2 font-medium">Min hrs</th>
            <th className="text-left py-1 pr-2 font-medium">Max$</th>
            <th className="text-left py-1 font-medium">Max hrs</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-zinc-800 last:border-0">
              <td className="py-1 pr-2 text-zinc-200 font-medium">{row.dow || '—'}</td>
              <td className="py-1 pr-2 text-zinc-300">{row.area || '—'}</td>
              <td className="py-1 pr-2 text-zinc-400">{row.type || '—'}</td>
              <td className="py-1 pr-2 text-zinc-300 tabular-nums">{row.min_earnings != null ? `$${row.min_earnings.toFixed(0)}` : '—'}</td>
              <td className="py-1 pr-2 text-zinc-300 tabular-nums">{row.min_hours != null ? row.min_hours : '—'}</td>
              <td className="py-1 pr-2 text-zinc-300 tabular-nums">{row.max_earnings != null ? `$${row.max_earnings.toFixed(0)}` : '—'}</td>
              <td className="py-1 text-zinc-300 tabular-nums">{row.max_hours != null ? row.max_hours : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
              <ScheduleTable rows={weeklySchedule.rows || []} />
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
                <ScheduleTable rows={weeklySchedule.rows || []} />
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
                  <ScheduleTable rows={preview} />
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
