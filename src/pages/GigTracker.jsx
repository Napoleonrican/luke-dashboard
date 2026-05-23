import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Plus, X, Trash2, Edit2, Check, Menu } from 'lucide-react';
import TopNav from '../components/TopNav';
import { supabase } from '../lib/supabase';

const STORAGE_KEY = 'gig_tracker_state';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ZONES = ['Augusta', 'Brunswick/Bath/Freeport', 'Lewiston', 'Portland'];
const DOW_FULL = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };

// Highest EPH across all 4 zones per day (Sun=0 … Sat=6)
const DAY_MAX_EPH = [21.93, 21.25, 22.06, 23.04, 23.42, 23.60, 25.15];

const ZONE_EPH = {
  'Augusta':                 { Sun: 17.49, Mon: 17.61, Tue: 19.35, Wed: 15.92, Thu: 16.23, Fri: 18.98, Sat: 21.43 },
  'Brunswick/Bath/Freeport': { Sun: 21.40, Mon: 21.25, Tue: 22.06, Wed: 23.04, Thu: 23.42, Fri: 23.60, Sat: 25.15 },
  'Lewiston':                { Sun: 17.14, Mon: 15.41, Tue: 16.11, Wed: 23.02, Thu: 18.37, Fri: 23.54, Sat: 21.25 },
  'Portland':                { Sun: 21.93, Mon: 20.90, Tue: 21.99, Wed: 19.22, Thu: 18.52, Fri: 22.39, Sat: 20.62 },
};

const ZONE_TRIP_MINS = {
  'Augusta':                 { Sun: 30.97, Mon: 35.60, Tue: 32.76, Wed: 44.48, Thu: 35.77, Fri: 36.51, Sat: 27.53 },
  'Brunswick/Bath/Freeport': { Sun: 29.24, Mon: 30.25, Tue: 30.97, Wed: 28.21, Thu: 28.57, Fri: 30.10, Sat: 26.81 },
  'Lewiston':                { Sun: 27.38, Mon: 30.68, Tue: 27.35, Wed: 27.27, Thu: 27.80, Fri: 26.82, Sat: 28.63 },
  'Portland':                { Sun: 33.93, Mon: 32.36, Tue: 34.42, Wed: 29.42, Thu: 37.07, Fri: 33.37, Sat: 34.51 },
};

const ORDER_TYPE_MAP = { 'Hourly-Test': 'Hourly', 'Order': 'Per-Order' };

const ZONE_MILES = {
  'Augusta':                 { Sun: 11.30, Mon: 15.23, Tue: 12.44, Wed: 20.50, Thu: 15.28, Fri: 15.79, Sat: 10.67 },
  'Brunswick/Bath/Freeport': { Sun: 10.54, Mon: 11.64, Tue: 11.79, Wed: 10.76, Thu: 10.51, Fri: 12.04, Sat: 10.09 },
  'Lewiston':                { Sun:  8.33, Mon:  9.19, Tue:  9.94, Wed:  7.59, Thu:  8.51, Fri:  6.80, Sat:  9.31 },
  'Portland':                { Sun: 11.60, Mon: 12.61, Tue: 15.60, Wed:  9.86, Thu: 13.73, Fri: 13.31, Sat: 12.84 },
};

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function todayDay() {
  return DAYS[new Date().getDay()];
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function computeElapsedMinutes(startTime, breakLength) {
  if (!startTime) return 0;
  const now = new Date();
  const [h, m] = startTime.split(':').map(Number);
  const startDate = new Date(now);
  startDate.setHours(h, m, 0, 0);
  if (startDate > now) startDate.setDate(startDate.getDate() - 1);
  return Math.max(0, (now - startDate) / 60000 - Number(breakLength));
}

function getDefaultState() {
  return {
    shiftStarted: false,
    startTime: nowHHMM(),
    zone: 'Augusta',
    day: todayDay(),
    breakMinutes: 0,
    breakRunning: false,
    breakStartMs: null,
    minGoalHours: 4,
    minGoalDollars: 107,
    stretchGoalHours: 6,
    stretchGoalDollars: 156,
    orderLog: [],
    ephElapsedMinutes: 0,
    etaAnchorMs: 0,
    ordersPerHour: 0,
    strikes: 0,
    setupCollapsed: false,
    statsCollapsed: true,
    orderLogCollapsed: true,
    shiftDate: todayISO(),
    lastOrderEph: 0,
    orderType: 'Hourly',
  };
}

function fmtDuration(mins) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function fmtTime(date) {
  if (!date) return '—';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtMoney(n) {
  return `$${n.toFixed(2)}`;
}

function StatRow({ label, value }) {
  return (
    <div>
      <div className="text-xs text-zinc-600">{label}</div>
      <div className="text-sm font-semibold text-zinc-200">{String(value)}</div>
    </div>
  );
}

export default function GigTracker() {
  const [state, setState] = useState(getDefaultState);
  const [now, setNow] = useState(() => new Date());
  const [resumePrompt, setResumePrompt] = useState(false);
  const [savedResume, setSavedResume] = useState(null);
  const [ueInputOpen, setUeInputOpen] = useState(false);
  const [ddInputOpen, setDdInputOpen] = useState(false);
  const [ueInputValue, setUeInputValue] = useState('');
  const [ddInputValue, setDdInputValue] = useState('');
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const [prefsLoadKey, setPrefsLoadKey] = useState(0);

  // Supabase-fetched benchmark data; null = not yet loaded (fallback to hardcoded)
  const [zoneData, setZoneData] = useState(null);
  const [weeklySchedule, setWeeklySchedule] = useState(null);

  // Schedule UI state
  const [scheduleCollapsed, setScheduleCollapsed] = useState(true);
  const [schedulePasteOpen, setSchedulePasteOpen] = useState(false);
  const [schedulePasteText, setSchedulePasteText] = useState('');
  const [schedulePreview, setSchedulePreview] = useState(null);
  const [scheduleUpsertStatus, setScheduleUpsertStatus] = useState(null);

  // Always-fresh ref for use inside intervals
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // Always-fresh ref for zoneData (used inside addOrder callback)
  const zoneDataRef = useRef(null);
  useEffect(() => { zoneDataRef.current = zoneData; }, [zoneData]);

  // Auto-populate goal fields + zone + orderType from weekly_schedule when schedule loads or is pasted
  useEffect(() => {
    if (!weeklySchedule) return;
    const s = stateRef.current;
    if (s.shiftStarted) return;
    const todayFull = DOW_FULL[s.day];
    const rows = weeklySchedule.rows || [];
    // Prefer zone+DOW match, fall back to DOW-only
    const match = rows.find(r => r.dow === todayFull && r.area === s.zone)
               ?? rows.find(r => r.dow === todayFull);
    if (!match) return;
    const patch = {};
    if (match.min_earnings != null) patch.minGoalDollars   = Math.round(match.min_earnings);
    if (match.min_hours    != null) patch.minGoalHours     = match.min_hours;
    if (match.max_earnings != null) patch.stretchGoalDollars = Math.round(match.max_earnings);
    if (match.max_hours    != null) patch.stretchGoalHours   = match.max_hours;
    if (match.area != null)         patch.zone              = match.area;
    if (match.type != null)         patch.orderType         = ORDER_TYPE_MAP[match.type] ?? match.type;
    if (Object.keys(patch).length > 0) {
      setState(prev => prev.shiftStarted ? prev : { ...prev, ...patch });
    }
  }, [weeklySchedule]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load saved setup prefs from Supabase on mount; apply 12h stale check against today's schedule row
  // Also checks localStorage for a resumable shift, but only on first mount (prefsLoadKey === 0).
  useEffect(() => {
    if (prefsLoadKey === 0) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved && saved.shiftDate === todayISO() && saved.shiftStarted) {
            setSavedResume(saved);
            setResumePrompt(true);
          }
        }
      } catch {
        // ignore corrupt data
      }
    }

    let cancelled = false;
    async function loadPrefs() {
      if (!supabase) return;
      const todayFull = DOW_FULL[todayDay()];
      const [prefsRes, schedRes] = await Promise.all([
        supabase
          .from('gig_tracker_prefs')
          .select('zone, min_goal_hours, min_goal_dollars, stretch_goal_hours, stretch_goal_dollars, start_time, order_type, updated_at')
          .eq('id', 'default')
          .single(),
        supabase
          .from('weekly_schedule')
          .select('*')
          .order('week_start_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const data = prefsRes.data;
      if (!data || prefsRes.error) return;

      const isStale = !data.updated_at ||
        (Date.now() - new Date(data.updated_at).getTime()) > 12 * 60 * 60 * 1000;

      let schedMatch = null;
      if (!schedRes.error && schedRes.data) {
        const rows = schedRes.data.rows || [];
        schedMatch = rows.find(r => r.dow === todayFull) ?? null;
      }

      setState(s => {
        if (s.shiftStarted) return s;
        if (isStale && schedMatch) {
          const patch = {};
          if (schedMatch.area != null)         patch.zone              = schedMatch.area;
          if (schedMatch.min_earnings != null)  patch.minGoalDollars    = Math.round(schedMatch.min_earnings);
          if (schedMatch.min_hours != null)     patch.minGoalHours      = schedMatch.min_hours;
          if (schedMatch.max_earnings != null)  patch.stretchGoalDollars = Math.round(schedMatch.max_earnings);
          if (schedMatch.max_hours != null)     patch.stretchGoalHours   = schedMatch.max_hours;
          if (schedMatch.type != null)          patch.orderType         = ORDER_TYPE_MAP[schedMatch.type] ?? schedMatch.type;
          return { ...s, ...patch };
        }
        return {
          ...s,
          zone:               data.zone               ?? s.zone,
          minGoalHours:       Number(data.min_goal_hours)    || s.minGoalHours,
          minGoalDollars:     Number(data.min_goal_dollars)  || s.minGoalDollars,
          stretchGoalHours:   Number(data.stretch_goal_hours)   || s.stretchGoalHours,
          stretchGoalDollars: Number(data.stretch_goal_dollars) || s.stretchGoalDollars,
          ...(data.start_time != null && { startTime: data.start_time }),
          ...(data.order_type != null && { orderType: data.order_type }),
        };
      });
    }
    loadPrefs();
    return () => { cancelled = true; };
  }, [prefsLoadKey]);

  // Fetch zone benchmarks and latest weekly schedule from Supabase on mount
  useEffect(() => {
    let cancelled = false;
    async function loadBenchmarks() {
      if (!supabase) return;
      const [benchRes, schedRes] = await Promise.all([
        supabase.from('zone_benchmarks').select('*'),
        supabase.from('weekly_schedule').select('*').order('week_start_date', { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (cancelled) return;
      if (!benchRes.error && benchRes.data?.length > 0) {
        const lookup = {};
        for (const row of benchRes.data) {
          if (!lookup[row.zone]) lookup[row.zone] = {};
          lookup[row.zone][row.day] = {
            eph: Number(row.eph),
            tripMins: Number(row.trip_mins),
            miles: Number(row.miles),
            perOrderAvg: row.per_order_avg != null ? Number(row.per_order_avg) : null,
          };
        }
        setZoneData(lookup);
      } else {
        console.warn('GigTracker: using hardcoded fallback zone data');
      }
      if (!schedRes.error && schedRes.data) {
        setWeeklySchedule(schedRes.data);
      }
    }
    loadBenchmarks();
    return () => { cancelled = true; };
  }, []);

  // Live clock — 1s tick (display only, not EPH)
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // EPH + ordersPerHour snapshot — refreshes every 15 minutes
  useEffect(() => {
    const id = setInterval(() => {
      const s = stateRef.current;
      if (s.shiftStarted && s.startTime) {
        const totalBreak = s.breakMinutes + (s.breakRunning && s.breakStartMs ? (Date.now() - s.breakStartMs) / 60000 : 0);
        const elapsed = computeElapsedMinutes(s.startTime, totalBreak);
        const elapsedHrs = elapsed / 60;
        const log = s.orderLog ?? [];
        // ordersPerHour is captured here — do NOT update lastOrderEph in this interval
        setState(prev => ({
          ...prev,
          ephElapsedMinutes: elapsed,
          ordersPerHour: elapsedHrs > 0 && log.length > 0 ? log.length / elapsedHrs : 0,
        }));
      }
    }, 15 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // ETA auto-refresh every 5 minutes
  useEffect(() => {
    const id = setInterval(() => {
      const s = stateRef.current;
      if (s.shiftStarted && s.startTime) {
        setState(prev => ({ ...prev, etaAnchorMs: Date.now() }));
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Persist every state change (only while a shift is active)
  useEffect(() => {
    if (!state.shiftStarted) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  function update(partial) {
    setState(s => ({ ...s, ...partial }));
  }

  function startShift() {
    const totalBreak = state.breakMinutes + (state.breakRunning && state.breakStartMs ? (Date.now() - state.breakStartMs) / 60000 : 0);
    const elapsed = computeElapsedMinutes(state.startTime, totalBreak);
    update({ shiftStarted: true, setupCollapsed: true, shiftDate: todayISO(), ephElapsedMinutes: elapsed, etaAnchorMs: Date.now() });
    setResumePrompt(false);
    if (supabase) {
      supabase.from('gig_tracker_prefs').upsert({
        id:                   'default',
        zone:                 state.zone,
        start_time:           state.startTime,
        min_goal_hours:       Number(state.minGoalHours) || 0,
        min_goal_dollars:     Number(state.minGoalDollars) || 0,
        stretch_goal_hours:   Number(state.stretchGoalHours) || 0,
        stretch_goal_dollars: Number(state.stretchGoalDollars) || 0,
        order_type:           state.orderType,
        updated_at:           new Date().toISOString(),
      }).then(({ error }) => {
        if (error) console.error('[Supabase upsert error]', error.message);
      });
    }
  }

  function addOrder(platform, amountStr) {
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) return;

    // Capture EPH as it was just before this order changes the totals (live calc, not snapshot)
    const existingCombined = state.orderLog.reduce((s, o) => s + o.amount, 0);
    const totalBreak = state.breakMinutes + (state.breakRunning && state.breakStartMs ? (Date.now() - state.breakStartMs) / 60000 : 0);
    const currentElapsed = computeElapsedMinutes(state.startTime, totalBreak);
    const currentElapsedHours = currentElapsed / 60;
    const capturedEph = currentElapsedHours > 0 ? existingCombined / currentElapsedHours : 0;

    const platformLabel = platform === 'ue' ? 'UberEats' : 'DoorDash';
    const newOrder = { id: Date.now(), platform: platformLabel, amount, timestamp: new Date().toISOString(), eph: Math.round(capturedEph * 100) / 100 };
    const newLog = [...state.orderLog, newOrder];
    const newCombined = newLog.reduce((s, o) => s + o.amount, 0);

    const newEph = currentElapsed > 0 ? newCombined / (currentElapsed / 60) : 0;
    const dayIndex = DAYS.indexOf(state.day);
    const zd = zoneDataRef.current;
    const dayMax = zd
      ? (Math.max(...ZONES.map(z => zd?.[z]?.[state.day]?.eph ?? 0)) || (DAY_MAX_EPH[dayIndex] ?? 22))
      : (DAY_MAX_EPH[dayIndex] ?? 22);
    const newStrikes = newEph >= dayMax ? Math.max(0, state.strikes - 1) : state.strikes;

    setState(s => ({
      ...s,
      orderLog: newLog,
      ephElapsedMinutes: currentElapsed,
      etaAnchorMs: Date.now(),
      strikes: newStrikes,
      lastOrderEph: capturedEph,
    }));

    if (platform === 'ue') { setUeInputOpen(false); setUeInputValue(''); }
    else { setDdInputOpen(false); setDdInputValue(''); }
  }

  function removeOrder(id) {
    // Capture EPH before removal — only this function (and editOrder/addOrder) may update lastOrderEph
    const existingCombined = state.orderLog.reduce((s, o) => s + o.amount, 0);
    const totalBreak = state.breakMinutes + (state.breakRunning && state.breakStartMs ? (Date.now() - state.breakStartMs) / 60000 : 0);
    const currentElapsed = computeElapsedMinutes(state.startTime, totalBreak);
    const currentElapsedHours = currentElapsed / 60;
    const capturedEph = currentElapsedHours > 0 ? existingCombined / currentElapsedHours : 0;

    setState(s => ({
      ...s,
      orderLog: s.orderLog.filter(o => o.id !== id),
      ephElapsedMinutes: currentElapsed,
      etaAnchorMs: Date.now(),
      lastOrderEph: capturedEph,
    }));
  }

  function editOrder(id, newAmountStr) {
    const newAmount = parseFloat(newAmountStr);
    if (isNaN(newAmount) || newAmount <= 0) return;

    // Capture EPH before the edit — only this function (and removeOrder/addOrder) may update lastOrderEph
    const existingCombined = state.orderLog.reduce((s, o) => s + o.amount, 0);
    const totalBreak = state.breakMinutes + (state.breakRunning && state.breakStartMs ? (Date.now() - state.breakStartMs) / 60000 : 0);
    const currentElapsed = computeElapsedMinutes(state.startTime, totalBreak);
    const currentElapsedHours = currentElapsed / 60;
    const capturedEph = currentElapsedHours > 0 ? existingCombined / currentElapsedHours : 0;

    setState(s => ({
      ...s,
      orderLog: s.orderLog.map(o => o.id === id ? { ...o, amount: newAmount } : o),
      ephElapsedMinutes: currentElapsed,
      etaAnchorMs: Date.now(),
      lastOrderEph: capturedEph,
    }));
    setEditingOrderId(null);
    setEditingValue('');
  }

  // Destructure for derived calcs
  const {
    shiftStarted, startTime, zone, day, breakMinutes, breakRunning, breakStartMs,
    orderLog, ephElapsedMinutes, etaAnchorMs, strikes, setupCollapsed, statsCollapsed, orderLogCollapsed,
    lastOrderEph, orderType, ordersPerHour,
  } = state;
  // Coerce to numbers for calculations; state values may be '' while the user is typing
  const minGoalHours = Number(state.minGoalHours) || 0;
  const minGoalDollars = Number(state.minGoalDollars) || 0;
  const stretchGoalHours = Number(state.stretchGoalHours) || 0;
  const stretchGoalDollars = Number(state.stretchGoalDollars) || 0;

  // Live elapsed time — used for the clock display and goal timing only
  // Includes any in-progress break so the clock pauses while on break
  let elapsedMinutes = 0;
  if (shiftStarted && startTime) {
    const [h, m] = startTime.split(':').map(Number);
    const startDate = new Date(now);
    startDate.setHours(h, m, 0, 0);
    if (startDate > now) startDate.setDate(startDate.getDate() - 1);
    const liveBreak = Number(breakMinutes) + (breakRunning && breakStartMs ? (now.getTime() - breakStartMs) / 60000 : 0);
    elapsedMinutes = Math.max(0, (now - startDate) / 60000 - liveBreak);
  }
  const elapsedHours = elapsedMinutes / 60;

  const safeLog = orderLog ?? [];
  const ueOrders = safeLog.filter(o => o.platform === 'UberEats');
  const ddOrders = safeLog.filter(o => o.platform === 'DoorDash');
  const ueTotal = ueOrders.reduce((s, o) => s + o.amount, 0);
  const ddTotal = ddOrders.reduce((s, o) => s + o.amount, 0);
  const combined = ueTotal + ddTotal;
  const totalOrders = safeLog.length;

  // EPH uses snapshotted elapsed time — only updates on order add/remove or 15-min tick
  const ephElapsedHours = ephElapsedMinutes / 60;
  const eph = ephElapsedHours > 0 ? combined / ephElapsedHours : 0;

  const ephOrders = safeLog.filter(o => o.eph != null);
  const lastEphEntry = ephOrders.length > 0 ? ephOrders[ephOrders.length - 1] : null;
  const prevEphEntry = ephOrders.length > 1 ? ephOrders[ephOrders.length - 2] : null;

  const dayIndex = DAYS.indexOf(day);
  // Prefer Supabase-fetched data; fall back to hardcoded constants if fetch failed or pending
  const zoneEPH = zoneData?.[zone]?.[day]?.eph ?? ZONE_EPH[zone]?.[day] ?? 20;
  const dayMax = zoneData
    ? (Math.max(...ZONES.map(z => zoneData?.[z]?.[day]?.eph ?? 0)) || (DAY_MAX_EPH[dayIndex] ?? 22))
    : (DAY_MAX_EPH[dayIndex] ?? 22);
  const allZoneEphs = zoneData
    ? ZONES.map(z => zoneData[z]?.[day]?.eph).filter(Boolean)
    : ZONES.map(z => ZONE_EPH[z]?.[day]).filter(Boolean);
  const zoneAvgEph = allZoneEphs.length > 0
    ? allZoneEphs.reduce((a, b) => a + b, 0) / allZoneEphs.length
    : 0;
  const midpoint = (zoneEPH + dayMax) / 2;

  const avgTripMins = zoneData?.[zone]?.[day]?.tripMins ?? ZONE_TRIP_MINS[zone]?.[day] ?? 30;
  const avgMiles = zoneData?.[zone]?.[day]?.miles ?? ZONE_MILES[zone]?.[day] ?? 10;
  const orderMin = zoneEPH * (avgTripMins / 60);

  const perOrderPay = totalOrders > 0 ? combined / totalOrders : 0;

  const minDollarLeft = Math.max(0, minGoalDollars - combined);
  const stretchDollarLeft = Math.max(0, stretchGoalDollars - combined);
  const minTimeLeft = Math.max(0, minGoalHours * 60 - elapsedMinutes);
  const stretchTimeLeft = Math.max(0, stretchGoalHours * 60 - elapsedMinutes);

  const minOrdersLeft = orderMin > 0 ? Math.ceil(minDollarLeft / orderMin) : 0;
  const stretchOrdersLeft = orderMin > 0 ? Math.ceil(stretchDollarLeft / orderMin) : 0;

  const avgOrderValue = totalOrders > 0 ? combined / totalOrders : 8;
  const minOrdersEstimate = minDollarLeft > 0 ? Math.ceil(minDollarLeft / avgOrderValue) : 0;
  const stretchOrdersEstimate = stretchDollarLeft > 0 ? Math.ceil(stretchDollarLeft / avgOrderValue) : 0;

  // Base start timestamp — derived from startTime string, not from the live `now`
  let shiftStartMs = 0;
  if (shiftStarted && startTime) {
    const [sh, sm] = startTime.split(':').map(Number);
    const sd = new Date();
    sd.setHours(sh, sm, 0, 0);
    if (sd > new Date()) sd.setDate(sd.getDate() - 1);
    shiftStartMs = sd.getTime();
  }

  // ETAs anchored to snapshotted wall-clock time — only update on order add/remove or 5-min tick
  const minETA = eph > 0 && minDollarLeft > 0
    ? new Date(etaAnchorMs + (minDollarLeft / eph) * 3600000)
    : null;
  const stretchETA = eph > 0 && stretchDollarLeft > 0
    ? new Date(etaAnchorMs + (stretchDollarLeft / eph) * 3600000)
    : null;

  // Overall ETA: defaults to min goal mark, flips to stretch goal once min is cleared
  const overallETA = shiftStartMs > 0
    ? new Date(shiftStartMs + (elapsedHours < minGoalHours ? minGoalHours : stretchGoalHours) * 3600000)
    : null;

  const stretchGoalHit = shiftStarted && combined >= stretchGoalDollars && elapsedHours >= stretchGoalHours;

  // Green >= dayMax, Amber >= midpoint, Red < midpoint
  const ephColor = eph >= dayMax
    ? 'text-green-400'
    : eph >= midpoint
      ? 'text-amber-400'
      : 'text-red-400';

  // Warning banner — highest priority wins
  let warning = null;
  if (shiftStarted && combined > 0) {
    if (strikes >= 3 && eph < zoneEPH) {
      warning = { type: 'red', msg: '⚠ Stop dashing — business is slow' };
    } else if (minTimeLeft <= 0 && minDollarLeft <= 0 && strikes >= 3) {
      warning = { type: 'amber', msg: '✓ Min goals hit — consider stopping' };
    } else if (minTimeLeft <= 0 && eph < zoneEPH) {
      warning = { type: 'amber', msg: '⚠ Time goal met but EPH is lagging' };
    }
  }

  // Break stopwatch display (updates via live `now`)
  const breakElapsedSecs = breakRunning && breakStartMs
    ? Math.floor((now.getTime() - breakStartMs) / 1000)
    : 0;
  const breakTimerDisplay = `${String(Math.floor(breakElapsedSecs / 60)).padStart(2, '0')}:${String(breakElapsedSecs % 60).padStart(2, '0')}`;

  // ── Schedule paste helpers ────────────────────────────────────────────────

  function parsePastedSchedule(text) {
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) return null;

    function parseTime(val) {
      if (val == null) return null;
      const s = String(val).trim();
      if (!s) return null;
      // "5:00 PM" / "11:30 AM" (Excel renders times in 12h format on paste)
      const ampm = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (ampm) {
        let h = parseInt(ampm[1], 10);
        const m = parseInt(ampm[2], 10);
        if (/pm/i.test(ampm[3])) { if (h !== 12) h += 12; }
        else { if (h === 12) h = 0; }
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      }
      // "17:30" — already 24h
      const hhmm = s.match(/^(\d{1,2}):(\d{2})$/);
      if (hhmm) return `${String(parseInt(hhmm[1])).padStart(2,'0')}:${hhmm[2]}`;
      // Excel time fraction (0–1), e.g. 0.7708 = 18:30
      const n = parseFloat(s);
      if (!isNaN(n) && n > 0 && n < 1) {
        const totalMin = Math.round(n * 1440);
        const h = Math.floor(totalMin / 60) % 24;
        const m = totalMin % 60;
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      }
      return null;
    }

    function parseMoney(val) {
      if (val == null) return null;
      const s = String(val).trim().replace(/[$,]/g, '');
      if (s === '') return null;
      const n = parseFloat(s);
      return isNaN(n) ? null : n;
    }

    const parsed = lines.map(line => {
      const cols = line.split('\t');
      return {
        lob:          cols[0] != null && cols[0] !== '' ? parseFloat(cols[0]) : null,
        dow:          cols[1]?.trim() || null,
        area:         cols[2]?.trim() || null,
        earliest:     parseTime(cols[3]),
        latest:       parseTime(cols[4]),
        type:         cols[5]?.trim() || null,
        min_earnings: parseMoney(cols[6]),
        min_hours:    parseMoney(cols[7]),
        max_earnings: parseMoney(cols[8]),
        max_hours:    parseMoney(cols[9]),
      };
    });

    const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return WEEK_DAYS.map(dow =>
      parsed.find(r => r.dow === dow) ?? {
        lob: null, dow, area: null, earliest: null, latest: null,
        type: null, min_earnings: null, min_hours: null, max_earnings: null, max_hours: null,
      }
    );
  }

  function getThisWeekStart() {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().slice(0, 10);
  }

  async function confirmPastedSchedule() {
    if (!schedulePreview || !supabase) return;
    setScheduleUpsertStatus('saving');
    const record = {
      week_start_date: getThisWeekStart(),
      rows: schedulePreview,
      source_label: 'paste-ui',
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from('weekly_schedule')
      .upsert(record, { onConflict: 'week_start_date' });
    if (error) {
      console.error('[weekly_schedule upsert]', error.message);
      setScheduleUpsertStatus('error');
    } else {
      setWeeklySchedule(record);
      setSchedulePasteOpen(false);
      setSchedulePasteText('');
      setSchedulePreview(null);
      setScheduleUpsertStatus('ok');
      setTimeout(() => setScheduleUpsertStatus(null), 3000);
    }
  }

  // Shift Setup section — rendered at top (pre-shift) or bottom (active shift)
  const shiftSetupSection = (
    <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      <button
        onClick={() => update({ setupCollapsed: !setupCollapsed })}
        className="w-full flex items-center justify-between px-4 py-3 min-h-[48px]"
      >
        <span className="text-sm font-semibold text-zinc-200">Shift Setup</span>
        {setupCollapsed
          ? <ChevronDown size={16} className="text-zinc-500" />
          : <ChevronUp size={16} className="text-zinc-500" />}
      </button>

      {!setupCollapsed && (
        <div className="px-4 pb-5 space-y-4 border-t border-zinc-800">
          <div className="grid grid-cols-2 gap-3 pt-4">
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Start Time</label>
              <input
                type="time"
                value={startTime}
                onChange={e => update({ startTime: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 min-h-[44px] outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Day</label>
              <select
                value={day}
                onChange={e => update({ day: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 min-h-[44px] outline-none focus:border-zinc-500"
              >
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Zone</label>
            <select
              value={zone}
              onChange={e => update({ zone: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 min-h-[44px] outline-none focus:border-zinc-500"
            >
              {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Min Goal</label>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 min-h-[44px]">
                <span className="text-zinc-500 text-xs shrink-0">hrs</span>
                <input
                  type="number" min="0" step="0.5" inputMode="decimal"
                  value={state.minGoalHours}
                  onChange={e => { const v = e.target.value; update({ minGoalHours: v === '' ? '' : parseFloat(v) || 0 }); }}
                  className="flex-1 bg-transparent text-sm text-zinc-100 outline-none min-w-0"
                />
              </div>
              <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 min-h-[44px]">
                <span className="text-zinc-500 text-xs shrink-0">$</span>
                <input
                  type="number" min="0" inputMode="decimal"
                  value={state.minGoalDollars}
                  onChange={e => { const v = e.target.value; update({ minGoalDollars: v === '' ? '' : parseFloat(v) || 0 }); }}
                  className="flex-1 bg-transparent text-sm text-zinc-100 outline-none min-w-0"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Stretch Goal</label>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 min-h-[44px]">
                <span className="text-zinc-500 text-xs shrink-0">hrs</span>
                <input
                  type="number" min="0" step="0.5" inputMode="decimal"
                  value={state.stretchGoalHours}
                  onChange={e => { const v = e.target.value; update({ stretchGoalHours: v === '' ? '' : parseFloat(v) || 0 }); }}
                  className="flex-1 bg-transparent text-sm text-zinc-100 outline-none min-w-0"
                />
              </div>
              <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 min-h-[44px]">
                <span className="text-zinc-500 text-xs shrink-0">$</span>
                <input
                  type="number" min="0" inputMode="decimal"
                  value={state.stretchGoalDollars}
                  onChange={e => { const v = e.target.value; update({ stretchGoalDollars: v === '' ? '' : parseFloat(v) || 0 }); }}
                  className="flex-1 bg-transparent text-sm text-zinc-100 outline-none min-w-0"
                />
              </div>
            </div>
          </div>

          {/* This Week's Schedule */}
          <div className="rounded-xl border border-zinc-800 overflow-hidden">
            <button
              onClick={() => setScheduleCollapsed(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2.5 min-h-[44px] bg-zinc-800"
            >
              <span className="text-xs font-semibold text-zinc-300">This Week&apos;s Schedule</span>
              {scheduleCollapsed
                ? <ChevronDown size={14} className="text-zinc-500" />
                : <ChevronUp size={14} className="text-zinc-500" />}
            </button>

            {!scheduleCollapsed && (
              <div className="px-3 pb-3 pt-2 space-y-3">
                {weeklySchedule ? (
                  <>
                    <div className="text-xs text-zinc-500">
                      Week of {weeklySchedule.week_start_date} &middot; Updated {new Date(weeklySchedule.updated_at).toLocaleDateString()}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="text-xs w-full min-w-[480px]">
                        <thead>
                          <tr className="text-zinc-500 border-b border-zinc-700">
                            <th className="text-left py-1 pr-2 font-medium">Day</th>
                            <th className="text-left py-1 pr-2 font-medium">Zone</th>
                            <th className="text-left py-1 pr-2 font-medium">Type</th>
                            <th className="text-left py-1 pr-2 font-medium">Min$</th>
                            <th className="text-left py-1 pr-2 font-medium">Min hrs</th>
                            <th className="text-left py-1 pr-2 font-medium">Max$</th>
                            <th className="text-left py-1 font-medium">Max hrs</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(weeklySchedule.rows || []).map((row, i) => (
                            <tr key={i} className="border-b border-zinc-800 last:border-0">
                              <td className="py-1 pr-2 text-zinc-200 font-medium">{row.dow || '—'}</td>
                              <td className="py-1 pr-2 text-zinc-300">{row.area || '—'}</td>
                              <td className="py-1 pr-2 text-zinc-400">{row.type || '—'}</td>
                              <td className="py-1 pr-2 text-zinc-300 tabular-nums">{row.min_earnings != null ? `$${row.min_earnings.toFixed(0)}` : '—'}</td>
                              <td className="py-1 pr-2 text-zinc-300 tabular-nums">{row.min_hours != null ? row.min_hours : '—'}</td>
                              <td className="py-1 pr-2 text-zinc-300 tabular-nums">{row.max_earnings != null ? `$${row.max_earnings.toFixed(0)}` : '—'}</td>
                              <td className="py-1 text-zinc-300 tabular-nums">{row.max_hours != null ? row.max_hours : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-zinc-500">No schedule loaded yet.</div>
                )}

                {scheduleUpsertStatus === 'ok' && (
                  <div className="text-xs text-green-400">✓ Schedule saved.</div>
                )}
                {scheduleUpsertStatus === 'error' && (
                  <div className="text-xs text-red-400">Save failed — check console.</div>
                )}

                {!schedulePasteOpen ? (
                  <button
                    onClick={() => { setSchedulePasteOpen(true); setSchedulePreview(null); setSchedulePasteText(''); }}
                    className="w-full text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-lg py-2 min-h-[36px] transition-colors"
                  >
                    Paste new schedule
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="text-xs text-zinc-500">
                      In Excel, select AX3:BG9 on the Scheduling tab, copy, then paste below.
                    </div>
                    <textarea
                      rows={8}
                      value={schedulePasteText}
                      onChange={e => {
                        setSchedulePasteText(e.target.value);
                        const parsed = parsePastedSchedule(e.target.value);
                        setSchedulePreview(parsed?.length > 0 ? parsed : null);
                      }}
                      placeholder="Paste tab-delimited rows here…"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none focus:border-zinc-500 font-mono resize-none"
                    />

                    {schedulePreview && (
                      <div className="overflow-x-auto">
                        <div className="text-xs text-zinc-500 mb-1">Preview ({schedulePreview.length} rows):</div>
                        <table className="text-xs w-full min-w-[480px]">
                          <thead>
                            <tr className="text-zinc-500 border-b border-zinc-700">
                              <th className="text-left py-1 pr-2">Day</th>
                              <th className="text-left py-1 pr-2">Zone</th>
                              <th className="text-left py-1 pr-2">Type</th>
                              <th className="text-left py-1 pr-2">Min$</th>
                              <th className="text-left py-1 pr-2">Min hrs</th>
                              <th className="text-left py-1 pr-2">Max$</th>
                              <th className="text-left py-1">Max hrs</th>
                            </tr>
                          </thead>
                          <tbody>
                            {schedulePreview.map((row, i) => (
                              <tr key={i} className="border-b border-zinc-800 last:border-0">
                                <td className="py-1 pr-2 text-zinc-200">{row.dow || '—'}</td>
                                <td className="py-1 pr-2 text-zinc-300">{row.area || '—'}</td>
                                <td className="py-1 pr-2 text-zinc-400">{row.type || '—'}</td>
                                <td className="py-1 pr-2 text-zinc-300 tabular-nums">{row.min_earnings != null ? `$${row.min_earnings.toFixed(0)}` : '—'}</td>
                                <td className="py-1 pr-2 text-zinc-300 tabular-nums">{row.min_hours != null ? row.min_hours : '—'}</td>
                                <td className="py-1 pr-2 text-zinc-300 tabular-nums">{row.max_earnings != null ? `$${row.max_earnings.toFixed(0)}` : '—'}</td>
                                <td className="py-1 text-zinc-300 tabular-nums">{row.max_hours != null ? row.max_hours : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={confirmPastedSchedule}
                        disabled={!schedulePreview || scheduleUpsertStatus === 'saving'}
                        className="flex-1 bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-xs font-medium rounded-lg py-2 min-h-[36px] transition-colors"
                      >
                        {scheduleUpsertStatus === 'saving' ? 'Saving…' : 'Confirm & Save'}
                      </button>
                      <button
                        onClick={() => { setSchedulePasteOpen(false); setSchedulePasteText(''); setSchedulePreview(null); }}
                        className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs px-4 rounded-lg min-h-[36px] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {!shiftStarted && (
            <button
              onClick={startShift}
              className="w-full bg-green-700 hover:bg-green-600 active:bg-green-800 text-white font-semibold rounded-xl py-3.5 min-h-[52px] text-sm transition-colors mt-2"
            >
              Start Shift
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <TopNav />

      {/* Hamburger button — fixed in top-right nav area */}
      <button
        onClick={() => setHamburgerOpen(true)}
        className="fixed top-3 right-4 z-40 p-2 rounded-lg bg-zinc-900/90 border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors flex items-center justify-center"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {/* Hamburger panel — slides in from right */}
      {hamburgerOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60"
            onClick={() => setHamburgerOpen(false)}
          />
          <div className="fixed top-0 right-0 h-full w-72 z-50 bg-zinc-900 border-l border-zinc-800 flex flex-col rounded-l-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-800">
              <span className="text-sm font-semibold text-zinc-200">Menu</span>
              <button
                onClick={() => setHamburgerOpen(false)}
                className="p-2 text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pt-4 space-y-4">
              <div>
                <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">Break Timer</div>
                {!shiftStarted ? (
                  <p className="text-xs text-zinc-500">Start a shift to use the break timer.</p>
                ) : breakRunning && breakStartMs ? (
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs text-zinc-500 mb-1">On break</div>
                      <div className="text-3xl font-bold tabular-nums text-amber-400">{breakTimerDisplay}</div>
                    </div>
                    <button
                      onClick={() => {
                        const elapsedBreakMs = Date.now() - breakStartMs;
                        update({ breakRunning: false, breakStartMs: null, breakMinutes: breakMinutes + elapsedBreakMs / 60000 });
                      }}
                      className="w-full bg-amber-900 hover:bg-amber-800 border border-amber-700 text-amber-300 text-sm font-semibold py-3 rounded-lg min-h-[44px] transition-colors"
                    >
                      End Break
                    </button>
                    {breakMinutes > 0 && (
                      <div className="text-xs text-zinc-500">Total break: {Math.round(breakMinutes)} min</div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <button
                      onClick={() => update({ breakRunning: true, breakStartMs: Date.now() })}
                      className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-semibold rounded-lg py-3 min-h-[44px] transition-colors"
                    >
                      Take Break
                    </button>
                    {breakMinutes > 0 && (
                      <div className="text-xs text-zinc-500">Total break: {Math.round(breakMinutes)} min</div>
                    )}
                  </div>
                )}
              </div>

              {shiftStarted && (
                <div className="pb-2">
                  <div className="text-xs text-zinc-600 mb-2">Danger zone</div>
                  <button
                    onClick={() => {
                      if (window.confirm('Reset shift? This clears all orders and earnings.')) {
                        setHamburgerOpen(false);
                        localStorage.removeItem(STORAGE_KEY);
                        setState(getDefaultState());
                        setPrefsLoadKey(k => k + 1);
                      }
                    }}
                    className="w-full bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-3 rounded-lg min-h-[44px] transition-colors"
                  >
                    Reset Shift
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <main className="max-w-lg mx-auto px-4 pb-10">

        {/* Resume banner */}
        {resumePrompt && (
          <div className="mt-4 rounded-xl border border-zinc-700 bg-zinc-900 p-4 flex items-center justify-between gap-3">
            <span className="text-sm text-zinc-300">Resume today&apos;s shift?</span>
            <div className="flex gap-2">
              <button
                onClick={() => { setState({ ...getDefaultState(), ...savedResume }); setResumePrompt(false); }}
                className="rounded-lg bg-green-700 hover:bg-green-600 px-4 py-2 text-sm font-medium text-white min-h-[40px] transition-colors"
              >
                Resume
              </button>
              <button
                onClick={() => {
                  // Clear localStorage so this prompt doesn't reappear on next load
                  localStorage.removeItem(STORAGE_KEY);
                  setResumePrompt(false);
                }}
                className="rounded-lg bg-zinc-700 hover:bg-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 min-h-[40px] transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {/* Warning banner */}
        {warning && (
          <div className={`mt-4 rounded-xl px-4 py-3 text-sm font-medium ${
            warning.type === 'red'
              ? 'bg-red-950 border border-red-700 text-red-300'
              : 'bg-amber-950 border border-amber-700 text-amber-300'
          }`}>
            {warning.msg}
          </div>
        )}

        {/* Stretch goal hit banner */}
        {stretchGoalHit && (
          <div className="mt-4 rounded-xl px-4 py-3 text-sm font-medium bg-green-950 border border-green-700 text-green-300">
            ✓ Stretch goal hit — great night, consider wrapping up!
          </div>
        )}

        {/* Shift Setup — at TOP only when shift not yet started */}
        {!shiftStarted && shiftSetupSection}

        {/* ── Live Dashboard ── */}
        {shiftStarted && (
          <>
            {/* Elapsed / Done by card */}
            <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Elapsed</div>
                  <div className="text-2xl font-bold text-zinc-100 tabular-nums">
                    {fmtDuration(elapsedMinutes)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-zinc-500 mb-1">Done by</div>
                  {eph === 0 ? (
                    <div className="text-2xl font-bold text-zinc-600">—</div>
                  ) : stretchTimeLeft <= 0 ? (
                    <div className="text-2xl font-bold text-green-400">Done</div>
                  ) : (
                    <>
                      <div className="text-2xl font-bold text-zinc-100 tabular-nums">
                        {overallETA ? fmtTime(overallETA) : '—'}
                      </div>
                      <div className="text-xs text-zinc-600 mt-0.5">
                        {elapsedHours < minGoalHours
                          ? `min goal (${minGoalHours}h)`
                          : `stretch goal (${stretchGoalHours}h)`}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="border-t border-zinc-800 mt-3 pt-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className={`text-sm font-medium ${minTimeLeft <= 0 ? 'text-green-400' : 'text-zinc-300'}`}>
                    {minTimeLeft <= 0 ? '✓ Min goal' : `→ Min  ${fmtDuration(minTimeLeft)}`}
                  </div>
                  <div className={`text-sm font-medium text-right ${stretchTimeLeft <= 0 ? 'text-green-400' : 'text-zinc-300'}`}>
                    {stretchTimeLeft <= 0 ? 'Stretch goal ✓' : `${fmtDuration(stretchTimeLeft)}  Stretch →`}
                  </div>
                </div>
              </div>
            </div>

            {/* EPH card — split */}
            <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-zinc-500 mb-2">Current EPH</div>
                  <div className={`text-4xl font-bold tabular-nums ${ephElapsedHours > 0.01 ? ephColor : 'text-zinc-600'}`}>
                    {ephElapsedHours > 0.01 ? fmtMoney(eph) : '—'}
                    {ephElapsedHours > 0.01 && (
                      <span className="text-xl font-normal text-zinc-500">/hr</span>
                    )}
                  </div>
                  {lastEphEntry && (
                    <div className="text-xs text-zinc-400 mt-1">
                      {prevEphEntry ? (
                        <>
                          {'Last: $'}{lastEphEntry.eph.toFixed(2)}{' '}
                          <span className={
                            lastEphEntry.eph > prevEphEntry.eph ? 'text-green-400'
                            : lastEphEntry.eph < prevEphEntry.eph ? 'text-red-400'
                            : 'text-zinc-400'
                          }>
                            {lastEphEntry.eph > prevEphEntry.eph ? '↑' : lastEphEntry.eph < prevEphEntry.eph ? '↓' : '→'}
                          </span>
                          {'  ·  Prev: $'}{prevEphEntry.eph.toFixed(2)}
                        </>
                      ) : (
                        `Last: $${lastEphEntry.eph.toFixed(2)}`
                      )}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-xs text-zinc-500 mb-2">Total Earnings</div>
                  <div className="text-4xl font-bold tabular-nums text-zinc-100">
                    {fmtMoney(combined)}
                  </div>
                </div>
              </div>
              <div className="border-t border-zinc-800 mt-3 pt-3 flex items-center gap-2 flex-wrap text-xs text-zinc-400">
                <span>Zone avg ${zoneAvgEph.toFixed(2)}</span>
                <span className="text-zinc-700">·</span>
                <span>Max ${dayMax.toFixed(2)}</span>
              </div>

              {(minGoalDollars > 0 || stretchGoalDollars > 0) && (
                <div className="border-t border-zinc-800 mt-3 pt-3 space-y-1">
                  {minGoalDollars > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-zinc-500 w-16 shrink-0">Min</span>
                      <span className="text-zinc-400 tabular-nums">${minGoalDollars}</span>
                      <span className="text-zinc-700">·</span>
                      {combined >= minGoalDollars
                        ? <span className="text-green-400">✓ Hit</span>
                        : <span className="text-amber-400">${minDollarLeft.toFixed(0)} remaining</span>}
                    </div>
                  )}
                  {stretchGoalDollars > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-zinc-500 w-16 shrink-0">Stretch</span>
                      <span className="text-zinc-400 tabular-nums">${stretchGoalDollars}</span>
                      <span className="text-zinc-700">·</span>
                      {combined >= stretchGoalDollars
                        ? <span className="text-green-400">✓ Hit</span>
                        : <span className="text-amber-400">${stretchDollarLeft.toFixed(0)} remaining</span>}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Orders/hr + Strikes card */}
            <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Orders / hr</div>
                  <div className={`text-4xl font-bold tabular-nums ${
                    ordersPerHour === 0
                      ? 'text-zinc-600'
                      : ordersPerHour < 2 ? 'text-red-400' : 'text-green-400'
                  }`}>
                    {ordersPerHour === 0 ? '—' : ordersPerHour.toFixed(1)}
                  </div>
                </div>
                {ordersPerHour > 0 && (
                  <div className={`px-3 py-2 rounded-lg text-sm font-semibold text-right ${
                    ordersPerHour < 2
                      ? 'bg-red-950 border border-red-800 text-red-300'
                      : 'bg-green-950 border border-green-800 text-green-300'
                  }`}>
                    <div>{ordersPerHour < 2 ? 'Below 2/hr' : 'Above 2/hr'}</div>
                    <div className="text-xs font-normal mt-0.5">
                      {ordersPerHour < 2 ? 'Accept next offer' : 'You can decline selectively'}
                    </div>
                  </div>
                )}
              </div>
              <div className="border-t border-zinc-800 mt-3 pt-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500 font-medium">Strikes</span>
                  <div className="flex gap-2">
                    {[0, 1, 2].map(i => (
                      <div
                        key={i}
                        className={`w-5 h-5 rounded-full ${i < strikes ? 'bg-red-500' : 'bg-zinc-700'}`}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => update({ strikes: Math.min(3, strikes + 1) })}
                    className="bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 text-xs font-medium px-3 rounded-lg min-h-[40px] transition-colors"
                  >
                    + Strike
                  </button>
                  <button
                    onClick={() => update({ strikes: Math.max(0, strikes - 1) })}
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs font-medium px-3 rounded-lg min-h-[40px] transition-colors"
                  >
                    - Strike
                  </button>
                </div>
              </div>
            </div>

            {/* Goal progress — Option A */}
            {(minGoalDollars > 0 || stretchGoalDollars > 0) && (
              <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
                {[
                  { label: 'Min',     goalDollars: minGoalDollars,     dollarLeft: minDollarLeft,     ordersLeft: minOrdersEstimate,     eta: minETA },
                  { label: 'Stretch', goalDollars: stretchGoalDollars, dollarLeft: stretchDollarLeft, ordersLeft: stretchOrdersEstimate, eta: stretchETA },
                ].filter(g => g.goalDollars > 0).map(({ label, goalDollars, dollarLeft, ordersLeft, eta }) => {
                  const hit = dollarLeft <= 0;
                  const pct = Math.min(100, (combined / goalDollars) * 100);
                  return (
                    <div key={label}>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500 w-12 shrink-0">{label}</span>
                        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${hit ? 'bg-green-500' : 'bg-amber-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-zinc-400 tabular-nums">${goalDollars}</span>
                      </div>
                      <div className="pl-14 mt-1 text-xs">
                        {hit ? (
                          <span className="text-green-400 font-medium">✓ Hit</span>
                        ) : (
                          <span className="text-zinc-400">
                            <span className="text-amber-400 tabular-nums">${dollarLeft.toFixed(0)} left</span>
                            <span className="text-zinc-700"> · </span>
                            <span>~{ordersLeft} orders</span>
                            <span className="text-zinc-700"> · </span>
                            <span>{eph > 0 && eta ? fmtTime(eta) : '—'}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Order guidance strip */}
            <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-xs text-zinc-500">Order Min</div>
                  <div className="text-lg font-bold text-zinc-200 tabular-nums">${Math.round(orderMin)}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500">Miles Max</div>
                  <div className="text-lg font-bold text-zinc-200 tabular-nums">{Math.round(avgMiles)}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500">Avg Trip</div>
                  <div className="text-lg font-bold text-zinc-200 tabular-nums">{Math.round(avgTripMins)}m</div>
                </div>
              </div>
              <div className="border-t border-zinc-800 pt-3 text-center">
                <div className="text-xs text-zinc-500">Recommended</div>
                <div className="text-lg font-bold text-zinc-200">{orderType}</div>
              </div>
            </div>

            {/* Order entry — side by side */}
            <div className="mt-3 flex gap-2">
              {/* UberEats */}
              <div className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden min-w-0">
                {!ueInputOpen ? (
                  <button
                    onClick={() => setUeInputOpen(true)}
                    className="w-full flex flex-col items-center justify-center gap-1 py-4 min-h-[68px] text-sm font-semibold text-zinc-200 hover:bg-zinc-800 active:bg-zinc-700 transition-colors"
                  >
                    <Plus size={18} />
                    <span>UberEats</span>
                    <span className="text-xs font-normal text-zinc-500">Order</span>
                  </button>
                ) : (
                  <div className="p-2 flex flex-col gap-2">
                    <div className="flex items-center gap-1 bg-zinc-800 rounded-lg px-2 min-h-[44px] border border-zinc-600">
                      <span className="text-zinc-400 text-sm">$</span>
                      <input
                        type="number" min="0" step="0.01" inputMode="decimal"
                        value={ueInputValue}
                        onChange={e => setUeInputValue(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addOrder('ue', ueInputValue)}
                        autoFocus
                        placeholder="0.00"
                        className="flex-1 bg-transparent text-zinc-100 outline-none text-lg min-w-0"
                      />
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => addOrder('ue', ueInputValue)}
                        className="flex-1 bg-green-700 hover:bg-green-600 text-white font-semibold rounded-lg min-h-[40px] text-sm transition-colors"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => { setUeInputOpen(false); setUeInputValue(''); }}
                        className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 px-2 rounded-lg min-h-[40px] transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* DoorDash */}
              <div className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden min-w-0">
                {!ddInputOpen ? (
                  <button
                    onClick={() => setDdInputOpen(true)}
                    className="w-full flex flex-col items-center justify-center gap-1 py-4 min-h-[68px] text-sm font-semibold text-zinc-200 hover:bg-zinc-800 active:bg-zinc-700 transition-colors"
                  >
                    <Plus size={18} />
                    <span>DoorDash</span>
                    <span className="text-xs font-normal text-zinc-500">Order</span>
                  </button>
                ) : (
                  <div className="p-2 flex flex-col gap-2">
                    <div className="flex items-center gap-1 bg-zinc-800 rounded-lg px-2 min-h-[44px] border border-zinc-600">
                      <span className="text-zinc-400 text-sm">$</span>
                      <input
                        type="number" min="0" step="0.01" inputMode="decimal"
                        value={ddInputValue}
                        onChange={e => setDdInputValue(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addOrder('dd', ddInputValue)}
                        autoFocus
                        placeholder="0.00"
                        className="flex-1 bg-transparent text-zinc-100 outline-none text-lg min-w-0"
                      />
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => addOrder('dd', ddInputValue)}
                        className="flex-1 bg-green-700 hover:bg-green-600 text-white font-semibold rounded-lg min-h-[40px] text-sm transition-colors"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => { setDdInputOpen(false); setDdInputValue(''); }}
                        className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 px-2 rounded-lg min-h-[40px] transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Order Log */}
            {safeLog.length > 0 && (
              <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
                <button
                  onClick={() => update({ orderLogCollapsed: !orderLogCollapsed })}
                  className="w-full flex items-center justify-between px-4 py-3 min-h-[48px]"
                >
                  <span className="text-sm font-semibold text-zinc-200">
                    Order Log <span className="text-zinc-500 font-normal">({safeLog.length})</span>
                  </span>
                  {orderLogCollapsed
                    ? <ChevronDown size={16} className="text-zinc-500" />
                    : <ChevronUp size={16} className="text-zinc-500" />}
                </button>

                {!orderLogCollapsed && (
                  <div className="border-t border-zinc-800 divide-y divide-zinc-800 max-h-[400px] overflow-y-auto">
                    {[...safeLog].reverse().map(order => {
                      const isEditing = editingOrderId === order.id;
                      return (
                        <div key={order.id} className="flex items-center gap-3 px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded shrink-0 ${
                            order.platform === 'UberEats'
                              ? 'bg-green-900 text-green-300'
                              : 'bg-red-900 text-red-300'
                          }`}>
                            {order.platform === 'UberEats' ? 'UE' : 'DD'}
                          </span>
                          {isEditing ? (
                            <>
                              <div className="flex items-center gap-1 flex-1 bg-zinc-800 border border-zinc-600 rounded-lg px-2 py-1 min-w-0">
                                <span className="text-zinc-400 text-sm">$</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  inputMode="decimal"
                                  value={editingValue}
                                  onChange={e => setEditingValue(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') editOrder(order.id, editingValue);
                                    if (e.key === 'Escape') { setEditingOrderId(null); setEditingValue(''); }
                                  }}
                                  autoFocus
                                  className="flex-1 bg-transparent text-sm text-zinc-100 outline-none min-w-0"
                                />
                              </div>
                              <button
                                onClick={() => editOrder(order.id, editingValue)}
                                className="text-green-400 hover:text-green-300 transition-colors p-2.5 shrink-0"
                              >
                                <Check size={14} />
                              </button>
                              <button
                                onClick={() => { setEditingOrderId(null); setEditingValue(''); }}
                                className="text-zinc-500 hover:text-zinc-300 transition-colors p-2.5 shrink-0"
                              >
                                <X size={14} />
                              </button>
                            </>
                          ) : (
                            <>
                              <div className="flex-1 flex flex-col min-w-0">
                                <span className="text-sm font-semibold text-zinc-200 tabular-nums">
                                  {fmtMoney(order.amount)}
                                </span>
                                {order.eph != null && (
                                  <span className="text-xs text-zinc-400">${order.eph.toFixed(2)}/hr</span>
                                )}
                              </div>
                              <span className="text-xs text-zinc-500 shrink-0">
                                {fmtTime(new Date(order.timestamp))}
                              </span>
                              <button
                                onClick={() => { setEditingOrderId(order.id); setEditingValue(String(order.amount)); }}
                                className="text-zinc-600 hover:text-zinc-300 transition-colors p-2.5 shrink-0"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                onClick={() => removeOrder(order.id)}
                                className="text-zinc-600 hover:text-red-400 transition-colors p-2.5 shrink-0"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Detailed Stats */}
            <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
              <button
                onClick={() => update({ statsCollapsed: !statsCollapsed })}
                className="w-full flex items-center justify-between px-4 py-3 min-h-[48px]"
              >
                <span className="text-sm font-semibold text-zinc-200">Detailed Stats</span>
                {statsCollapsed
                  ? <ChevronDown size={16} className="text-zinc-500" />
                  : <ChevronUp size={16} className="text-zinc-500" />}
              </button>

              {!statsCollapsed && (
                <div className="px-4 pb-4 border-t border-zinc-800">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4 pt-4">
                    <StatRow label="Orders/hr" value={ordersPerHour > 0 ? ordersPerHour.toFixed(1) : '—'} />
                    <StatRow label="Per-order avg" value={totalOrders > 0 ? fmtMoney(perOrderPay) : '—'} />
                    <StatRow label="UberEats total" value={`${fmtMoney(ueTotal)} (${ueOrders.length} orders)`} />
                    <StatRow label="DoorDash total" value={`${fmtMoney(ddTotal)} (${ddOrders.length} orders)`} />
                    <StatRow label="Total orders" value={totalOrders} />
                    <StatRow label="Avg trip time" value={`${Math.round(avgTripMins)} min`} />
                  </div>

                </div>
              )}
            </div>

            {/* Shift Setup — at BOTTOM when shift is active */}
            {shiftSetupSection}
          </>
        )}

      </main>
    </div>
  );
}
