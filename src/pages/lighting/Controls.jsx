import { useOutletContext } from 'react-router-dom';
import { HexColorPicker } from 'react-colorful';
import { Power, Sun, AlertTriangle, Lightbulb } from 'lucide-react';
import { rgbToHex, hexToRgb, colorName } from './useLightingData';

// Vivid color presets (full value — brightness is controlled separately).
const COLOR_PRESETS = [
  '#ff0000', '#ff7a00', '#ffd400', '#3cff00', '#00ffd0',
  '#0066ff', '#7a00ff', '#ff00aa', '#ffffff',
];

// White-temperature presets, warm → cool (approx. correlated color temperatures).
const WHITES = [
  { label: 'Candle', hex: '#ff9329' },
  { label: 'Warm', hex: '#ffc58f' },
  { label: 'Soft', hex: '#ffe4ce' },
  { label: 'Neutral', hex: '#fff4e5' },
  { label: 'Cool', hex: '#ffffff' },
  { label: 'Daylight', hex: '#c9e2ff' },
];

function MissingNotice() {
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-2">
      <AlertTriangle size={15} className="text-amber-400 mt-0.5 shrink-0" />
      <div className="text-sm text-amber-300 leading-snug">
        <span className="font-semibold">strip_state table not found.</span> Run migration
        <code className="mx-1 px-1 rounded bg-amber-950/50 text-amber-200 text-xs">015_strip_state.sql</code>
        in the Supabase SQL editor, then reload. Controls still send, but won&apos;t persist until it exists.
      </div>
    </div>
  );
}

export default function Controls() {
  const { strip, loading, missing, setColor, setBrightness, togglePower } = useOutletContext();

  if (loading) {
    return <div className="text-sm text-zinc-500 py-16 text-center">Loading strip…</div>;
  }

  const hex = rgbToHex(strip.r, strip.g, strip.b);
  const on = !!strip.power;

  return (
    <div className="flex flex-col gap-6">
      {missing && <MissingNotice />}

      {/* Power + live state */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="h-9 w-9 rounded-lg shrink-0 border border-zinc-700"
              style={{ background: on ? hex : '#27272a', boxShadow: on ? `0 0 14px ${hex}88` : 'none' }}
            />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-zinc-100">
                {on ? 'On' : 'Off'}
                {on && <span className="text-zinc-500 font-normal"> · {colorName(strip)} · {strip.brightness}%</span>}
              </div>
              <div className="text-[11px] text-zinc-600 truncate">Govee H6195 · applied by the Pi over BLE</div>
            </div>
          </div>
          <button
            onClick={togglePower}
            role="switch"
            aria-checked={on}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              on ? 'bg-emerald-500' : 'bg-zinc-700'
            }`}
            title={on ? 'On — click to turn off' : 'Off — click to turn on'}
          >
            <Power size={11} className={`absolute left-1.5 text-white transition-opacity ${on ? 'opacity-100' : 'opacity-0'}`} />
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                on ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Color picker */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb size={16} className="text-fuchsia-400" />
          <span className="text-sm font-semibold text-zinc-100">Color</span>
          <span className="ml-auto text-xs text-zinc-500 tabular-nums">{hex.toUpperCase()}</span>
        </div>

        <div className="lighting-picker mx-auto">
          <HexColorPicker color={hex} onChange={(h) => setColor(hexToRgb(h))} />
        </div>

        {/* Vivid presets */}
        <div className="mt-4 flex flex-wrap gap-2 justify-center">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(hexToRgb(c))}
              className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${
                hex.toLowerCase() === c.toLowerCase() ? 'border-white' : 'border-zinc-700'
              }`}
              style={{ background: c }}
              title={c}
            />
          ))}
        </div>
      </div>

      {/* White temperature */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sun size={16} className="text-amber-300" />
          <span className="text-sm font-semibold text-zinc-100">White temperature</span>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {WHITES.map((w) => (
            <button
              key={w.label}
              onClick={() => setColor(hexToRgb(w.hex))}
              className="flex flex-col items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950/40 p-2 hover:border-zinc-600 transition-colors"
            >
              <span className="h-6 w-full rounded" style={{ background: w.hex }} />
              <span className="text-[11px] text-zinc-400">{w.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Brightness */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sun size={16} className="text-zinc-400" />
          <span className="text-sm font-semibold text-zinc-100">Brightness</span>
          <span className="ml-auto text-sm text-zinc-300 tabular-nums">{strip.brightness}%</span>
        </div>
        <input
          type="range"
          min="1"
          max="100"
          value={strip.brightness}
          onChange={(e) => setBrightness(parseInt(e.target.value, 10))}
          className="w-full accent-fuchsia-400"
        />
      </div>
    </div>
  );
}
