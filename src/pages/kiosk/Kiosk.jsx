import { useState, useEffect, useRef } from 'react';
import { Droplets, LoaderCircle, ArrowUp, ArrowDown, Minus, Snowflake, Settings, X } from 'lucide-react';
import { useKioskData } from './useKioskData';
import { usePhotoAlbum } from './usePhotoAlbum';
import { weatherIconFor } from './weatherIcons';
import { timeAgo, PALETTE } from '../climate/useClimateData';

// Full-bleed "digital photo frame" style display for a living-room panel.
// No nav chrome, no auth gate (a TV/kiosk can't log in). Card styling
// deliberately mirrors Climate Overview's sensor tiles (colored dot, icon
// rows) so the two views read as the same product, just scaled up for a
// wall display.
//
// Two OneDrive folders (api/kiosk-photos.js) feed two different things:
//   - "backgrounds" rotates slowly as a dimmed backdrop behind the climate view
//   - "slideshow" takes over the full screen for a stretch on a timer, then
//     hands back to the climate view

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CLIMATE_MS = 10 * 60_000;         // how long the climate view stays up
const PHOTO_MIN_MS = 5 * 60_000;        // a single slideshow photo shows for 5-10 min
const PHOTO_MAX_MS = 10 * 60_000;
const BACKGROUND_MIN_INTERVAL_MS = 60 * 60_000; // change at most once/hour
const FADE_MS = 1500;
// Photo-mode overlay text sits inside full-width top/bottom gradient scrims
// (robust against arbitrary photo content, unlike a small translucent box)
// with only the left/right side randomized per photo — clock top, climate
// readout bottom, opposite sides for a little variety.
const OVERLAY_SIDES = ['left', 'right'];
const OPPOSITE_SIDE = { left: 'right', right: 'left' };
// Kiosk devices sit powered on for weeks — a full reload once a day (off
// hours) resets memory/JS state and picks up any new deploy, cheap insurance
// against slow leaks rather than a sign anything's actually wrong.
const DAILY_RELOAD_HOUR = 4;

// Mirrors Climate Overview's CONTROL_MODE_CONFIG colors (violet/red/emerald)
// for the same states, at the coarser 3-state granularity useKioskData's
// loadAc() computes — a status dot instead of a full banner.
const AC_STATE_COLOR = {
  'Schedule Override': '#a78bfa', // violet-400
  'Dashboard control': '#34d399', // emerald-400
  'Manual control': '#f87171',    // red-400
};

// Same display-name mapping Climate Overview uses (ENERGY_SAVER -> "Eco",
// not a raw controller enum) — kept in sync by copy since kiosk doesn't
// otherwise import from the climate module's page components.
const MODE_LABELS = {
  COOL: 'Cool', ENERGY_SAVER: 'Eco', TURBO_COOL: 'Turbo Cool',
  FAN_ONLY: 'Fan Only', DRY: 'Dry',
};
const FAN_LABELS = { AUTO: 'Auto', LOW: 'Low', MED: 'Med', HIGH: 'High' };

const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// Reloads the page once, the first time the clock crosses DAILY_RELOAD_HOUR:00.
// A ref (not state) tracks whether today's reload already fired so this
// doesn't re-trigger every second while the hour matches.
function useDailyReload(now) {
  const firedRef = useRef(false);
  useEffect(() => {
    const atReloadHour = now.getHours() === DAILY_RELOAD_HOUR && now.getMinutes() === 0;
    if (atReloadHour && !firedRef.current) {
      firedRef.current = true;
      window.location.reload();
    } else if (!atReloadHour) {
      firedRef.current = false;
    }
  }, [now]);
}

function fmtClockTime(d) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtDay(iso, isToday) {
  if (isToday) return 'Today';
  return DAY_NAMES[new Date(iso + 'T00:00:00').getDay()];
}

// 1h trend chip: arrow + °F/hr, from a °F delta. Anything under ~0.5°F reads as flat.
function Trend({ deltaF }) {
  if (deltaF == null) return null;
  const rounded = Math.round(deltaF * 10) / 10;
  if (Math.abs(rounded) < 0.5) {
    return (
      <span className="inline-flex items-center gap-1 text-zinc-500 text-base">
        <Minus className="w-4 h-4" /> flat
      </span>
    );
  }
  const up = rounded > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-1 text-base ${up ? 'text-orange-400' : 'text-sky-400'}`}>
      <Icon className="w-4 h-4" /> {Math.abs(rounded).toFixed(1)}°/hr
    </span>
  );
}

// Alternates the display between the climate view and a single full-screen
// photo shown for a while, each entry into photo mode picking a random photo
// (not the same handful in sequence) and a random corner for the time
// overlay. A ref holds the latest photo pool so a background poll refresh
// doesn't restart the whole multi-minute timing loop — only slideCount
// (0 vs not) is a real dependency.
//
// The next photo is picked AND preloaded (a plain `new Image()` fetch, not
// rendered) the moment we land back on the climate view — not at the moment
// we need it — so the whole ~10min climate window is available to fetch a
// full-res photo over a slow connection. By the time the crossfade to photo
// mode actually happens, the browser already has it cached and the swap is
// instant instead of fading in on a still-loading image.
//
// nightModeActive suspends the whole rotation — overnight the display just
// stays on the climate view, no photo takeover. Toggling it (at the 12am/8am
// boundary) naturally restarts this effect, which resumes normal rotation
// from a fresh climate-view timer.
function useScreenRotation(slidePhotos, nightModeActive) {
  const slidesRef = useRef(slidePhotos);
  useEffect(() => { slidesRef.current = slidePhotos; }, [slidePhotos]);

  const [mode, setMode] = useState('climate');
  const [slide, setSlide] = useState(null);
  const [side, setSide] = useState(OVERLAY_SIDES[0]);
  const nextSlideRef = useRef(null);
  const hasSlides = slidePhotos.length > 0;

  useEffect(() => {
    if (!hasSlides || nightModeActive) {
      setMode('climate');
      return;
    }
    let timeoutId;
    let cancelled = false;

    const preloadNext = () => {
      const pool = slidesRef.current;
      if (pool.length === 0) return;
      const next = pickRandom(pool);
      nextSlideRef.current = next;
      const img = new window.Image();
      img.src = next.url;
    };

    const toPhoto = () => {
      if (cancelled) return;
      const next = nextSlideRef.current ?? pickRandom(slidesRef.current);
      setSlide(next);
      setSide(pickRandom(OVERLAY_SIDES));
      setMode('photo');
      timeoutId = setTimeout(toClimate, PHOTO_MIN_MS + Math.random() * (PHOTO_MAX_MS - PHOTO_MIN_MS));
    };
    const toClimate = () => {
      if (cancelled) return;
      setMode('climate');
      preloadNext();
      timeoutId = setTimeout(toPhoto, CLIMATE_MS);
    };

    preloadNext(); // also cover the very first photo shown after page load
    timeoutId = setTimeout(toPhoto, CLIMATE_MS);
    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, [hasSlides, nightModeActive]);

  return { mode, slide, side };
}

// Temporary on-screen debug menu (bottom-right, persists across both screen
// modes) for tuning this thing in place without a keyboard — toggle night
// mode or force a specific screen instead of waiting for the real clock.
// Meant to be pulled once the layout stops needing hands-on iteration.
const THREE_WAY_OPTIONS = [
  { value: null, label: 'Auto' },
];

function DebugMenu({ nightOverride, setNightOverride, modeOverride, setModeOverride }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {open && (
        <div className="mb-3 w-64 rounded-2xl border border-zinc-700 bg-zinc-900/95 backdrop-blur p-4 text-sm shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-zinc-200">Debug controls</span>
            <button onClick={() => setOpen(false)} className="text-zinc-500 hover:text-zinc-300">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mb-3">
            <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1.5">Night mode</div>
            <div className="flex gap-1.5">
              {[...THREE_WAY_OPTIONS, { value: false, label: 'Day' }, { value: true, label: 'Night' }].map((opt) => (
                <button
                  key={String(opt.value)}
                  onClick={() => setNightOverride(opt.value)}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                    nightOverride === opt.value ? 'bg-cyan-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1.5">Screen</div>
            <div className="flex gap-1.5">
              {[...THREE_WAY_OPTIONS, { value: 'climate', label: 'Dash' }, { value: 'photo', label: 'Slideshow' }].map((opt) => (
                <button
                  key={String(opt.value)}
                  onClick={() => setModeOverride(opt.value)}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                    modeOverride === opt.value ? 'bg-cyan-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-full border border-zinc-700 bg-zinc-900/80 backdrop-blur p-3 text-zinc-400 hover:text-zinc-200 shadow-lg"
      >
        <Settings className="w-5 h-5" />
      </button>
    </div>
  );
}

export default function Kiosk() {
  const { sensors, weather, outdoorSensor, ac, lastRefresh, loading } = useKioskData();
  const { photos: backgroundPhotos } = usePhotoAlbum('backgrounds');
  const { photos: slidePhotos } = usePhotoAlbum('slideshow');
  const now = useClock();
  // Overnight mode: 12am-8am specifically (not a dusk/dawn approximation) —
  // warm color grade, no background photo, no slideshow takeover.
  const computedIsNight = now.getHours() < 8;
  useDailyReload(now);

  // Debug menu overrides (temporary, see DebugMenu above). null = auto/real.
  const [nightOverride, setNightOverride] = useState(null);
  const [modeOverride, setModeOverride] = useState(null);
  const isNight = nightOverride ?? computedIsNight;

  // Prefer the real outdoor sensor (Govee) when fresh; Open-Meteo's *current*
  // reading is only shown as a fallback. The forecast strip always comes from
  // Open-Meteo regardless, since there's no physical sensor for the future.
  const outdoorTempF = outdoorSensor?.tempF ?? weather?.tempF ?? null;
  const outdoorDeltaF = outdoorSensor?.deltaF ?? null;
  const outdoorIsReal = outdoorSensor != null;
  const outdoorHumidity = outdoorSensor?.humidity ?? weather?.humidity ?? null;

  // For the slideshow overlay's compact climate readout.
  const livingSensor = sensors.find((s) => /living/i.test(s.label));
  const livingTempF = livingSensor?.tempC != null ? livingSensor.tempC * 9 / 5 + 32 : null;

  const { mode, slide, side } = useScreenRotation(slidePhotos, isNight);

  // Debug menu forcing "Slideshow" before the rotation hook has ever picked a
  // real slide (e.g. testing right after page load) needs something to
  // actually show — fall back to a one-off random pick in that case only.
  const [manualSlide, setManualSlide] = useState(null);
  const handleSetModeOverride = (val) => {
    if (val === 'photo' && !slide && slidePhotos.length > 0) setManualSlide(pickRandom(slidePhotos));
    setModeOverride(val);
  };
  const effectiveMode = modeOverride ?? mode;
  const effectiveSlide = effectiveMode === 'photo' ? (slide ?? manualSlide) : slide;

  // Only ever swap the background while the climate view is hidden (photo
  // mode) and at most once an hour, so the change is never actually seen
  // happening — the next time the dashboard comes back up, it's just already
  // different. The very first pick (once photos actually load) is random
  // too, so a fresh page load doesn't always start on the same photo.
  const [bgIdx, setBgIdx] = useState(0);
  const lastBgChangeRef = useRef(Date.now());
  const bgInitializedRef = useRef(false);
  useEffect(() => {
    if (backgroundPhotos.length === 0) return;
    if (!bgInitializedRef.current) {
      bgInitializedRef.current = true;
      setBgIdx(Math.floor(Math.random() * backgroundPhotos.length));
      return;
    }
    if (mode !== 'photo') return;
    if (Date.now() - lastBgChangeRef.current < BACKGROUND_MIN_INTERVAL_MS) return;
    setBgIdx((i) => (i + 1) % backgroundPhotos.length);
    lastBgChangeRef.current = Date.now();
  }, [mode, backgroundPhotos.length]);

  const bgPhoto = backgroundPhotos[bgIdx];
  const showPhoto = effectiveMode === 'photo' && effectiveSlide;

  return (
    <div className="h-screen bg-zinc-950 text-zinc-100 relative overflow-hidden select-none">
      {/* Photo-takeover layer — always mounted so the mode switch crossfades
          instead of hard-cutting. */}
      <div
        className="absolute inset-0 bg-black transition-opacity ease-in-out z-10"
        style={{ transitionDuration: `${FADE_MS}ms`, opacity: showPhoto ? 1 : 0, pointerEvents: showPhoto ? 'auto' : 'none' }}
      >
        {effectiveSlide && (
          <>
            <img src={effectiveSlide.url} alt="" className="w-full h-screen object-cover" />

            {/* Gradient scrims instead of small boxed backgrounds — legible
                against arbitrary photo content (bright sky, high-contrast
                scenes) without needing a hard-edged panel over the image. */}
            <div className="absolute top-0 inset-x-0 h-56 bg-gradient-to-b from-black/65 to-transparent pointer-events-none" />
            <div className="absolute bottom-0 inset-x-0 h-56 bg-gradient-to-t from-black/65 to-transparent pointer-events-none" />

            {/* Clock is the only persistent info in this mode — sized at
                least as large as the dashboard clock, arguably larger. */}
            <div className={`absolute top-8 ${side === 'left' ? 'left-10' : 'right-10 text-right'} text-white drop-shadow-lg`}>
              <div style={{ fontSize: 'clamp(3.5rem, 7vw, 6.5rem)' }} className="font-light leading-none tabular-nums">{fmtClockTime(now)}</div>
              <div className="text-2xl text-zinc-200 mt-2">
                {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
              </div>
            </div>

            <div
              className={`absolute bottom-8 ${OPPOSITE_SIDE[side] === 'left' ? 'left-10' : 'right-10 flex-row-reverse text-right'} text-white drop-shadow-lg flex items-center gap-4`}
            >
              {(() => {
                const Icon = weatherIconFor(weather?.code, isNight);
                return <Icon className="w-12 h-12 text-sky-300 shrink-0" strokeWidth={1.5} />;
              })()}
              <div style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)' }} className="leading-snug tabular-nums">
                <div>Living {livingTempF != null ? `${Math.round(livingTempF)}°` : '—'}</div>
                <div>Outdoor {outdoorTempF != null ? `${Math.round(outdoorTempF)}°` : '—'}</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Climate layer — h-full + overflow-hidden (not min-h-screen) so
          content is forced to fit one screen; a kiosk panel has no scrollbar
          to reveal anything that runs past the bottom edge. */}
      <div
        className="flex flex-col h-full p-8 overflow-hidden transition-opacity ease-in-out"
        style={{ transitionDuration: `${FADE_MS}ms`, opacity: showPhoto ? 0 : 1 }}
      >
        {/* No background photo overnight — just the plain dark base, warmed
            by the filter below. */}
        {bgPhoto && !isNight && (
          <>
            {/* Blurred + dimmed (not sharp like photo mode) — a busy photo
                behind translucent cards was fighting the content; scale(1.05)
                keeps the blur from revealing edge artifacts. */}
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${bgPhoto.url})`, filter: 'blur(8px) brightness(0.5)', transform: 'scale(1.05)' }}
            />
            <div className="absolute inset-0 bg-zinc-950/75" />
          </>
        )}
        {/* Night mode (12am-8am): warm/red color grade via CSS filter — shifts
            every color uniformly (text, icons, dots) toward amber/red and dims
            it, without needing a separate warm-toned copy of every element's
            color classes. sepia+hue-rotate does the warming, brightness dims
            for a dark room, contrast keeps text from washing out. */}
        <div
          className="relative flex flex-col flex-1 min-h-0 transition-[filter] duration-1000"
          style={{ filter: isNight ? 'sepia(0.55) saturate(1.7) hue-rotate(-15deg) brightness(0.45) contrast(1.1)' : 'none' }}
        >
          {/* Header: clock + date on the left — from 9-13ft this is one of the
              only things that needs to read at a glance, but not so large it
              eats the room the temp grid needs. AC status sits opposite in
              its own card (previously height-matched to the date line with
              no card at all — traded that constraint for actually being
              legible and wrap-safe; it's taller now, by design). */}
          <div className="flex items-start justify-between shrink-0">
            <div>
              <div style={{ fontSize: 'clamp(3rem, 7vw, 5.5rem)' }} className="font-light leading-none tracking-tight tabular-nums">
                {fmtClockTime(now)}
              </div>
              <div className="text-lg md:text-xl text-zinc-400 mt-1">
                {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
              </div>
            </div>
            {ac && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 px-5 py-3 text-right max-w-xs shrink-0" title={ac.stateLabel}>
                <div className="flex items-center justify-end gap-2">
                  <span className="h-4 w-4 rounded-full shrink-0" style={{ background: AC_STATE_COLOR[ac.stateLabel] ?? '#a1a1aa' }} />
                  <Snowflake className="w-6 h-6 text-cyan-400 shrink-0" />
                </div>
                {/* Stacked, one value per line — never lets a " · " separator
                    land at a wrap boundary the way a single joined string
                    could. Raw controller enums (ENERGY_SAVER, etc.) are
                    mapped to display names, never shown as-is. */}
                {ac.setting && (
                  <div className="mt-1">
                    <div style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.75rem)' }} className="font-bold tabular-nums leading-none text-zinc-100">
                      {ac.setting.power === false ? 'Off' : ac.setting.setpointF != null ? `${ac.setting.setpointF}°` : '—'}
                    </div>
                    {ac.setting.power !== false && (ac.setting.mode || ac.setting.fan) && (
                      <div className="text-lg text-zinc-300 mt-0.5">
                        {ac.setting.mode && (MODE_LABELS[ac.setting.mode] ?? ac.setting.mode)}
                        {ac.setting.mode && ac.setting.fan && <span className="text-zinc-600"> · </span>}
                        {ac.setting.fan && `Fan ${FAN_LABELS[ac.setting.fan] ?? ac.setting.fan}`}
                      </div>
                    )}
                  </div>
                )}
                {ac.lastLog?.reason && (
                  <p className="mt-1.5 text-sm text-zinc-500 line-clamp-2">{ac.lastLog.reason}</p>
                )}
              </div>
            )}
          </div>

          {/* Two-column body: giant per-room temps on the left (also meant to
              read across the room), finer-grained weather/AC detail on the
              right — that right column has room to alternate to other content
              later without touching the left side. */}
          <div className="mt-6 flex-1 min-h-0 grid gap-6" style={{ gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)' }}>
            {/* Left: giant temp grid */}
            <div className="grid grid-cols-2 gap-4 content-start">
              {loading && sensors.length === 0 && (
                <div className="col-span-full flex items-center gap-2 text-zinc-500 text-2xl">
                  <LoaderCircle className="w-6 h-6 animate-spin" /> Loading sensors…
                </div>
              )}
              {!loading && sensors.length === 0 && (
                <div className="col-span-full text-zinc-500 text-2xl">No sensors found.</div>
              )}
              {sensors.map((s, i) => {
                const stale = s.ts && Date.now() - new Date(s.ts).getTime() > 10 * 60 * 1000;
                const deltaF = s.deltaC != null ? s.deltaC * 9 / 5 : null;
                const color = PALETTE[i % PALETTE.length];
                return (
                  <div key={s.mac} className="rounded-2xl border border-zinc-800 bg-zinc-900/80 px-5 py-4">
                    <div className="flex items-center gap-2.5 mb-1 min-w-0">
                      <span className="h-3.5 w-3.5 rounded-full shrink-0" style={{ background: color }} />
                      <span className="text-2xl font-semibold text-zinc-100 truncate">{s.label}</span>
                    </div>
                    <div className="flex items-baseline gap-2.5">
                      <div
                        style={{ fontSize: 'clamp(3.25rem, 6.5vw, 5.75rem)' }}
                        className={`font-bold tabular-nums leading-none ${stale ? 'text-zinc-600' : 'text-zinc-100'}`}
                      >
                        {s.tempC != null ? `${Math.round(s.tempC * 9 / 5 + 32)}°` : '—'}
                      </div>
                      {s.humidity != null && (
                        <span className="flex items-center gap-1 text-3xl text-zinc-400 tabular-nums">
                          <Droplets className="w-6 h-6 text-sky-400" /> {Math.round(s.humidity)}%
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-sm text-zinc-500">
                      <Trend deltaF={deltaF} />
                      <span className={`ml-auto ${stale ? 'text-amber-400' : ''}`}>
                        {s.ts ? timeAgo(s.ts) : 'no data'}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Outdoor tile — real sensor when fresh, Open-Meteo current reading otherwise */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 px-5 py-4">
                <div className="flex items-center gap-2.5 mb-1" title={outdoorIsReal ? 'Real outdoor sensor' : 'Forecast (no fresh sensor reading)'}>
                  <span className="h-3.5 w-3.5 rounded-full shrink-0" style={{ background: outdoorIsReal ? '#34d399' : '#71717a' }} />
                  <span className="text-2xl font-semibold text-zinc-100">Outdoor</span>
                </div>
                <div className="flex items-baseline gap-2.5">
                  <div
                    style={{ fontSize: 'clamp(3.25rem, 6.5vw, 5.75rem)' }}
                    className="font-bold tabular-nums leading-none text-zinc-100"
                  >
                    {outdoorTempF != null ? `${Math.round(outdoorTempF)}°` : '—'}
                  </div>
                  {outdoorHumidity != null && (
                    <span className="flex items-center gap-1 text-3xl text-zinc-400 tabular-nums">
                      <Droplets className="w-6 h-6 text-sky-400" /> {Math.round(outdoorHumidity)}%
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-3 text-sm text-zinc-500">
                  <Trend deltaF={outdoorDeltaF} />
                  <span>Feels {weather?.feelsLikeF != null ? `${Math.round(weather.feelsLikeF)}°` : '—'}</span>
                  <span className="ml-auto">
                    {outdoorSensor?.at ? timeAgo(outdoorSensor.at) : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: forecast only now — current weather merged into the
                Outdoor tile, AC status moved to the header. Days and hour-
                buckets both run as matching 3-column spreads (the days: the
                next 3 days; the buckets: next hour / next 1-6h / next 6-12h,
                each summarized like a weather-station display) — this whole
                column still has room to alternate to other content later. */}
            <div className="flex flex-col min-h-0">
              {(weather?.hourlyBuckets?.length > 0 || weather?.daily?.length > 0) && (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 px-6 py-5 flex-1 min-h-0 flex flex-col justify-evenly overflow-hidden">
                  {weather?.daily?.length > 0 && (
                    <div className="grid grid-cols-3 gap-3 shrink-0">
                      {weather.daily.map((d, i) => {
                        const Icon = weatherIconFor(d.code);
                        return (
                          <div key={d.date} className="flex flex-col items-center gap-1 text-center">
                            <div className="text-2xl font-medium text-zinc-300">{fmtDay(d.date, i === 0)}</div>
                            <Icon className="w-12 h-12 text-sky-400/80" strokeWidth={1.5} />
                            <div className="text-2xl text-zinc-100 tabular-nums">{d.maxF != null ? Math.round(d.maxF) : '—'}°</div>
                            <div className="text-lg text-zinc-500 tabular-nums">{d.minF != null ? Math.round(d.minF) : '—'}°</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {weather?.hourlyBuckets?.length > 0 && (
                    <div className="mt-5 pt-4 border-t border-zinc-800 grid grid-cols-3 gap-3 flex-1 min-h-0">
                      {weather.hourlyBuckets.map((b) => {
                        const Icon = weatherIconFor(b.code);
                        return (
                          <div key={b.label} className="flex flex-col items-center gap-1 text-center">
                            <div className="text-base font-medium text-zinc-300">{b.label}</div>
                            <Icon className="w-8 h-8 text-sky-400/80" strokeWidth={1.5} />
                            <div className="text-lg text-zinc-100 tabular-nums">
                              {b.maxF != null ? Math.round(b.maxF) : '—'}° / {b.minF != null ? Math.round(b.minF) : '—'}°
                            </div>
                            {b.precipProb != null && (
                              <div className="text-base text-sky-300 tabular-nums">{Math.round(b.precipProb)}% rain</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 text-sm text-zinc-600 shrink-0">
            {lastRefresh ? `Updated ${timeAgo(lastRefresh.toISOString())}` : ''}
          </div>
        </div>
      </div>

      <DebugMenu
        nightOverride={nightOverride}
        setNightOverride={setNightOverride}
        modeOverride={modeOverride}
        setModeOverride={handleSetModeOverride}
      />
    </div>
  );
}
