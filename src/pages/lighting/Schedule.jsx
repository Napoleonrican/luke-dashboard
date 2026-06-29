import { useState, useEffect, useRef } from 'react';
import { Sunrise, Moon, AlertTriangle, Play, Check } from 'lucide-react';
import { useLightingSchedule } from './useLightingSchedule';

function MissingNotice() {
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-2">
      <AlertTriangle size={15} className="text-amber-400 mt-0.5 shrink-0" />
      <div className="text-sm text-amber-300 leading-snug">
        <span className="font-semibold">lighting_schedule table not found.</span> Run migration
        <code className="mx-1 px-1 rounded bg-amber-950/50 text-amber-200 text-xs">020_lighting_schedule.sql</code>
        in the Supabase SQL editor, then reload.
      </div>
    </div>
  );
}

// Labeled slider row.
function Slider({ label, value, min, max, suffix, onChange, accent = 'accent-fuchsia-400' }) {
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
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        on ? 'bg-emerald-500' : 'bg-zinc-700'
      }`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
        on ? 'translate-x-5' : 'translate-x-0.5'
      }`} />
    </button>
  );
}

const hhmm = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

// Day-of-week bitmask helpers — bit0=Sun, bit1=Mon, …, bit6=Sat (matches strip firmware).
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const dayBit = (i) => 1 << i;
const dayOn = (mask, i) => !!(mask & dayBit(i));
const toggleDay = (mask, i) => mask ^ dayBit(i);

function DayPicker({ value = 127, onChange }) {
  return (
    <div>
      <div className="flex items-center mb-1.5">
        <span className="text-sm text-zinc-300">Repeat on</span>
        {value === 0 && (
          <span className="ml-2 text-xs text-amber-400">No days — alarm won&apos;t fire</span>
        )}
      </div>
      <div className="flex gap-1.5">
        {DAY_LABELS.map((label, i) => (
          <button
            key={label}
            onClick={() => onChange(toggleDay(value, i))}
            className={`flex-1 rounded-md py-1 text-xs font-semibold transition-colors ${
              dayOn(value, i)
                ? 'bg-amber-500 text-zinc-900'
                : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Schedule() {
  const {
    schedule, loading, missing, updateWake, updateSleep, startBedtime,
  } = useLightingSchedule();

  // Transient "Bedtime started" confirmation, driven from the click handler
  // (not an effect) so we never setState synchronously during render.
  const [justStarted, setJustStarted] = useState(false);
  const resetRef = useRef();
  useEffect(() => () => clearTimeout(resetRef.current), []);
  const handleBedtime = async () => {
    await startBedtime();
    setJustStarted(true);
    clearTimeout(resetRef.current);
    resetRef.current = setTimeout(() => setJustStarted(false), 4000);
  };

  if (loading) {
    return <div className="text-sm text-zinc-500 py-16 text-center">Loading schedule…</div>;
  }

  const s = schedule;
  const wakeOn = !!s.wake_enabled;

  return (
    <div className="flex flex-col gap-6">
      {missing && <MissingNotice />}

      <p className="text-xs text-zinc-500 -mb-1 leading-relaxed">
        These run <span className="text-zinc-400">on the strip itself</span> — the Pi writes them over
        Bluetooth and the strip handles the fades, so they keep working even if the Pi is offline. The Pi
        re-syncs the strip&apos;s clock daily so the wake-up never drifts.
      </p>

      {/* Wake up — sunrise */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center gap-2 mb-4">
          <Sunrise size={16} className="text-amber-300" />
          <span className="text-sm font-semibold text-zinc-100">Wake up</span>
          <span className="ml-auto" />
          <Toggle on={wakeOn} onClick={() => updateWake({ wake_enabled: !wakeOn })}
                  title={wakeOn ? 'Enabled' : 'Disabled'} />
        </div>

        <div className={`flex flex-col gap-4 transition-opacity ${wakeOn ? '' : 'opacity-50'}`}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-zinc-300">Reach full brightness at</span>
            <input
              type="time" step="300" value={hhmm(s.wake_hour, s.wake_minute)}
              onChange={(e) => {
                const [h, m] = e.target.value.split(':').map((n) => parseInt(n, 10));
                updateWake({ wake_hour: h, wake_minute: m });
              }}
              className="bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-100 tabular-nums"
            />
          </div>
          <DayPicker value={s.wake_days ?? 127}
                     onChange={(v) => updateWake({ wake_days: v })} />
          <Slider label="Fade-in length" value={s.wake_fade_min} min={1} max={60} suffix=" min"
                  onChange={(v) => updateWake({ wake_fade_min: v })} accent="accent-amber-400" />
          <Slider label="Target brightness" value={s.wake_brightness} min={1} max={100} suffix="%"
                  onChange={(v) => updateWake({ wake_brightness: v })} accent="accent-amber-400" />
          <p className="text-[11px] text-zinc-600 -mt-1">
            Light starts ramping at{' '}
            <span className="text-zinc-400 tabular-nums">
              {(() => {
                const t = new Date();
                t.setHours(s.wake_hour, s.wake_minute - s.wake_fade_min, 0, 0);
                return t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              })()}
            </span>{' '}and reaches {s.wake_brightness}% at {hhmm(s.wake_hour, s.wake_minute)}, every day.
          </p>
        </div>
      </div>

      {/* Bedtime — sunset, on demand */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center gap-2 mb-4">
          <Moon size={16} className="text-indigo-300" />
          <span className="text-sm font-semibold text-zinc-100">Bedtime</span>
          <span className="ml-auto text-[11px] text-zinc-600">on demand</span>
        </div>

        <div className="flex flex-col gap-4">
          <Slider label="Dim-to-off length" value={Math.max(10, s.sleep_fade_min)} min={10} max={60} suffix=" min"
                  onChange={(v) => updateSleep({ sleep_fade_min: v })} accent="accent-indigo-400" />
          <Slider label="Starting brightness" value={s.sleep_brightness} min={1} max={100} suffix="%"
                  onChange={(v) => updateSleep({ sleep_brightness: v })} accent="accent-indigo-400" />

          <button
            onClick={handleBedtime}
            className={`mt-1 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
              justStarted
                ? 'bg-emerald-600 text-white'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            }`}
          >
            {justStarted
              ? (<><Check size={16} /> Bedtime started</>)
              : (<><Play size={16} /> Start bedtime now</>)}
          </button>
          <p className="text-[11px] text-zinc-600 -mt-1 text-center">
            Turns the strip on, then dims from {s.sleep_brightness}% to off over {Math.max(10, s.sleep_fade_min)} minutes.
          </p>
        </div>
      </div>
    </div>
  );
}
