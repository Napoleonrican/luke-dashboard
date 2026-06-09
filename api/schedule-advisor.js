/**
 * /api/schedule-advisor — AC schedule recommendations (Vercel serverless function).
 *
 * Runs on Vercel (not in the browser) so the Anthropic API key stays secret.
 * Flow per request:
 *   1. Take {lat, lon} from the POST body (the dashboard sends the browser's location).
 *   2. Read the current schedule (ac_schedule), preferences (ac_preferences), recent
 *      presence events (presence_log), and bucket-averaged indoor history for the AC's
 *      room (history_series RPC) from Supabase.
 *   3. Fetch outdoor history (Open-Meteo archive) + a short forecast (no key).
 *   4. Summarize presence into an occupancy-by-hour pattern.
 *   5. Ask Claude to recommend edits to the schedule — returns a short prose summary,
 *      a strict JSON `changes` array, and a longer rationale.
 *   6. Save the result to schedule_recommendations and return it.
 *
 * Environment variables (Vercel project settings):
 *   ANTHROPIC_API_KEY            — Claude API key (server-side only).
 *   SUPABASE_URL                 — Supabase project URL.
 *   SUPABASE_SERVICE_ROLE_KEY    — service_role key.
 * (Falls back to VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY if those aren't set.)
 */

// Adaptive thinking can take a little while.
export const config = { maxDuration: 60 };

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const cToF = (c) => (c == null ? null : c * 9 / 5 + 32);

// Render the 7-bit weekday mask (bit0=Sun) as a compact label.
function daysLabel(mask) {
  if (mask === 127) return 'Every day';
  const on = DAY_NAMES.filter((_, i) => (mask & (1 << i)) !== 0);
  return on.length ? on.join(' ') : 'No days';
}

function time12(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

const SYSTEM_PROMPT = `You are an AC scheduling advisor for Luke's home. He has ONE air conditioner: a GE AWFS12WW — a 12,000 BTU window/room unit that COOLS ONLY (no heat), controlled via the GE SmartHQ app. Available operation modes: Cool, Eco, Energy Saver, Turbo Cool, Dry (no heat, no auto).

KEY FACTS ABOUT LUKE'S SETUP:
- The AC is physically located in the BEDROOM (a window unit).
- He has two occupied zones: the Bedroom and the Living Room. The Freezer sensor monitors an appliance, not a living space.
- NIGHTTIME goal (roughly midnight onward): keep the BEDROOM around 65°F for sleep. The dramatic 64°F schedule entries at midnight and 1 AM are intentional — that's his sleep target.
- DAYTIME goal: he cares about the LIVING ROOM staying around 75°F. The AC is in the bedroom, so it influences the living room indirectly through airflow; the indoor history for both rooms is useful context.
- EVENING routine: he typically leaves around 5:30 PM for the gym and food-delivery driving, doesn't return until after dark. Only the cats are home. A warmer setpoint during that window (the 75°F entry) is intentional and acceptable — no need to over-cool for the cats.
- He is open to changes to schedule TIMES, not just temperatures and modes. If the data suggests pre-cooling 30 min earlier, suggest it.

You receive:
- His CURRENT schedule (entries he set in the SmartHQ app), each with an id, days, time, action, target temp (F) and mode.
- His PREFERENCES: an optimization priority and a comfort band (low–high F) plus quiet hours.
- His GOALS: a free-text description of what he wants (treat this as high-priority intent; weigh it heavily).
- An OCCUPANCY pattern (fraction of days he's been home, by hour) derived from his phone's geofence.
- INDOOR history (the "AC room" series is the Bedroom; the advisor also has all-sensor history for the Living Room context).
- OUTDOOR history + a short forecast.

Your job: recommend concrete EDITS to his existing schedule so it better matches reality, honoring his goals, priority, and comfort band. Reason about the thermal response — how fast the bedroom and living room heat up relative to outdoor conditions — to suggest pre-cooling or time shifts. Don't recommend heating (the unit can't). Keep the number of schedule entries manageable (ideally 4–6 total). Respect quiet hours.

IMPORTANT: If your summary describes a change, that change MUST also appear in the "changes" array. Never describe a recommendation in prose without including it as a structured change. If you truly recommend nothing, use an empty array and say so in the summary.

Respond with ONLY a single JSON object (no markdown, no code fences, no commentary before or after) with exactly these keys:
{
  "summary": "One or two sentences: the headline of what you're suggesting, or why nothing should change.",
  "changes": [
    // zero or more of these shapes:
    {"entry_id": "<uuid of an existing entry>", "field": "temp_f"|"mode"|"time_local"|"days"|"action", "from": <current value>, "to": <proposed value>, "reason": "<short why>"},
    {"action": "add", "time_local": "HH:MM", "temp_f": <int>, "mode": "<mode>", "days": <mask 0-127>, "reason": "<short why>"},
    {"action": "remove", "entry_id": "<uuid>", "reason": "<short why>"}
  ],
  "rationale": "A few sentences on the data behind the recommendations (occupancy, thermal behavior, weather, his goals). Plain language."
}
Only reference entry_ids that exist in the current schedule. Use [] for changes if you recommend nothing.`;

// Strip any stray XML-ish tags the model might leak into prose.
function stripTags(s) {
  return typeof s === 'string' ? s.replace(/<\/?[a-z_]+>/gi, '').trim() : s;
}

const unescapeJson = (s) =>
  typeof s === 'string'
    ? s.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\')
    : '';

// Pull a single JSON object out of the model's text, tolerant of code fences,
// surrounding prose, AND truncation. Returns {summary, changes, rationale}.
function parseAdvice(text) {
  let raw = text.trim();
  // Drop ```json ... ``` fences if present.
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  // Narrow to the first opening brace onward.
  const firstBrace = raw.indexOf('{');
  if (firstBrace > 0) raw = raw.slice(firstBrace);

  // 1) Clean parse (trim to the last closing brace).
  const lastBrace = raw.lastIndexOf('}');
  if (lastBrace !== -1) {
    try {
      const obj = JSON.parse(raw.slice(0, lastBrace + 1));
      if (obj && typeof obj === 'object') {
        return {
          summary: stripTags(obj.summary) || '',
          changes: Array.isArray(obj.changes) ? obj.changes : [],
          rationale: stripTags(obj.rationale) || '',
        };
      }
    } catch { /* fall through to salvage */ }
  }

  // 2) Salvage from a truncated/invalid object by pulling fields individually.
  const sMatch = raw.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const rMatch = raw.match(/"rationale"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const cMatch = raw.match(/"changes"\s*:\s*(\[[\s\S]*\])/);
  let changes = [];
  if (cMatch) {
    try { const c = JSON.parse(cMatch[1]); if (Array.isArray(c)) changes = c; } catch { /* ignore */ }
  }
  if (sMatch) {
    return {
      summary: stripTags(unescapeJson(sMatch[1])),
      changes,
      rationale: stripTags(unescapeJson(rMatch?.[1] || '')),
    };
  }

  // 3) Last resort — never dump raw JSON at the user.
  return { summary: 'The advisor response could not be parsed. Please try Re-analyze.', changes: [], rationale: '' };
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

  const base = SUPABASE_URL.replace(/\/$/, '');
  const sHeaders = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

  // --- 1) Schedule, preferences, presence, indoor history ---
  let schedule = [];
  let prefs = null;
  let presence = [];
  try {
    const [schRes, prefRes, presRes] = await Promise.all([
      fetch(`${base}/rest/v1/ac_schedule?select=*&order=position.asc,time_local.asc`, { headers: sHeaders }),
      fetch(`${base}/rest/v1/ac_preferences?select=*&id=eq.1`, { headers: sHeaders }),
      fetch(
        `${base}/rest/v1/presence_log?select=ts,present&ts=gte.${new Date(Date.now() - 14 * 86400 * 1000).toISOString()}&order=ts.asc&limit=2000`,
        { headers: sHeaders }
      ),
    ]);
    schedule = schRes.ok ? await schRes.json() : [];
    prefs = prefRes.ok ? (await prefRes.json())[0] ?? null : null;
    presence = presRes.ok ? await presRes.json() : [];
  } catch (e) {
    res.status(502).json({ error: 'Could not read schedule/preferences from Supabase.', detail: String(e).slice(0, 300) });
    return;
  }

  if (!schedule.length) {
    res.status(200).json({
      summary: 'No schedule entered yet. Add your current SmartHQ schedule entries first, then run the advisor.',
      changes: [],
      rationale: '',
      generatedAt: new Date().toISOString(),
    });
    return;
  }

  // Indoor history for the AC's room (last 7 days, hourly buckets) via the existing RPC.
  let indoorSeries = [];
  const roomMac = prefs?.room_sensor_mac || null;
  try {
    const since = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
    const rpcRes = await fetch(`${base}/rest/v1/rpc/history_series`, {
      method: 'POST',
      headers: { ...sHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ since, bucket_seconds: 3600 }),
    });
    const allBuckets = rpcRes.ok ? await rpcRes.json() : [];
    indoorSeries = roomMac ? allBuckets.filter((b) => b.mac === roomMac) : allBuckets;
  } catch {
    // history is helpful but not strictly required
  }

  // --- 2) Outdoor history (archive) + short forecast ---
  let outdoorNow = null;
  let outdoorHistory = [];
  let outdoorForecast = [];
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    try {
      const today = new Date();
      const start = new Date(today.getTime() - 7 * 86400 * 1000);
      const iso = (d) => d.toISOString().slice(0, 10);
      const archRes = await fetch(
        `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
        `&start_date=${iso(start)}&end_date=${iso(today)}` +
        `&hourly=temperature_2m,relative_humidity_2m&temperature_unit=fahrenheit&timezone=auto`
      );
      if (archRes.ok) {
        const a = await archRes.json();
        const t = a.hourly?.time ?? [];
        const temp = a.hourly?.temperature_2m ?? [];
        // Sample every 3 hours to keep the prompt compact.
        for (let i = 0; i < t.length; i += 3) {
          if (temp[i] != null) outdoorHistory.push({ t: t[i], f: temp[i] });
        }
      }
    } catch { /* optional */ }

    try {
      const fRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature` +
        `&hourly=temperature_2m&daily=temperature_2m_max,temperature_2m_min` +
        `&temperature_unit=fahrenheit&forecast_days=3&timezone=auto`
      );
      if (fRes.ok) {
        const f = await fRes.json();
        outdoorNow = f.current
          ? { f: f.current.temperature_2m, feels: f.current.apparent_temperature, rh: f.current.relative_humidity_2m }
          : null;
        const d = f.daily || {};
        const days = d.time ?? [];
        for (let i = 0; i < days.length; i++) {
          outdoorForecast.push({ date: days[i], maxF: d.temperature_2m_max?.[i], minF: d.temperature_2m_min?.[i] });
        }
      }
    } catch { /* optional */ }
  }

  // --- 3) Occupancy-by-hour from presence_log ---
  // For each hour 0-23, estimate the fraction of the observed days he was home.
  // Walk the ordered enter/leave events, carrying state across hour boundaries.
  let occupancyByHour = null;
  if (presence.length) {
    const homeMinutes = new Array(24).fill(0);
    const totalMinutes = new Array(24).fill(0);
    // Assume "away" before the first event of the window.
    let state = presence[0].present ? false : true; // state just BEFORE first event
    let cursor = new Date(presence[0].ts).getTime() - 1;
    const endWindow = Date.now();

    const accumulate = (fromMs, toMs, isHome) => {
      let ts = fromMs;
      while (ts < toMs) {
        const d = new Date(ts);
        const hour = d.getHours();
        const nextHour = new Date(d).setMinutes(60, 0, 0);
        const segEnd = Math.min(nextHour, toMs);
        const mins = (segEnd - ts) / 60000;
        totalMinutes[hour] += mins;
        if (isHome) homeMinutes[hour] += mins;
        ts = segEnd;
      }
    };

    for (const ev of presence) {
      const evMs = new Date(ev.ts).getTime();
      accumulate(cursor, evMs, state);
      state = ev.present;
      cursor = evMs;
    }
    accumulate(cursor, endWindow, state);

    occupancyByHour = homeMinutes.map((hm, h) =>
      totalMinutes[h] > 0 ? Math.round((hm / totalMinutes[h]) * 100) : null
    );
  }

  // --- 4) Build the prompt ---
  const scheduleLines = schedule.map((s) =>
    `- id=${s.id} | ${daysLabel(s.days)} | ${time12(s.time_local)} | ` +
    (s.action === 'on' ? `Turn On ${s.temp_f}F ${s.mode}` : 'Turn Off') +
    (s.enabled ? '' : ' (disabled)')
  );

  const prefLines = prefs
    ? [
        `- Priority: ${prefs.priority}`,
        `- Comfort band: ${prefs.comfort_low_f}–${prefs.comfort_high_f} F`,
        `- Quiet hours: ${prefs.quiet_start}:00–${prefs.quiet_end}:00 (avoid AC)`,
        `- AC room sensor: ${roomMac ? roomMac : 'not set (indoor history below is all sensors)'}`,
      ]
    : ['- (no preferences set; assume balanced, comfort band 69–74F, quiet 0:00–6:00)'];

  const goalsBlock = prefs?.goals_text
    ? `LUKE'S GOALS (his own words — weigh heavily):\n${prefs.goals_text.trim()}`
    : 'LUKE\'S GOALS: (none provided)';

  let occBlock = 'OCCUPANCY: no presence data yet (phone geofence not set up). Assume a typical work-from-elsewhere weekday if unsure.';
  if (occupancyByHour) {
    const parts = occupancyByHour.map((p, h) => (p == null ? null : `${h}:00=${p}%`)).filter(Boolean);
    occBlock = `OCCUPANCY (fraction of days home, last ~14 days):\n${parts.join(', ')}`;
  }

  const indoorBlock = indoorSeries.length
    ? `INDOOR HISTORY (AC room, hourly avg, last 7 days — F):\n` +
      indoorSeries
        .slice(-120)
        .map((b) => `${new Date(b.bucket).toLocaleString('en-US')}: ${cToF(Number(b.temp_c)).toFixed(0)}F${b.humidity != null ? `, ${Number(b.humidity).toFixed(0)}%` : ''}`)
        .join('\n')
    : 'INDOOR HISTORY: none available (run history_pull.py / set room_sensor_mac).';

  let outdoorBlock = 'OUTDOOR: not available (no location provided).';
  if (outdoorNow || outdoorHistory.length || outdoorForecast.length) {
    const lines = [];
    if (outdoorNow) lines.push(`- Now: ${Math.round(outdoorNow.f)}F, feels ${Math.round(outdoorNow.feels)}F, ${outdoorNow.rh}% RH`);
    if (outdoorForecast.length) {
      lines.push('- Forecast: ' + outdoorForecast.map((d) => `${d.date} ${Math.round(d.minF)}–${Math.round(d.maxF)}F`).join('; '));
    }
    if (outdoorHistory.length) {
      lines.push('- Recent (every 3h): ' + outdoorHistory.slice(-40).map((o) => `${o.t.slice(5, 16)}=${Math.round(o.f)}F`).join(', '));
    }
    outdoorBlock = `OUTDOOR:\n${lines.join('\n')}`;
  }

  const userText =
    `Current local time: ${new Date().toLocaleString('en-US')}\n\n` +
    `CURRENT SCHEDULE:\n${scheduleLines.join('\n')}\n\n` +
    `PREFERENCES:\n${prefLines.join('\n')}\n\n` +
    `${goalsBlock}\n\n` +
    `${occBlock}\n\n` +
    `${indoorBlock}\n\n` +
    `${outdoorBlock}\n\n` +
    `Recommend schedule edits in the required format.`;

  // --- 5) Call Claude ---
  let summary = '';
  let changes = [];
  let rationale = '';
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
        max_tokens: 8000,
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
    const text = (ai.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    const parsed = parseAdvice(text);
    summary = parsed.summary;
    changes = parsed.changes;
    rationale = parsed.rationale;
  } catch (e) {
    res.status(502).json({ error: 'Failed to reach the Claude API.', detail: String(e).slice(0, 300) });
    return;
  }

  // --- 6) Persist + return ---
  const generatedAt = new Date().toISOString();
  try {
    await fetch(`${base}/rest/v1/schedule_recommendations`, {
      method: 'POST',
      headers: { ...sHeaders, 'content-type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ generated_at: generatedAt, summary, changes, rationale }),
    });
  } catch {
    // Saving is best-effort; still return the advice to the caller.
  }

  res.status(200).json({ summary, changes, rationale, generatedAt });
}
