import { useState, useEffect, useRef } from 'react';
import { Droplets, LoaderCircle, ArrowUp, ArrowDown, Minus, Thermometer, Cloud } from 'lucide-react';
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
const CLIMATE_MS = 45_000;          // how long the climate view stays up
const PHOTO_SLIDE_MS = 8_000;       // how long each slideshow photo shows
const PHOTOS_PER_TAKEOVER = 4;      // how many photos per photo-mode stretch
const BACKGROUND_ROTATE_MS = 5 * 60_000;

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
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

// Alternates the display between the climate view and a full-screen photo
// takeover. A ref (not state) tracks the slide index inside the timeout loop
// so the effect doesn't need to re-run — and re-subscribe — on every photo.
function useScreenRotation(slideCount) {
  const [mode, setMode] = useState('climate');
  const [slideIdx, setSlideIdx] = useState(0);
  const slideIdxRef = useRef(0);

  useEffect(() => {
    if (slideCount === 0) return; // nothing to show, stay on climate view
    let timeoutId;
    let cancelled = false;

    const scheduleNext = (nextMode, delay) => {
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        if (nextMode === 'photo') {
          slideIdxRef.current = 0;
          setSlideIdx(0);
          setMode('photo');
          scheduleNext('advance', PHOTO_SLIDE_MS);
        } else if (nextMode === 'advance') {
          const next = slideIdxRef.current + 1;
          if (next >= Math.min(PHOTOS_PER_TAKEOVER, slideCount)) {
            setMode('climate');
            scheduleNext('photo', CLIMATE_MS);
          } else {
            slideIdxRef.current = next;
            setSlideIdx(next);
            scheduleNext('advance', PHOTO_SLIDE_MS);
          }
        }
      }, delay);
    };

    scheduleNext('photo', CLIMATE_MS);
    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, [slideCount]);

  return { mode, slideIdx };
}

export default function Kiosk() {
  const { sensors, weather, outdoorSensor, lastRefresh, loading } = useKioskData();
  const { photos: backgroundPhotos } = usePhotoAlbum('backgrounds');
  const { photos: slidePhotos } = usePhotoAlbum('slideshow');
  const now = useClock();
  const isNight = now.getHours() < 6 || now.getHours() >= 20;

  // Prefer the real outdoor sensor (Govee) when fresh; Open-Meteo's *current*
  // reading is only shown as a fallback. The forecast strip always comes from
  // Open-Meteo regardless, since there's no physical sensor for the future.
  const outdoorTempF = outdoorSensor?.tempF ?? weather?.tempF ?? null;
  const outdoorDeltaF = outdoorSensor?.deltaF ?? null;
  const outdoorIsReal = outdoorSensor != null;

  const { mode, slideIdx } = useScreenRotation(slidePhotos.length);

  const [bgIdx, setBgIdx] = useState(0);
  useEffect(() => {
    if (backgroundPhotos.length === 0) return;
    const id = setInterval(() => setBgIdx((i) => (i + 1) % backgroundPhotos.length), BACKGROUND_ROTATE_MS);
    return () => clearInterval(id);
  }, [backgroundPhotos.length]);

  if (mode === 'photo' && slidePhotos[slideIdx]) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center select-none">
        <img
          src={slidePhotos[slideIdx].url}
          alt=""
          className="w-full h-screen object-contain"
        />
      </div>
    );
  }

  const bgPhoto = backgroundPhotos[bgIdx];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col p-8 select-none relative">
      {bgPhoto && (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${bgPhoto.url})` }}
          />
          <div className="absolute inset-0 bg-zinc-950/75" />
        </>
      )}
      <div className="relative flex flex-col flex-1">
      {/* Header: clock + date */}
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-7xl font-light tracking-tight">{fmtClockTime(now)}</div>
          <div className="text-xl text-zinc-400 mt-1">
            {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
        </div>
      </div>

      {/* Sensor tiles + outdoor — same card language as Climate Overview */}
      <div className="mt-8 grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {loading && sensors.length === 0 && (
          <div className="col-span-full flex items-center gap-2 text-zinc-500 text-lg">
            <LoaderCircle className="w-5 h-5 animate-spin" /> Loading sensors…
          </div>
        )}
        {!loading && sensors.length === 0 && (
          <div className="col-span-full text-zinc-500 text-lg">No sensors found.</div>
        )}
        {sensors.map((s, i) => {
          const stale = s.ts && Date.now() - new Date(s.ts).getTime() > 10 * 60 * 1000;
          const deltaF = s.deltaC != null ? s.deltaC * 9 / 5 : null;
          const color = PALETTE[i % PALETTE.length];
          return (
            <div key={s.mac} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <div className="flex items-center gap-2 mb-3 min-w-0">
                <span className="h-3 w-3 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-lg font-semibold text-zinc-100 truncate">{s.label}</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <Thermometer className="w-6 h-6 text-zinc-500" />
                <span className={`text-5xl font-bold tabular-nums ${stale ? 'text-zinc-600' : 'text-zinc-100'}`}>
                  {s.tempC != null ? `${Math.round(s.tempC * 9 / 5 + 32)}°` : '—'}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-4 text-base text-zinc-400">
                {s.humidity != null && (
                  <span className="flex items-center gap-1">
                    <Droplets className="w-4 h-4 text-sky-400" /> {Math.round(s.humidity)}%
                  </span>
                )}
                <Trend deltaF={deltaF} />
                <span className={`ml-auto ${stale ? 'text-amber-400' : 'text-zinc-600'}`}>
                  {s.ts ? timeAgo(s.ts) : 'no data'}
                </span>
              </div>
            </div>
          );
        })}

        {/* Outdoor tile — real sensor when fresh, Open-Meteo current reading otherwise */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="flex items-center gap-2 mb-3">
            <Cloud className="w-4 h-4 text-sky-400" />
            <span className="text-lg font-semibold text-zinc-100">Outdoor</span>
            <span className="text-sm text-zinc-500 truncate">· {APARTMENT_COORDS.label}</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            {(() => {
              const Icon = weatherIconFor(weather?.code, isNight);
              return <Icon className="w-6 h-6 text-sky-400" strokeWidth={1.5} />;
            })()}
            <span className="text-5xl font-bold tabular-nums text-zinc-100">
              {outdoorTempF != null ? `${Math.round(outdoorTempF)}°` : '—'}
            </span>
          </div>
          <div className="mt-3 flex items-center gap-4 text-base text-zinc-400">
            <span className={outdoorIsReal ? 'text-emerald-400' : ''}>
              {outdoorIsReal ? 'Sensor' : `Feels ${weather?.feelsLikeF != null ? Math.round(weather.feelsLikeF) + '°' : '—'}`}
            </span>
            <Trend deltaF={outdoorDeltaF} />
            <span className="ml-auto text-zinc-600">
              {outdoorSensor?.at ? timeAgo(outdoorSensor.at) : weather ? 'forecast' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Forecast strip */}
      {weather?.hourly?.length > 0 && (
        <div className="mt-10 flex gap-6 overflow-x-auto">
          {weather.hourly.map((h) => {
            const Icon = weatherIconFor(h.code);
            return (
              <div key={h.time} className="flex flex-col items-center gap-1 min-w-[64px]">
                <div className="text-sm text-zinc-400">{fmtHour(h.time)}</div>
                <Icon className="w-8 h-8 text-sky-400/80" strokeWidth={1.5} />
                <div className="text-lg">{h.tempF != null ? `${Math.round(h.tempF)}°` : '—'}</div>
              </div>
            );
          })}
        </div>
      )}

      {weather?.daily?.length > 0 && (
        <div className="mt-6 flex gap-8">
          {weather.daily.map((d, i) => {
            const Icon = weatherIconFor(d.code);
            return (
              <div key={d.date} className="flex items-center gap-3">
                <div className="text-zinc-400 w-14">{fmtDay(d.date, i === 0)}</div>
                <Icon className="w-7 h-7 text-sky-400/70" strokeWidth={1.5} />
                <div className="text-zinc-100">{d.maxF != null ? Math.round(d.maxF) : '—'}°</div>
                <div className="text-zinc-500">{d.minF != null ? Math.round(d.minF) : '—'}°</div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-auto pt-6 text-sm text-zinc-600">
        {lastRefresh ? `Updated ${timeAgo(lastRefresh.toISOString())}` : ''}
      </div>
      </div>
    </div>
  );
}
