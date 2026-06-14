/**
 * DORMANT (2026-06-14): no caller. The dashboard's "Comfort & AC Advice" UI was removed
 * when the autonomous schedule agent (GE AC/AGENT.md) took over recommendations. Kept on
 * disk in case it's repurposed later; nothing in the app or the agent invokes it.
 *
 * /api/insights — Comfort & AC advice (Vercel serverless function).
 *
 * Runs on Vercel (not in the browser) so the Anthropic API key stays secret.
 * Flow per request:
 *   1. Take {lat, lon} from the POST body (the dashboard sends the browser's
 *      detected location).
 *   2. Fetch current outdoor weather + a short forecast from Open-Meteo (no key).
 *   3. Read the latest indoor reading per sensor from Supabase.
 *   4. Ask Claude for a concise comfort read + practical AC advice tied to
 *      Luke's GE AWFS12WW (cooling-only window unit).
 *   5. Return { advice, weather, indoor, generatedAt } as JSON.
 *
 * Environment variables (set these in the Vercel project settings):
 *   ANTHROPIC_API_KEY            — your Claude API key (server-side only).
 *   SUPABASE_URL                 — your Supabase project URL.
 *   SUPABASE_SERVICE_ROLE_KEY    — service_role key (read sensors/readings).
 * (Falls back to VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY if those aren't set.)
 */

// Allow up to 60s — Claude with adaptive thinking can take a little while.
export const config = { maxDuration: 60 };

// WMO weather codes -> plain-English description (Open-Meteo uses these).
const WMO = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Rime fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  56: 'Freezing drizzle', 57: 'Heavy freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  66: 'Freezing rain', 67: 'Heavy freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Light showers', 81: 'Showers', 82: 'Violent showers',
  85: 'Snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm w/ hail', 99: 'Thunderstorm w/ heavy hail',
};

const SYSTEM_PROMPT = `You are a home-comfort advisor for Luke's house. You receive the latest indoor temperature/humidity readings from a few Govee sensors in different rooms, plus the current local outdoor weather and a short forecast.

Luke's only air conditioner is a GE AWFS12WW: a 12,000 BTU window/room AC that COOLS ONLY (no heating), controlled through the GE SmartHQ app. It cools roughly one room/zone, not the whole house.

Some sensors monitor an appliance rather than living space. If a sensor named like "Freezer" reads well below 0 degrees C, it is inside a freezer — judge it for appliance health (safe freezer range is around -18 C / 0 F), not human comfort.

Give Luke, in this order:
1. One short line on overall comfort right now.
2. Practical AC advice for the next few hours given indoor AND outdoor conditions: when to run the AC and a rough setpoint, or when opening windows / using cooler outdoor air beats running it. Always respect that the AWFS12WW only cools — never suggest using it for heat.
3. Any flags worth noting: high humidity, a room drifting warm, a freezer out of safe range, or a low sensor battery.

Keep it concise and concrete — a few short bullet points in plain language. Temperatures are already given in Fahrenheit; use Fahrenheit. Interpret the readings rather than restating every number.`;

const cToF = (c) => (c == null ? null : c * 9 / 5 + 32);
const f1 = (c) => (c == null ? '?' : `${cToF(c).toFixed(0)}F`);

function timeAgo(iso) {
  if (!iso) return 'no recent data';
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set on the server (add it in Vercel project settings).' });
    return;
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    res.status(500).json({ error: 'Supabase env vars are not set on the server.' });
    return;
  }

  // --- Parse body ---
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};
  const lat = Number(body.lat);
  const lon = Number(body.lon);

  // --- 1) Outdoor weather (optional — advice still works without it) ---
  let weather = null;
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    try {
      const wUrl =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day` +
        `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
        `&forecast_days=2&timezone=auto&wind_speed_unit=mph`;
      const wRes = await fetch(wUrl);
      if (wRes.ok) {
        const w = await wRes.json();
        const c = w.current || {};
        const d = w.daily || {};
        weather = {
          tempC: c.temperature_2m ?? null,
          feelsLikeC: c.apparent_temperature ?? null,
          humidity: c.relative_humidity_2m ?? null,
          windMph: c.wind_speed_10m ?? null,
          isDay: c.is_day === 1,
          code: c.weather_code ?? null,
          description: WMO[c.weather_code] ?? 'Unknown',
          todayMaxC: d.temperature_2m_max?.[0] ?? null,
          todayMinC: d.temperature_2m_min?.[0] ?? null,
          tomorrowMaxC: d.temperature_2m_max?.[1] ?? null,
          tomorrowMinC: d.temperature_2m_min?.[1] ?? null,
          tomorrowDescription: WMO[d.weather_code?.[1]] ?? 'Unknown',
        };
      }
    } catch {
      // weather is optional; continue without it
    }
  }

  // --- 2) Latest indoor reading per sensor from Supabase ---
  let indoor = [];
  try {
    const sHeaders = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
    const base = SUPABASE_URL.replace(/\/$/, '');

    const sRes = await fetch(`${base}/rest/v1/sensors?select=mac,name,label`, { headers: sHeaders });
    const sensors = sRes.ok ? await sRes.json() : [];

    const since = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const rRes = await fetch(
      `${base}/rest/v1/sensor_readings?select=mac,ts,temp_c,humidity,battery&ts=gte.${since}&order=ts.desc&limit=2000`,
      { headers: sHeaders }
    );
    const readings = rRes.ok ? await rRes.json() : [];

    const latestByMac = {};
    for (const r of readings) {
      if (!latestByMac[r.mac]) latestByMac[r.mac] = r; // readings are ts DESC -> first seen is newest
    }
    indoor = sensors.map((s) => {
      const r = latestByMac[s.mac] || null;
      return {
        name: s.label || s.name || s.mac,
        tempC: r?.temp_c ?? null,
        humidity: r?.humidity ?? null,
        battery: r?.battery ?? null,
        ts: r?.ts ?? null,
      };
    });
  } catch (e) {
    res.status(502).json({ error: 'Could not read sensor data from Supabase.', detail: String(e).slice(0, 300) });
    return;
  }

  const haveIndoor = indoor.some((i) => i.tempC != null);
  if (!haveIndoor) {
    res.status(200).json({
      advice: 'No recent indoor readings — start the local collector (run-collector.bat) so the sensors report in, then try again.',
      weather,
      indoor,
      generatedAt: new Date().toISOString(),
    });
    return;
  }

  // --- 3) Build the prompt ---
  const indoorLines = indoor.map((i) => {
    const parts = [`${f1(i.tempC)}`];
    if (i.humidity != null) parts.push(`${i.humidity}% humidity`);
    if (i.battery != null) parts.push(`battery ${i.battery}%`);
    parts.push(timeAgo(i.ts));
    return `- ${i.name}: ${parts.join(', ')}`;
  });

  let outdoorBlock = 'OUTDOOR: not available (no location provided).';
  if (weather) {
    const lines = [
      `- Now: ${f1(weather.tempC)}, feels like ${f1(weather.feelsLikeC)}, ${weather.humidity}% humidity, wind ${Math.round(weather.windMph)} mph, ${weather.description}, ${weather.isDay ? 'daytime' : 'night'}`,
      `- Today: high ${f1(weather.todayMaxC)} / low ${f1(weather.todayMinC)}`,
      `- Tomorrow: high ${f1(weather.tomorrowMaxC)} / low ${f1(weather.tomorrowMinC)}, ${weather.tomorrowDescription}`,
    ];
    outdoorBlock = `OUTDOOR (local weather):\n${lines.join('\n')}`;
  }

  const userText =
    `Current local time: ${new Date().toLocaleString('en-US')}\n\n` +
    `INDOOR (latest reading per sensor):\n${indoorLines.join('\n')}\n\n` +
    `${outdoorBlock}\n\n` +
    `Give Luke his comfort read and AC advice.`;

  // --- 4) Call Claude ---
  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-7',
        max_tokens: 1024,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high' },
        system: [{ type: 'text', text: SYSTEM_PROMPT }],
        messages: [{ role: 'user', content: userText }],
      }),
    });

    if (!aiRes.ok) {
      const detail = await aiRes.text();
      res.status(502).json({ error: `Claude API error (${aiRes.status}).`, detail: detail.slice(0, 500) });
      return;
    }

    const ai = await aiRes.json();
    const advice = (ai.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    res.status(200).json({
      advice: advice || 'No advice was returned. Please try again.',
      weather,
      indoor,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    res.status(502).json({ error: 'Failed to reach the Claude API.', detail: String(e).slice(0, 300) });
  }
}
