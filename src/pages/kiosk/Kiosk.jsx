import { useState, useEffect } from 'react';
import { Droplets, LoaderCircle } from 'lucide-react';
import { useKioskData } from './useKioskData';
import { weatherIconFor } from './weatherIcons';
import { timeAgo } from '../climate/useClimateData';

// Full-bleed "digital photo frame" style display for a living-room panel.
// No nav chrome, no auth gate (a TV/kiosk can't log in) — just the current
// climate readout. Photo rotation is a planned follow-up; this is the
// climate-view baseline it'll eventually alternate with.

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

export default function Kiosk() {
  const { sensors, weather, lastRefresh, loading } = useKioskData();
  const now = useClock();
  const isNight = now.getHours() < 6 || now.getHours() >= 20;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col p-8 select-none">
      {/* Header: clock + date */}
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-7xl font-light tracking-tight">{fmtClockTime(now)}</div>
          <div className="text-xl text-zinc-400 mt-1">
            {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
        </div>
        {weather && (
          <div className="flex items-center gap-4">
            {(() => {
              const Icon = weatherIconFor(weather.code, isNight);
              return <Icon className="w-16 h-16 text-sky-400" strokeWidth={1.5} />;
            })()}
            <div className="text-right">
              <div className="text-6xl font-light">{weather.tempF != null ? `${Math.round(weather.tempF)}°` : '—'}</div>
              <div className="text-lg text-zinc-400">
                Feels {weather.feelsLikeF != null ? `${Math.round(weather.feelsLikeF)}°` : '—'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Indoor sensor tiles — every area we're tracking */}
      <div className="mt-10 grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {loading && sensors.length === 0 && (
          <div className="col-span-full flex items-center gap-2 text-zinc-500 text-lg">
            <LoaderCircle className="w-5 h-5 animate-spin" /> Loading sensors…
          </div>
        )}
        {!loading && sensors.length === 0 && (
          <div className="col-span-full text-zinc-500 text-lg">No sensors found.</div>
        )}
        {sensors.map((s) => {
          const stale = s.ts && Date.now() - new Date(s.ts).getTime() > 10 * 60 * 1000;
          return (
            <div key={s.mac} className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-6">
              <div className="text-lg text-zinc-400 truncate">{s.label}</div>
              <div className={`text-5xl font-light mt-2 ${stale ? 'text-zinc-600' : 'text-zinc-100'}`}>
                {s.tempC != null ? `${Math.round(s.tempC * 9 / 5 + 32)}°` : '—'}
              </div>
              {s.humidity != null && (
                <div className="flex items-center gap-1.5 text-zinc-400 mt-2 text-lg">
                  <Droplets className="w-5 h-5" /> {Math.round(s.humidity)}%
                </div>
              )}
            </div>
          );
        })}
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
  );
}
