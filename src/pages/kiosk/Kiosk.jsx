import { useState, useEffect, useRef } from 'react';
import { Droplets, LoaderCircle, ArrowUp, ArrowDown, Minus, Snowflake } from 'lucide-react';
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
const OVERLAY_CORNERS = ['top-8 left-8', 'top-8 right-8', 'bottom-8 left-8', 'bottom-8 right-8'];
const OPPOSITE_CORNER = {
  'top-8 left-8': 'bottom-8 right-8',
  'top-8 right-8': 'bottom-8 left-8',
  'bottom-8 left-8': 'top-8 right-8',
  'bottom-8 right-8': 'top-8 left-8',
};
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
  const [corner, setCorner] = useState(OVERLAY_CORNERS[0]);
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
      setCorner(pickRandom(OVERLAY_CORNERS));
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

  return { mode, slide, corner };
}

export default function Kiosk() {
  const { sensors, weather, outdoorSensor, ac, lastRefresh, loading } = useKioskData();
  const { photos: backgroundPhotos } = usePhotoAlbum('backgrounds');
  const { photos: slidePhotos } = usePhotoAlbum('slideshow');
  const now = useClock();
  // Overnight mode: 12am-8am specifically (not a dusk/dawn approximation) —
  // warm color grade, no background photo, no slideshow takeover.
  const isNight = now.getHours() < 8;
  useDailyReload(now);

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

  const { mode, slide, corner } = useScreenRotation(slidePhotos, isNight);

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
  const showPhoto = mode === 'photo' && slide;

  return (
    <div className="h-screen bg-zinc-950 text-zinc-100 relative overflow-hidden select-none">
      {/* Photo-takeover layer — always mounted so the mode switch crossfades
          instead of hard-cutting. */}
      <div
        className="absolute inset-0 bg-black transition-opacity ease-in-out z-10"
        style={{ transitionDuration: `${FADE_MS}ms`, opacity: showPhoto ? 1 : 0, pointerEvents: showPhoto ? 'auto' : 'none' }}
      >
        {slide && (
          <>
            <img src={slide.url} alt="" className="w-full h-screen object-contain" />
            <div className={`absolute ${corner} text-white drop-shadow-lg bg-black/30 rounded-xl px-6 py-4`}>
              <div style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)' }} className="font-light leading-none">{fmtClockTime(now)}</div>
              <div className="text-xl text-zinc-300 mt-1.5">
                {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
              </div>
            </div>
            <div className={`absolute ${OPPOSITE_CORNER[corner]} text-white drop-shadow-lg bg-black/30 rounded-xl px-6 py-4 flex items-center gap-4`}>
              {(() => {
                const Icon = weatherIconFor(weather?.code, isNight);
                return <Icon className="w-12 h-12 text-sky-300" strokeWidth={1.5} />;
              })()}
              <div style={{ fontSize: 'clamp(1.5rem, 3vw, 2.25rem)' }} className="leading-snug">
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
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${bgPhoto.url})` }}
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
              eats the room the temp grid needs. AC status sits opposite,
              height-matched so it never runs past the date line. */}
          <div className="flex items-start justify-between shrink-0">
            <div>
              <div style={{ fontSize: 'clamp(3rem, 7vw, 5.5rem)' }} className="font-light leading-none tracking-tight">
                {fmtClockTime(now)}
              </div>
              <div className="text-lg md:text-xl text-zinc-400 mt-1">
                {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
              </div>
            </div>
            {ac && (
              <div className="text-right max-w-sm" title={ac.stateLabel}>
                <div className="flex items-center justify-end gap-2.5">
                  <span className="h-5 w-5 rounded-full shrink-0" style={{ background: AC_STATE_COLOR[ac.stateLabel] ?? '#a1a1aa' }} />
                  <Snowflake className="w-9 h-9 text-cyan-400 shrink-0" />
                  {ac.settingLine && (
                    <span style={{ fontSize: 'clamp(1.75rem, 3.5vw, 3rem)' }} className="font-semibold text-zinc-100 leading-none">
                      {ac.settingLine}
                    </span>
                  )}
                </div>
                {ac.lastLog?.reason && (
                  <p className="mt-1.5 text-sm text-zinc-500 truncate">{ac.lastLog.reason}</p>
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
                  <div key={s.mac} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 px-5 py-4">
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
                        <span className="flex items-center gap-1 text-3xl text-zinc-400">
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
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 px-5 py-4">
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
                    <span className="flex items-center gap-1 text-3xl text-zinc-400">
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
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 px-6 py-5 flex-1 min-h-0 flex flex-col overflow-hidden">
                  {weather?.daily?.length > 0 && (
                    <div className="grid grid-cols-3 gap-3 shrink-0">
                      {weather.daily.map((d, i) => {
                        const Icon = weatherIconFor(d.code);
                        return (
                          <div key={d.date} className="flex flex-col items-center gap-1 text-center">
                            <div className="text-xl font-medium text-zinc-300">{fmtDay(d.date, i === 0)}</div>
                            <Icon className="w-12 h-12 text-sky-400/80" strokeWidth={1.5} />
                            <div className="text-2xl text-zinc-100">{d.maxF != null ? Math.round(d.maxF) : '—'}°</div>
                            <div className="text-lg text-zinc-500">{d.minF != null ? Math.round(d.minF) : '—'}°</div>
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
                            <div className="text-sm font-medium text-zinc-400">{b.label}</div>
                            <Icon className="w-8 h-8 text-sky-400/80" strokeWidth={1.5} />
                            <div className="text-lg text-zinc-100">
                              {b.maxF != null ? Math.round(b.maxF) : '—'}° / {b.minF != null ? Math.round(b.minF) : '—'}°
                            </div>
                            {b.precipProb != null && (
                              <div className="text-sm text-sky-400/80">{Math.round(b.precipProb)}% rain</div>
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
    </div>
  );
}
