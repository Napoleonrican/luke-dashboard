import { useState, useEffect, useRef } from 'react';
import { Droplets, LoaderCircle, ArrowUp, ArrowDown, Minus, Cloud, Snowflake } from 'lucide-react';
import { useKioskData } from './useKioskData';
import { usePhotoAlbum } from './usePhotoAlbum';
import { weatherIconFor } from './weatherIcons';
import { timeAgo, PALETTE, APARTMENT_COORDS } from '../climate/useClimateData';

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
// Kiosk devices sit powered on for weeks — a full reload once a day (off
// hours) resets memory/JS state and picks up any new deploy, cheap insurance
// against slow leaks rather than a sign anything's actually wrong.
const DAILY_RELOAD_HOUR = 4;

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

function fmtHour(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric' });
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
function useScreenRotation(slidePhotos) {
  const slidesRef = useRef(slidePhotos);
  useEffect(() => { slidesRef.current = slidePhotos; }, [slidePhotos]);

  const [mode, setMode] = useState('climate');
  const [slide, setSlide] = useState(null);
  const [corner, setCorner] = useState(OVERLAY_CORNERS[0]);
  const hasSlides = slidePhotos.length > 0;

  useEffect(() => {
    if (!hasSlides) return;
    let timeoutId;
    let cancelled = false;

    const toPhoto = () => {
      if (cancelled) return;
      const pool = slidesRef.current;
      if (pool.length > 0) {
        setSlide(pickRandom(pool));
        setCorner(pickRandom(OVERLAY_CORNERS));
        setMode('photo');
      }
      timeoutId = setTimeout(toClimate, PHOTO_MIN_MS + Math.random() * (PHOTO_MAX_MS - PHOTO_MIN_MS));
    };
    const toClimate = () => {
      if (cancelled) return;
      setMode('climate');
      timeoutId = setTimeout(toPhoto, CLIMATE_MS);
    };

    timeoutId = setTimeout(toPhoto, CLIMATE_MS);
    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, [hasSlides]);

  return { mode, slide, corner };
}

export default function Kiosk() {
  const { sensors, weather, outdoorSensor, ac, lastRefresh, loading } = useKioskData();
  const { photos: backgroundPhotos } = usePhotoAlbum('backgrounds');
  const { photos: slidePhotos } = usePhotoAlbum('slideshow');
  const now = useClock();
  const isNight = now.getHours() < 6 || now.getHours() >= 20;
  useDailyReload(now);

  // Prefer the real outdoor sensor (Govee) when fresh; Open-Meteo's *current*
  // reading is only shown as a fallback. The forecast strip always comes from
  // Open-Meteo regardless, since there's no physical sensor for the future.
  const outdoorTempF = outdoorSensor?.tempF ?? weather?.tempF ?? null;
  const outdoorDeltaF = outdoorSensor?.deltaF ?? null;
  const outdoorIsReal = outdoorSensor != null;

  const { mode, slide, corner } = useScreenRotation(slidePhotos);

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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 relative overflow-hidden select-none">
      {/* Photo-takeover layer — always mounted so the mode switch crossfades
          instead of hard-cutting. */}
      <div
        className="absolute inset-0 bg-black transition-opacity ease-in-out z-10"
        style={{ transitionDuration: `${FADE_MS}ms`, opacity: showPhoto ? 1 : 0, pointerEvents: showPhoto ? 'auto' : 'none' }}
      >
        {slide && (
          <>
            <img src={slide.url} alt="" className="w-full h-screen object-contain" />
            <div className={`absolute ${corner} text-white text-3xl font-light drop-shadow-lg bg-black/30 rounded-xl px-5 py-3`}>
              {fmtClockTime(now)}
            </div>
          </>
        )}
      </div>

      {/* Climate layer */}
      <div
        className="flex flex-col p-10 min-h-screen transition-opacity ease-in-out"
        style={{ transitionDuration: `${FADE_MS}ms`, opacity: showPhoto ? 0 : 1 }}
      >
        {bgPhoto && (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${bgPhoto.url})` }}
            />
            <div className={`absolute inset-0 transition-colors duration-1000 ${isNight ? 'bg-zinc-950/90' : 'bg-zinc-950/75'}`} />
          </>
        )}
        {/* Night mode (v1): dim the whole readout uniformly rather than a bright
            wall-of-light in a dark room. Worth revisiting later (redder tones,
            a stripped-down clock-only screen, etc.) but this is a real first pass. */}
        <div
          className="relative flex flex-col flex-1 transition-[filter] duration-1000"
          style={{ filter: isNight ? 'brightness(0.55)' : 'none' }}
        >
          {/* Header: huge clock + date — from 9-13ft this is one of the only
              things that needs to read at a glance */}
          <div style={{ fontSize: 'clamp(5rem, 13vw, 11rem)' }} className="font-light leading-none tracking-tight">
            {fmtClockTime(now)}
          </div>
          <div className="text-2xl md:text-3xl text-zinc-400 mt-2">
            {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>

          {/* Two-column body: giant per-room temps on the left (also meant to
              read across the room), finer-grained weather/AC detail on the
              right — that right column has room to alternate to other content
              later without touching the left side. */}
          <div className="mt-10 flex-1 grid gap-10" style={{ gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)' }}>
            {/* Left: giant temp grid */}
            <div className="grid grid-cols-2 gap-5 content-start">
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
                  <div key={s.mac} className="rounded-2xl border border-zinc-800 bg-zinc-900 px-6 py-5">
                    <div className="flex items-center gap-2.5 mb-1 min-w-0">
                      <span className="h-3.5 w-3.5 rounded-full shrink-0" style={{ background: color }} />
                      <span className="text-2xl font-semibold text-zinc-100 truncate">{s.label}</span>
                    </div>
                    <div
                      style={{ fontSize: 'clamp(3.5rem, 6.5vw, 6.5rem)' }}
                      className={`font-bold tabular-nums leading-none ${stale ? 'text-zinc-600' : 'text-zinc-100'}`}
                    >
                      {s.tempC != null ? `${Math.round(s.tempC * 9 / 5 + 32)}°` : '—'}
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-sm text-zinc-500">
                      {s.humidity != null && (
                        <span className="flex items-center gap-1">
                          <Droplets className="w-3.5 h-3.5 text-sky-400" /> {Math.round(s.humidity)}%
                        </span>
                      )}
                      <Trend deltaF={deltaF} />
                      <span className={`ml-auto ${stale ? 'text-amber-400' : ''}`}>
                        {s.ts ? timeAgo(s.ts) : 'no data'}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Outdoor tile — real sensor when fresh, Open-Meteo current reading otherwise */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-6 py-5">
                <div className="flex items-center gap-2.5 mb-1">
                  <Cloud className="w-5 h-5 text-sky-400 shrink-0" />
                  <span className="text-2xl font-semibold text-zinc-100">Outdoor</span>
                </div>
                <div
                  style={{ fontSize: 'clamp(3.5rem, 6.5vw, 6.5rem)' }}
                  className="font-bold tabular-nums leading-none text-zinc-100"
                >
                  {outdoorTempF != null ? `${Math.round(outdoorTempF)}°` : '—'}
                </div>
                <div className="mt-2 flex items-center gap-3 text-sm text-zinc-500">
                  <span className={outdoorIsReal ? 'text-emerald-400' : ''}>
                    {outdoorIsReal ? 'Sensor' : 'Forecast'}
                  </span>
                  <Trend deltaF={outdoorDeltaF} />
                  <span className="ml-auto">
                    {outdoorSensor?.at ? timeAgo(outdoorSensor.at) : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: finer detail — current weather, AC status, forecast.
                Small on purpose: legible up close, not meant to compete with
                the left column for across-the-room reading. */}
            <div className="flex flex-col gap-4">
              {weather && (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-6 py-5">
                  <div className="flex items-center gap-3">
                    {(() => {
                      const Icon = weatherIconFor(weather?.code, isNight);
                      return <Icon className="w-8 h-8 text-sky-400" strokeWidth={1.5} />;
                    })()}
                    <span className="text-2xl font-semibold text-zinc-100">{APARTMENT_COORDS.label}</span>
                  </div>
                  <div className="mt-1 text-base text-zinc-400">
                    Feels {weather.feelsLikeF != null ? `${Math.round(weather.feelsLikeF)}°` : '—'}
                    {weather.humidity != null && ` · ${Math.round(weather.humidity)}% humidity`}
                  </div>
                </div>
              )}

              {/* AC status — brief, mirrors the Home hub's ClimateRail framing */}
              {ac && (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-6 py-5">
                  <div className="flex items-center gap-2">
                    <Snowflake className="w-5 h-5 text-cyan-400" />
                    <span className="text-lg font-semibold text-zinc-100">{ac.stateLabel}</span>
                  </div>
                  {ac.settingLine && <p className="mt-1 text-base text-zinc-400">Set to {ac.settingLine}</p>}
                  {ac.lastLog?.reason && (
                    <p className="mt-1.5 text-sm text-zinc-500 line-clamp-2">
                      {ac.lastLog.reason} <span className="text-zinc-700">· {timeAgo(ac.lastLog.ts)}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Forecast */}
              {(weather?.hourly?.length > 0 || weather?.daily?.length > 0) && (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-6 py-5">
                  {weather?.hourly?.length > 0 && (
                    <div className="flex gap-5 overflow-x-auto">
                      {weather.hourly.map((h) => {
                        const Icon = weatherIconFor(h.code);
                        return (
                          <div key={h.time} className="flex flex-col items-center gap-1 min-w-[52px]">
                            <div className="text-xs text-zinc-500">{fmtHour(h.time)}</div>
                            <Icon className="w-6 h-6 text-sky-400/80" strokeWidth={1.5} />
                            <div className="text-sm">{h.tempF != null ? `${Math.round(h.tempF)}°` : '—'}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {weather?.daily?.length > 0 && (
                    <div className="mt-4 flex flex-col gap-2 border-t border-zinc-800 pt-3">
                      {weather.daily.map((d, i) => {
                        const Icon = weatherIconFor(d.code);
                        return (
                          <div key={d.date} className="flex items-center gap-3 text-sm">
                            <div className="text-zinc-400 w-12">{fmtDay(d.date, i === 0)}</div>
                            <Icon className="w-5 h-5 text-sky-400/70" strokeWidth={1.5} />
                            <div className="text-zinc-100 ml-auto">{d.maxF != null ? Math.round(d.maxF) : '—'}°</div>
                            <div className="text-zinc-500">{d.minF != null ? Math.round(d.minF) : '—'}°</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 text-sm text-zinc-600">
            {lastRefresh ? `Updated ${timeAgo(lastRefresh.toISOString())}` : ''}
          </div>
        </div>
      </div>
    </div>
  );
}
