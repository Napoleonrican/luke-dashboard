import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, ReferenceArea, Brush } from 'recharts';
import * as XLSX from 'xlsx';
import { Thermometer, Droplets, Cloud, Download, RefreshCw, Info } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  RANGES, REFRESH_OPTIONS, OUTDOOR_COLOR, cToF, fToC, fmtTemp, makeXTicks, mergeOutdoor,
} from './useClimateData';

const ALERT_COLOR = '#ef4444'; // red — temperature alert bounds + out-of-range shading

export default function History() {
  const {
    sensors, chartData, outdoorSeries,
    rangeKey, setRangeKey, unit,
    refreshInterval, setRefreshInterval,
    showTemp, setShowTemp, showHumidity, setShowHumidity, showOutdoor, setShowOutdoor,
    hiddenSensors, toggleSensor, reload, colorFor, alerts,
  } = useOutletContext();

  const xTickFmt = (t) => {
    const d = new Date(t);
    return rangeKey === '7d'
      ? d.toLocaleDateString([], { month: 'numeric', day: 'numeric' })
      : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const visibleSensors = sensors.filter((s) => !hiddenSensors.has(s.mac));
  const tempAxis = showTemp || showOutdoor;

  const chartRows = useMemo(
    () => (showOutdoor ? mergeOutdoor(chartData, outdoorSeries) : chartData),
    [chartData, outdoorSeries, showOutdoor]
  );

  const xTicks = useMemo(() => makeXTicks(chartData, rangeKey), [chartData, rangeKey]);

  const averages = useMemo(() => {
    const out = {};
    for (const s of sensors) {
      let tSum = 0, tN = 0, hSum = 0, hN = 0;
      for (const row of chartData) {
        const t = row[`temp_${s.mac}`];
        if (t != null) { tSum += t; tN += 1; }
        const h = row[`humidity_${s.mac}`];
        if (h != null) { hSum += h; hN += 1; }
      }
      out[s.mac] = { temp: tN ? tSum / tN : null, humidity: hN ? hSum / hN : null };
    }
    let oSum = 0, oN = 0;
    for (const row of chartRows) {
      if (row.outdoor != null) { oSum += row.outdoor; oN += 1; }
    }
    out.outdoor = oN ? oSum / oN : null;
    return out;
  }, [chartData, chartRows, sensors]);

  // Temperature alert bounds in °C (chart data is °C; thresholds stored in °F).
  const minC = alerts?.tempMinF != null ? fToC(alerts.tempMinF) : null;
  const maxC = alerts?.tempMaxF != null ? fToC(alerts.tempMaxF) : null;

  // Contiguous time spans where any visible sensor's temperature exits [min, max].
  // Rendered as faint red ReferenceAreas behind the lines so excursions stand out.
  const alertSpans = useMemo(() => {
    if (!showTemp || (minC == null && maxC == null) || chartData.length === 0) return [];
    const outAt = (row) => visibleSensors.some((s) => {
      const t = row[`temp_${s.mac}`];
      return t != null && ((minC != null && t < minC) || (maxC != null && t > maxC));
    });
    const spans = [];
    let start = null, prevTs = null;
    for (const row of chartData) {
      if (outAt(row)) {
        if (start == null) start = row.ts;
        prevTs = row.ts;
      } else if (start != null) {
        spans.push([start, prevTs]);
        start = null;
      }
    }
    if (start != null) spans.push([start, prevTs]);
    return spans;
  }, [showTemp, minC, maxC, chartData, visibleSensors]);

  const chartTitle = tempAxis && showHumidity
    ? `Temperature (°${unit}) & Humidity (%)`
    : showHumidity
    ? 'Humidity (%)'
    : `Temperature (°${unit})`;

  async function exportData() {
    const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[2];
    const since = new Date(Date.now() - range.hours * 3600 * 1000).toISOString();

    // Export the full-resolution history. This project caps each query at 1000
    // rows, so page through with .range() until a short page comes back.
    const pageSize = 1000;
    let from = 0;
    let data = [];
    for (let page = 0; page < 60; page++) {
      const { data: chunk } = await supabase
        .from('sensor_history')
        .select('mac,ts,temp_c,humidity,battery')
        .gte('ts', since)
        .order('ts', { ascending: true })
        .range(from, from + pageSize - 1);
      if (!chunk || chunk.length === 0) break;
      data = data.concat(chunk);
      if (chunk.length < pageSize) break;
      from += pageSize;
    }

    const labelOf = Object.fromEntries(sensors.map((s) => [s.mac, s.label || s.name || s.mac]));
    const rows = data.map((r) => ({
      Time: new Date(r.ts).toLocaleString(),
      Sensor: labelOf[r.mac] ?? r.mac,
      'Temp °C': r.temp_c,
      'Temp °F': r.temp_c == null ? null : Number(cToF(r.temp_c).toFixed(1)),
      'Humidity %': r.humidity,
      'Battery %': r.battery,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Readings');
    XLSX.writeFile(wb, `thermometer-readings-${range.key}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Chart controls: time range + metric toggle + refresh ........ export */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRangeKey(r.key)}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors min-h-[32px] ${
                  rangeKey === r.key ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
            <button
              onClick={() => setShowTemp(!showTemp)}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors min-h-[32px] flex items-center gap-1.5 ${
                showTemp ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Thermometer size={12} /> Temp
            </button>
            <button
              onClick={() => setShowHumidity(!showHumidity)}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors min-h-[32px] flex items-center gap-1.5 ${
                showHumidity ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Droplets size={12} /> Humidity
            </button>
            <button
              onClick={() => setShowOutdoor(!showOutdoor)}
              title="Overlay outdoor temperature (Open-Meteo, your location)"
              className={`text-xs px-3 py-1.5 rounded-md transition-colors min-h-[32px] flex items-center gap-1.5 ${
                showOutdoor ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Cloud size={12} style={{ color: showOutdoor ? OUTDOOR_COLOR : undefined }} /> Outdoor
            </button>
          </div>

          {/* Database-refresh controls (re-query stored readings; not the sensor cadence). */}
          <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg pl-2 pr-1 py-1">
            <span
              className="text-zinc-500 hover:text-zinc-300 cursor-help flex items-center"
              title={
                'These controls re-query the DATABASE for stored readings.\n' +
                'They do NOT change how often the sensors are read — that is set by ' +
                'the collector script. Refresh just pulls the latest into this view.'
              }
            >
              <Info size={14} />
            </span>
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              title="How often this view auto-pulls the latest stored readings"
              className="bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-md px-1.5 py-1.5 text-xs cursor-pointer hover:bg-zinc-800 transition-colors"
            >
              {REFRESH_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={reload}
              className="text-xs px-2.5 py-1.5 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700 transition-colors flex items-center gap-1.5"
            >
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        </div>
        <button
          onClick={exportData}
          className="text-xs px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 transition-colors min-h-[36px] flex items-center gap-1.5"
        >
          <Download size={13} /> Export Excel
        </button>
      </div>

      {/* Sensor visibility toggles */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] uppercase tracking-wide text-zinc-600">Sensors:</span>
        {sensors.map((s) => {
          const on = !hiddenSensors.has(s.mac);
          const color = colorFor(s.mac);
          return (
            <button
              key={s.mac}
              onClick={() => toggleSensor(s.mac)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
                on ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-zinc-900 border-zinc-800 text-zinc-500'
              }`}
              title={on ? 'Click to hide from graph' : 'Click to show on graph'}
            >
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: on ? color : '#3f3f46' }} />
              {s.label || s.name}
            </button>
          );
        })}
      </div>

      {/* History chart */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="text-xs text-zinc-500 mb-3">{chartTitle}</div>
        {chartData.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-sm text-zinc-600 text-center px-4">
            No history in this range yet. Run the history downloader (history_pull.py) to pull stored readings from the sensors.
          </div>
        ) : !showTemp && !showHumidity && !showOutdoor ? (
          <div className="h-72 flex items-center justify-center text-sm text-zinc-600">
            Select at least one metric above.
          </div>
        ) : visibleSensors.length === 0 && !showOutdoor ? (
          <div className="h-72 flex items-center justify-center text-sm text-zinc-600">
            All sensors hidden — click a sensor above to show it.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartRows} margin={{ top: 5, right: tempAxis && showHumidity ? 45 : 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="ts"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                ticks={xTicks}
                interval={0}
                tickFormatter={xTickFmt}
                stroke="#52525b"
                fontSize={11}
              />
              {tempAxis && (
                <YAxis
                  yAxisId="temp"
                  stroke="#52525b"
                  fontSize={11}
                  tickFormatter={(v) => (unit === 'F' ? Math.round(cToF(v)) : Math.round(v))}
                  domain={['auto', 'auto']}
                />
              )}
              {showHumidity && (
                <YAxis
                  yAxisId="humidity"
                  orientation={tempAxis ? 'right' : 'left'}
                  stroke="#52525b"
                  fontSize={11}
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                />
              )}
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
                labelFormatter={(t) => new Date(t).toLocaleString()}
                formatter={(value, name) =>
                  name.endsWith(' (hum)')
                    ? [value == null ? '—' : `${Number(value).toFixed(1)}%`, name]
                    : [fmtTemp(value, unit), name]
                }
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {/* Shade time spans where a sensor's temperature left the alert range */}
              {tempAxis && alertSpans.map(([x1, x2]) => (
                <ReferenceArea
                  key={`alert_${x1}`}
                  yAxisId="temp"
                  x1={x1}
                  x2={x2}
                  fill={ALERT_COLOR}
                  fillOpacity={0.1}
                  stroke="none"
                />
              ))}
              {/* Temperature alert bounds */}
              {showTemp && minC != null && (
                <ReferenceLine
                  yAxisId="temp"
                  y={minC}
                  stroke={ALERT_COLOR}
                  strokeDasharray="5 4"
                  strokeOpacity={0.7}
                  label={{ value: `min ${fmtTemp(minC, unit)}`, position: 'insideLeft', fill: ALERT_COLOR, fontSize: 10 }}
                />
              )}
              {showTemp && maxC != null && (
                <ReferenceLine
                  yAxisId="temp"
                  y={maxC}
                  stroke={ALERT_COLOR}
                  strokeDasharray="5 4"
                  strokeOpacity={0.7}
                  label={{ value: `max ${fmtTemp(maxC, unit)}`, position: 'insideLeft', fill: ALERT_COLOR, fontSize: 10 }}
                />
              )}
              {showTemp && visibleSensors.map((s) => {
                const a = averages[s.mac]?.temp;
                if (a == null) return null;
                return (
                  <ReferenceLine
                    key={`avgT_${s.mac}`}
                    yAxisId="temp"
                    y={a}
                    stroke={colorFor(s.mac)}
                    strokeDasharray="2 4"
                    strokeOpacity={0.55}
                    label={{ value: `avg ${fmtTemp(a, unit)}`, position: 'insideRight', fill: colorFor(s.mac), fontSize: 10 }}
                  />
                );
              })}
              {showOutdoor && averages.outdoor != null && (
                <ReferenceLine
                  yAxisId="temp"
                  y={averages.outdoor}
                  stroke={OUTDOOR_COLOR}
                  strokeDasharray="2 4"
                  strokeOpacity={0.55}
                  label={{ value: `avg ${fmtTemp(averages.outdoor, unit)}`, position: 'insideRight', fill: OUTDOOR_COLOR, fontSize: 10 }}
                />
              )}
              {showHumidity && visibleSensors.map((s) => {
                const a = averages[s.mac]?.humidity;
                if (a == null) return null;
                return (
                  <ReferenceLine
                    key={`avgH_${s.mac}`}
                    yAxisId="humidity"
                    y={a}
                    stroke={colorFor(s.mac)}
                    strokeDasharray="2 4"
                    strokeOpacity={0.4}
                    label={{ value: `avg ${a.toFixed(0)}%`, position: 'insideLeft', fill: colorFor(s.mac), fontSize: 10 }}
                  />
                );
              })}
              {showTemp && visibleSensors.map((s) => (
                <Line
                  key={`temp_${s.mac}`}
                  yAxisId="temp"
                  type="monotone"
                  dataKey={`temp_${s.mac}`}
                  name={s.label || s.name}
                  stroke={colorFor(s.mac)}
                  dot={false}
                  connectNulls
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              ))}
              {showOutdoor && (
                <Line
                  yAxisId="temp"
                  type="monotone"
                  dataKey="outdoor"
                  name="Outdoor"
                  stroke={OUTDOOR_COLOR}
                  dot={false}
                  connectNulls
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  isAnimationActive={false}
                />
              )}
              {showHumidity && visibleSensors.map((s) => (
                <Line
                  key={`hum_${s.mac}`}
                  yAxisId="humidity"
                  type="monotone"
                  dataKey={`humidity_${s.mac}`}
                  name={`${s.label || s.name} (hum)`}
                  stroke={colorFor(s.mac)}
                  dot={false}
                  connectNulls
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  isAnimationActive={false}
                />
              ))}
              {/* Drag the handles to zoom/scrub into a sub-window of the loaded range */}
              <Brush
                dataKey="ts"
                height={22}
                travellerWidth={8}
                stroke="#52525b"
                fill="#18181b"
                tickFormatter={xTickFmt}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
