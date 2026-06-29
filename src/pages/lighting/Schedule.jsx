import { useState, useEffect, useRef } from 'react';
import {
  Sunrise, Moon, AlertTriangle, Play, Check, ChevronRight, X, Clock,
} from 'lucide-react';
import { useLightingSchedule } from './useLightingSchedule';
import { useLightingTimers } from './useLightingTimers';

// ── small shared pieces ───────────────────────────────────────────────────────
function MissingNotice({ table, migration }) {
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-2">
      <AlertTriangle size={15} className="text-amber-400 mt-0.5 shrink-0" />
      <div className="text-sm text-amber-300 leading-snug">
        <span className="font-semibold">{table} table not found.</span> Run migration
        <code className="mx-1 px-1 rounded bg-amber-950/50 text-amber-200 text-xs">{migration}</code>
        in the Supabase SQL editor, then reload.
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, suffix, onChange, accent = 'accent-amber-400' }) {
  return (
    <div>
      <div className="flex items-center mb-1.5">
        <span className="text-sm text-zinc-300">{label}</span>
        <span className="ml-auto text-sm text-zinc-300 tabular-nums">{value}{suffix}</span>
      </div>
      <input
        type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className={`w-full ${accent}`}
      />
    </div>
  );
}

function Toggle({ on, onClick, title }) {
  return (
    <button
      onClick={onClick} role="switch" aria-checked={on} title={title}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
        on ? 'bg-emerald-500' : 'bg-zinc-700'
      }`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
        on ? 'translate-x-5' : 'translate-x-0.5'
      }`} />
    </button>
  );
}

// ── time + day helpers ────────────────────────────────────────────────────────
const hhmm = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
const fmt12 = (h, m) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

// Day-of-week bitmask — bit0=Sun … bit6=Sat (matches strip firmware & wake picker).
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS = 0x3e; // Mon–Fri
const WEEKENDS = 0x41; // Sun + Sat

// Human summary for a day mask. `onceLabel` is what 0 (no days) means in context:
// "Once" for on/off timers, "Never" for the wake alarm.
function daysSummary(mask, onceLabel = 'Once') {
  const m = mask & 0x7f;
  if (m === 0x7f) return 'Every day';
  if (m === 0) return onceLabel;
  if (m === WEEKDAYS) return 'Weekdays';
  if (m === WEEKENDS) return 'Weekends';
  return DAY_NAMES.filter((_, i) => m & (1 << i)).join(', ');
}

function DayPicker({ value = 127, onChange }) {
  return (
    <div className="flex gap-1.5">
      {DAY_LABELS.map((label, i) => {
        const on = !!(value & (1 << i));
        return (
          <button
            key={label}
            onClick={() => onChange(value ^ (1 << i))}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors ${
              on ? 'bg-amber-500 text-zinc-900' : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// Quick-pick chips above the day grid: Every day / Weekdays / Weekends / Once.
function RepeatPicker({ value, onChange, onceLabel = 'Once' }) {
  const presets = [
    { label: 'Every day', mask: 0x7f },
    { label: 'Weekdays', mask: WEEKDAYS },
    { label: 'Weekends', mask: WEEKENDS },
    { label: onceLabel, mask: 0 },
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center">
        <span className="text-sm text-zinc-300">Repeat</span>
        <span className="ml-auto text-xs text-zinc-500">{daysSummary(value, onceLabel)}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => onChange(p.mask)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              (value & 0x7f) === p.mask
                ? 'bg-amber-500 text-zinc-900'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <DayPicker value={value} onChange={onChange} />
    </div>
  );
}

function TimeField({ label, hour, minute, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-zinc-300">{label}</span>
      <input
        type="time" step="300" value={hhmm(hour, minute)}
        onChange={(e) => {
          const [h, m] = e.target.value.split(':').map((n) => parseInt(n, 10));
          onChange(h, m);
        }}
        className="bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-100 tabular-nums"
      />
    </div>
  );
}

// ── modal shell ───────────────────────────────────────────────────────────────
function Modal({ title, icon, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-zinc-900 border border-zinc-800 rounded-t-2xl sm:rounded-2xl p-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          {icon}
          <span className="text-sm font-semibold text-zinc-100">{title}</span>
          <button onClick={onClose} className="ml-auto text-zinc-500 hover:text-zinc-200" title="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// A tappable summary row used in both sections.
function Row({ icon, title, summary, onClick, right }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-zinc-800/40 transition-colors"
    >
      {icon}
      <div className="min-w-0">
        <div className="text-sm font-medium text-zinc-100 truncate">{title}</div>
        <div className="text-[12px] text-zinc-500 truncate">{summary}</div>
      </div>
      <div className="ml-auto flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
        {right}
      </div>
      <ChevronRight size={16} className="text-zinc-600 shrink-0" />
    </div>
  );
}

// ── timer (on/off slot) editor ────────────────────────────────────────────────
function TimerEditor({ timer, onChange, onClose }) {
  const t = timer;
  return (
    <Modal
      title={`Timer ${t.slot + 1}`}
      icon={<Clock size={16} className="text-sky-300" />}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-300">Enabled</span>
          <Toggle on={t.enabled} onClick={() => onChange({ enabled: !t.enabled })} />
        </div>

        <div className={`flex flex-col gap-4 transition-opacity ${t.enabled ? '' : 'opacity-50'}`}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-zinc-300">Action</span>
            <div className="flex rounded-lg overflow-hidden border border-zinc-700">
              <button
                onClick={() => onChange({ turn_on: true })}
                className={`px-3 py-1.5 text-sm font-medium ${
                  t.turn_on ? 'bg-emerald-600 text-white' : 'bg-zinc-950 text-zinc-400'}`}
              >
                Turn on
              </button>
              <button
                onClick={() => onChange({ turn_on: false })}
                className={`px-3 py-1.5 text-sm font-medium ${
                  !t.turn_on ? 'bg-zinc-600 text-white' : 'bg-zinc-950 text-zinc-400'}`}
              >
                Turn off
              </button>
            </div>
          </div>

          <TimeField label="At" hour={t.hour} minute={t.minute}
                     onChange={(h, m) => onChange({ hour: h, minute: m })} />

          <RepeatPicker value={t.days} onChange={(v) => onChange({ days: v })} onceLabel="Once" />
        </div>
      </div>
    </Modal>
  );
}

// ── wake editor ───────────────────────────────────────────────────────────────
function WakeEditor({ s, updateWake, onClose }) {
  const rampStart = (() => {
    const d = new Date();
    d.setHours(s.wake_hour, s.wake_minute - s.wake_fade_min, 0, 0);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  })();
  const days = s.wake_days ?? 127;
  return (
    <Modal title="Wake up" icon={<Sunrise size={16} className="text-amber-300" />} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-300">Enabled</span>
          <Toggle on={!!s.wake_enabled} onClick={() => updateWake({ wake_enabled: !s.wake_enabled })} />
        </div>
        <div className={`flex flex-col gap-4 transition-opacity ${s.wake_enabled ? '' : 'opacity-50'}`}>
          <TimeField label="Reach full brightness at" hour={s.wake_hour} minute={s.wake_minute}
                     onChange={(h, m) => updateWake({ wake_hour: h, wake_minute: m })} />
          <RepeatPicker value={days} onChange={(v) => updateWake({ wake_days: v })} onceLabel="Never" />
          <Slider label="Fade-in length" value={s.wake_fade_min} min={1} max={60} suffix=" min"
                  onChange={(v) => updateWake({ wake_fade_min: v })} />
          <Slider label="Target brightness" value={s.wake_brightness} min={1} max={100} suffix="%"
                  onChange={(v) => updateWake({ wake_brightness: v })} />
          <p className="text-[11px] text-zinc-600 -mt-1">
            Starts ramping at <span className="text-zinc-400 tabular-nums">{rampStart}</span>, reaches{' '}
            {s.wake_brightness}% at {fmt12(s.wake_hour, s.wake_minute)} — {daysSummary(days, 'Never').toLowerCase()}.
          </p>
        </div>
      </div>
    </Modal>
  );
}

// ── bedtime editor ────────────────────────────────────────────────────────────
function BedtimeEditor({ s, updateSleep, onClose }) {
  return (
    <Modal title="Bedtime" icon={<Moon size={16} className="text-indigo-300" />} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Slider label="Dim-to-off length" value={Math.max(10, s.sleep_fade_min)} min={10} max={60}
                suffix=" min" onChange={(v) => updateSleep({ sleep_fade_min: v })}
                accent="accent-indigo-400" />
        <Slider label="Starting brightness" value={s.sleep_brightness} min={1} max={100} suffix="%"
                onChange={(v) => updateSleep({ sleep_brightness: v })} accent="accent-indigo-400" />
        <p className="text-[11px] text-zinc-600 text-center">
          Turns the strip on, then dims from {s.sleep_brightness}% to off over{' '}
          {Math.max(10, s.sleep_fade_min)} minutes.
        </p>
      </div>
    </Modal>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────
export default function Schedule() {
  const {
    schedule, loading, missing, updateWake, updateSleep, startBedtime,
  } = useLightingSchedule();
  const {
    timers, loading: timersLoading, missing: timersMissing, updateTimer,
  } = useLightingTimers();

  const [editor, setEditor] = useState(null); // {kind:'timer', slot} | {kind:'wake'} | {kind:'bedtime'}

  // Transient "Bedtime started" confirmation on the row button.
  const [justStarted, setJustStarted] = useState(false);
  const resetRef = useRef();
  useEffect(() => () => clearTimeout(resetRef.current), []);
  const handleBedtime = async () => {
    await startBedtime();
    setJustStarted(true);
    clearTimeout(resetRef.current);
    resetRef.current = setTimeout(() => setJustStarted(false), 4000);
  };

  if (loading || timersLoading) {
    return <div className="text-sm text-zinc-500 py-16 text-center">Loading schedule…</div>;
  }

  const s = schedule;
  const editingTimer = editor?.kind === 'timer'
    ? timers.find((t) => t.slot === editor.slot) : null;

  return (
    <div className="flex flex-col gap-5">
      {missing && <MissingNotice table="lighting_schedule" migration="020_lighting_schedule.sql" />}
      {timersMissing && <MissingNotice table="lighting_timers" migration="026_lighting_timers.sql" />}

      <p className="text-xs text-zinc-500 leading-relaxed">
        These run <span className="text-zinc-400">on the strip itself</span> — the Pi writes them over
        Bluetooth, so they keep working even if the Pi is offline. Tap any row to edit.
      </p>

      {/* On/off timers */}
      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-2 px-1">
          Timers
        </h2>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 divide-y divide-zinc-800 overflow-hidden">
          {timers.map((t) => (
            <Row
              key={t.slot}
              icon={<Clock size={16} className={t.enabled ? 'text-sky-300' : 'text-zinc-600'} />}
              title={
                <span className={t.enabled ? '' : 'text-zinc-500'}>
                  {fmt12(t.hour, t.minute)} · {t.turn_on ? 'Turn on' : 'Turn off'}
                </span>
              }
              summary={daysSummary(t.days, 'Once')}
              onClick={() => setEditor({ kind: 'timer', slot: t.slot })}
              right={<Toggle on={t.enabled} onClick={() => updateTimer(t.slot, { enabled: !t.enabled })} />}
            />
          ))}
        </div>
      </section>

      {/* Sunrise & sunset */}
      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-2 px-1">
          Sunrise &amp; Sunset
        </h2>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 divide-y divide-zinc-800 overflow-hidden">
          <Row
            icon={<Sunrise size={16} className={s.wake_enabled ? 'text-amber-300' : 'text-zinc-600'} />}
            title={<span className={s.wake_enabled ? '' : 'text-zinc-500'}>Wake up · {fmt12(s.wake_hour, s.wake_minute)}</span>}
            summary={`${daysSummary(s.wake_days ?? 127, 'Never')} · ${s.wake_fade_min}m fade to ${s.wake_brightness}%`}
            onClick={() => setEditor({ kind: 'wake' })}
            right={<Toggle on={!!s.wake_enabled} onClick={() => updateWake({ wake_enabled: !s.wake_enabled })} />}
          />
          <Row
            icon={<Moon size={16} className="text-indigo-300" />}
            title="Bedtime"
            summary={`Dim from ${s.sleep_brightness}% over ${Math.max(10, s.sleep_fade_min)}m`}
            onClick={() => setEditor({ kind: 'bedtime' })}
            right={
              <button
                onClick={handleBedtime}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  justStarted ? 'bg-emerald-600 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                }`}
              >
                {justStarted ? <><Check size={14} /> Started</> : <><Play size={14} /> Start now</>}
              </button>
            }
          />
        </div>
      </section>

      {/* modals */}
      {editingTimer && (
        <TimerEditor
          timer={editingTimer}
          onChange={(partial) => updateTimer(editingTimer.slot, partial)}
          onClose={() => setEditor(null)}
        />
      )}
      {editor?.kind === 'wake' && (
        <WakeEditor s={s} updateWake={updateWake} onClose={() => setEditor(null)} />
      )}
      {editor?.kind === 'bedtime' && (
        <BedtimeEditor s={s} updateSleep={updateSleep} onClose={() => setEditor(null)} />
      )}
    </div>
  );
}
