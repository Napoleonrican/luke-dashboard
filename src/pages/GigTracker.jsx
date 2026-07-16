import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Plus, X, Trash2, Edit2, Check, Menu } from 'lucide-react';
import TopNav from '../components/TopNav';
import SettingsPanel from '../components/SettingsPanel';
import { supabase } from '../lib/supabase';

const STORAGE_KEY = 'gig_tracker_state';
// Completed-shift history (crash-safe local mirror of gig_tracker_shift_history)
const HISTORY_STORAGE_KEY = 'gig_tracker_history';
// Last-used platform + strike-tracking prefs persist per-device (separate from shift state)
const LAST_PLATFORM_KEY = 'gig_tracker_last_platform';
const STRIKE_MODE_KEY = 'gig_tracker_strike_mode';
const STRIKE_THRESHOLD_KEY = 'gig_tracker_strike_threshold';
const PLATFORMS = ['UberEats', 'DoorDash'];
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
  const [orderInputOpen, setOrderInputOpen] = useState(false);
  const [orderInputValue, setOrderInputValue] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState(() => localStorage.getItem(LAST_PLATFORM_KEY) || 'UberEats');
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const [prefsLoadKey, setPrefsLoadKey] = useState(0);
  // Shift Setup now lives in a modal (opened from the menu / pre-shift card)
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  // End-of-shift recap screen; null = not showing
  const [recap, setRecap] = useState(null);

  // Strike-tracking behavior: 'manual' | 'hybrid' | 'auto' (persisted per-device)
  const [strikeMode, setStrikeMode] = useState(() => localStorage.getItem(STRIKE_MODE_KEY) || 'hybrid');
  const [strikeThreshold, setStrikeThreshold] = useState(() => parseInt(localStorage.getItem(STRIKE_THRESHOLD_KEY) || '3', 10));

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
      const [prefsRes, schedRes, activeRes] = await Promise.all([
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
        supabase
          .from('gig_tracker_active_shift')
          .select('state')
          .eq('id', 'default')
          .maybeSingle(),
      ]);
      if (cancelled) return;

      // Cross-device resume: if a durable active shift exists (and we aren't
      // already showing a local resume prompt), offer it. Prefer whichever
      // snapshot is fresher between local and remote.
      if (prefsLoadKey === 0 && !activeRes?.error && activeRes?.data?.state?.shiftStarted) {
        const remote = activeRes.data.state;
        setSavedResume(prev => {
          if (!prev) return remote;
          // keep the one with more logged orders (proxy for freshness)
          return (remote.orderLog?.length ?? 0) >= (prev.orderLog?.length ?? 0) ? remote : prev;
        });
        setResumePrompt(true);
      }
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

  // Persist every state change (only while a shift is active).
  // localStorage is the immediate crash-recovery layer; Supabase is a debounced
  // durable mirror so the in-progress shift survives across devices/reloads
  // (best-effort — silently degrades to localStorage-only if the table is absent).
  const activeShiftSyncTimer = useRef(null);
  useEffect(() => {
    if (!state.shiftStarted) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (!supabase) return;
    if (activeShiftSyncTimer.current) clearTimeout(activeShiftSyncTimer.current);
    const snapshot = state;
    activeShiftSyncTimer.current = setTimeout(() => {
      supabase
        .from('gig_tracker_active_shift')
        .upsert({ id: 'default', state: snapshot, updated_at: new Date().toISOString() })
        .then(({ error }) => { if (error) console.warn('[active_shift sync]', error.message); });
    }, 1500);
    return () => { if (activeShiftSyncTimer.current) clearTimeout(activeShiftSyncTimer.current); };
  }, [state]);

  // Clear the durable active-shift row (on end / reset / new shift start)
  function clearActiveShiftRemote() {
    if (!supabase) return;
    supabase
      .from('gig_tracker_active_shift')
      .delete()
      .eq('id', 'default')
      .then(({ error }) => { if (error) console.warn('[active_shift clear]', error.message); });
  }

  // Persist strike-tracking prefs whenever they change
  useEffect(() => { localStorage.setItem(STRIKE_MODE_KEY, strikeMode); }, [strikeMode]);
  useEffect(() => { localStorage.setItem(STRIKE_THRESHOLD_KEY, String(strikeThreshold)); }, [strikeThreshold]);

  function update(partial) {
    setState(s => ({ ...s, ...partial }));
  }

  function startShift() {
    const totalBreak = state.breakMinutes + (state.breakRunning && state.breakStartMs ? (Date.now() - state.breakStartMs) / 60000 : 0);
    const elapsed = computeElapsedMinutes(state.startTime, totalBreak);
    update({ shiftStarted: true, setupCollapsed: true, shiftDate: todayISO(), ephElapsedMinutes: elapsed, etaAnchorMs: Date.now() });
    setResumePrompt(false);
    setSetupModalOpen(false);
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

  // Save a completed shift to history (localStorage mirror + Supabase best-effort)
  function saveShiftToHistory(s) {
    if (!s.shiftStarted || (s.orderLog?.length ?? 0) === 0) return null;
    const totalBreak = Number(s.breakMinutes) + (s.breakRunning && s.breakStartMs ? (Date.now() - s.breakStartMs) / 60000 : 0);
    const durationMinutes = Math.round(computeElapsedMinutes(s.startTime, totalBreak));
    const totalEarnings = s.orderLog.reduce((sum, o) => sum + o.amount, 0);
    const totalOrders = s.orderLog.length;
    const shiftEph = durationMinutes > 0 ? totalEarnings / (durationMinutes / 60) : 0;
    const entry = {
      shift_date: s.shiftDate,
      start_time: s.startTime,
      zone: s.zone,
      duration_minutes: durationMinutes,
      total_earnings: Math.round(totalEarnings * 100) / 100,
      total_orders: totalOrders,
      eph: Math.round(shiftEph * 100) / 100,
      order_log: s.orderLog,
      saved_at: new Date().toISOString(),
    };
    try {
      const existing = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
      existing.push(entry);
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(existing));
    } catch { /* ignore */ }
    if (supabase) {
      supabase.from('gig_tracker_shift_history').insert(entry)
        .then(({ error }) => { if (error) console.warn('[shift_history insert]', error.message); });
    }
    return { durationMinutes, totalEarnings, totalOrders, shiftEph };
  }

  function handleEndShift() {
    const s = stateRef.current;
    const totalBreak = Number(s.breakMinutes) + (s.breakRunning && s.breakStartMs ? (Date.now() - s.breakStartMs) / 60000 : 0);
    const durationMinutes = Math.round(computeElapsedMinutes(s.startTime, totalBreak));
    const totalEarnings = (s.orderLog ?? []).reduce((sum, o) => sum + o.amount, 0);
    const totalOrders = (s.orderLog ?? []).length;
    const shiftEph = durationMinutes > 0 ? totalEarnings / (durationMinutes / 60) : 0;
    const ordersPerHr = durationMinutes > 0 && totalOrders > 0 ? totalOrders / (durationMinutes / 60) : 0;
    const dayIdx = DAYS.indexOf(s.day);
    const zd = zoneDataRef.current;
    const dayMaxVal = zd
      ? (Math.max(...ZONES.map(z => zd?.[z]?.[s.day]?.eph ?? 0)) || (DAY_MAX_EPH[dayIdx] ?? 22))
      : (DAY_MAX_EPH[dayIdx] ?? 22);
    const zoneEphVal = zd?.[s.zone]?.[s.day]?.eph ?? ZONE_EPH[s.zone]?.[s.day] ?? 18;

    saveShiftToHistory(s);
    clearActiveShiftRemote();
    localStorage.removeItem(STORAGE_KEY);
    setSetupModalOpen(false);
    setHamburgerOpen(false);
    setResumePrompt(false);
    setState(getDefaultState());
    setPrefsLoadKey(k => k + 1);

    if (totalOrders === 0) return; // nothing worth recapping

    setRecap({
      eph: shiftEph,
      combined: totalEarnings,
      totalOrders,
      durationMinutes,
      ordersPerHr,
      dayMax: dayMaxVal,
      zoneEPH: zoneEphVal,
      minGoalDollars: Number(s.minGoalDollars) || 0,
      minGoalHours: Number(s.minGoalHours) || 0,
      stretchGoalDollars: Number(s.stretchGoalDollars) || 0,
      stretchGoalHours: Number(s.stretchGoalHours) || 0,
    });
  }

  function addOrder(platformLabel, amountStr) {
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) return;

    const existingCombined = state.orderLog.reduce((s, o) => s + o.amount, 0);
    const totalBreak = state.breakMinutes + (state.breakRunning && state.breakStartMs ? (Date.now() - state.breakStartMs) / 60000 : 0);
    const currentElapsed = computeElapsedMinutes(state.startTime, totalBreak);
    const currentElapsedHours = currentElapsed / 60;
    const capturedEph = currentElapsedHours > 0 ? (existingCombined + amount) / currentElapsedHours : 0;

    const newOrder = { id: Date.now(), platform: platformLabel, amount, timestamp: new Date().toISOString(), eph: Math.round(capturedEph * 100) / 100 };
    const newLog = [...state.orderLog, newOrder];
    const newCombined = newLog.reduce((s, o) => s + o.amount, 0);

    const newEph = currentElapsed > 0 ? newCombined / (currentElapsed / 60) : 0;
    const dayIndex = DAYS.indexOf(state.day);
    const zd = zoneDataRef.current;
    const dayMax = zd
      ? (Math.max(...ZONES.map(z => zd?.[z]?.[state.day]?.eph ?? 0)) || (DAY_MAX_EPH[dayIndex] ?? 22))
      : (DAY_MAX_EPH[dayIndex] ?? 22);
    const zoneEphs = zd
      ? ZONES.map(z => zd[z]?.[state.day]?.eph).filter(Boolean)
      : ZONES.map(z => ZONE_EPH[z]?.[state.day]).filter(Boolean);
    const zoneAvg = zoneEphs.length > 0 ? zoneEphs.reduce((a, b) => a + b, 0) / zoneEphs.length : 0;

    // Strike adjustment depends on the selected mode:
    //  manual → no automatic change (driver uses +/− buttons)
    //  hybrid → auto-clear one strike when EPH hits the daily peak; manual add
    //  auto   → also auto-add a strike when EPH drops below the zone average
    let newStrikes = state.strikes;
    if (strikeMode === 'hybrid') {
      if (newEph >= dayMax) newStrikes = Math.max(0, state.strikes - 1);
    } else if (strikeMode === 'auto') {
      if (newEph >= dayMax) newStrikes = Math.max(0, state.strikes - 1);
      else if (newEph < zoneAvg) newStrikes = Math.min(strikeThreshold, state.strikes + 1);
    }

    setState(s => ({
      ...s,
      orderLog: newLog,
      ephElapsedMinutes: currentElapsed,
      etaAnchorMs: Date.now(),
      strikes: newStrikes,
      lastOrderEph: capturedEph,
    }));

    localStorage.setItem(LAST_PLATFORM_KEY, platformLabel);
    setSelectedPlatform(platformLabel);
    setOrderInputOpen(false);
    setOrderInputValue('');
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
    orderLog, ephElapsedMinutes, etaAnchorMs, strikes, statsCollapsed, orderLogCollapsed,
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

  const ephElapsedHours = elapsedMinutes / 60;
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
  // Live avg trip time for THIS shift: elapsed minutes per logged order.
  // Falls back to the zone benchmark until the first order is logged.
  const liveAvgTripMins = totalOrders > 0 && elapsedMinutes > 0 ? elapsedMinutes / totalOrders : null;
  const avgMiles = zoneData?.[zone]?.[day]?.miles ?? ZONE_MILES[zone]?.[day] ?? 10;
  const orderMin = zoneEPH * (avgTripMins / 60);

  const perOrderPay = totalOrders > 0 ? combined / totalOrders : 0;

  const minDollarLeft = Math.max(0, minGoalDollars - combined);
  const stretchDollarLeft = Math.max(0, stretchGoalDollars - combined);
  const minTimeLeft = Math.max(0, minGoalHours * 60 - elapsedMinutes);
  const stretchTimeLeft = Math.max(0, stretchGoalHours * 60 - elapsedMinutes);

  // Time-goal countdown tiles (item 4): time remaining + the clock time you'll hit it.
  // Target clock = now + time left, so in-progress breaks are reflected automatically.
  const minTimeETA = minTimeLeft > 0 ? new Date(now.getTime() + minTimeLeft * 60000) : null;
  const stretchTimeETA = stretchTimeLeft > 0 ? new Date(now.getTime() + stretchTimeLeft * 60000) : null;
  const minTimePct = minGoalHours > 0 ? Math.min(100, (elapsedMinutes / (minGoalHours * 60)) * 100) : 0;
  const stretchTimePct = stretchGoalHours > 0 ? Math.min(100, (elapsedMinutes / (stretchGoalHours * 60)) * 100) : 0;

  const minOrdersLeft = orderMin > 0 ? Math.ceil(minDollarLeft / orderMin) : 0;
  const stretchOrdersLeft = orderMin > 0 ? Math.ceil(stretchDollarLeft / orderMin) : 0;

  const avgOrderValue = totalOrders > 0 ? combined / totalOrders : 8;
  const minOrdersEstimate = minDollarLeft > 0 ? Math.ceil(minDollarLeft / avgOrderValue) : 0;
  const stretchOrdersEstimate = stretchDollarLeft > 0 ? Math.ceil(stretchDollarLeft / avgOrderValue) : 0;

  // Dollar-goal ETAs anchored to snapshotted wall-clock time — only update on
  // order add/remove or 5-min tick
  const minETA = eph > 0 && minDollarLeft > 0
    ? new Date(etaAnchorMs + (minDollarLeft / eph) * 3600000)
    : null;
  const stretchETA = eph > 0 && stretchDollarLeft > 0
    ? new Date(etaAnchorMs + (stretchDollarLeft / eph) * 3600000)
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
    if (strikes >= strikeThreshold && eph < zoneEPH) {
      warning = { type: 'red', msg: '⚠ Stop dashing — business is slow' };
    } else if (minTimeLeft <= 0 && minDollarLeft <= 0 && strikes >= strikeThreshold) {
      warning = { type: 'amber', msg: '✓ Min goals hit — consider stopping' };
    } else if (minTimeLeft <= 0 && eph < zoneEPH) {
      warning = { type: 'amber', msg: '⚠ Time goal met but EPH is lagging' };
    }
  }

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

  // Shift Setup fields — reused inside the setup modal (pre-shift + during-shift edit)
  const shiftSetupInner = (
    <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
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

    </div>
  );

  // Shift Setup modal — opened pre-shift (with Start Shift) or via the menu
  // during a shift (with Done). Replaces the old inline top/bottom setup card.
  const shiftSetupModal = setupModalOpen && (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-3 border-b border-zinc-800 shrink-0">
        <h2 className="text-lg font-bold text-zinc-100">Shift Setup</h2>
        <button
          onClick={() => setSetupModalOpen(false)}
          className="flex items-center justify-center w-10 h-10 rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          aria-label="Close shift setup"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 max-w-lg mx-auto w-full">
        {shiftSetupInner}
      </div>

      <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3 border-t border-zinc-800 shrink-0 max-w-lg mx-auto w-full">
        {!shiftStarted ? (
          <button
            onClick={startShift}
            className="w-full bg-green-700 hover:bg-green-600 active:bg-green-800 text-white font-bold text-lg py-4 rounded-2xl min-h-[60px] transition-colors"
          >
            Start Shift
          </button>
        ) : (
          <button
            onClick={() => setSetupModalOpen(false)}
            className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold py-4 rounded-2xl min-h-[60px] transition-colors"
          >
            Done
          </button>
        )}
      </div>
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

      {/* Settings panel — slides in from right (Break Timer, Behavior, Reset) */}
      <SettingsPanel
        open={hamburgerOpen}
        onClose={() => setHamburgerOpen(false)}
        shiftStarted={shiftStarted}
        breakMinutes={breakMinutes}
        breakRunning={breakRunning}
        breakStartMs={breakStartMs}
        onUpdate={update}
        strikeMode={strikeMode}
        onStrikeModeChange={setStrikeMode}
        strikeThreshold={strikeThreshold}
        onStrikeThresholdChange={setStrikeThreshold}
        onEditSetup={() => { setHamburgerOpen(false); setSetupModalOpen(true); }}
        onEndShift={() => {
          if (window.confirm('End shift? This saves it to your history and clears the tracker.')) {
            handleEndShift();
          }
        }}
        onReset={() => {
          if (window.confirm('Reset shift? This clears all orders and earnings without saving.')) {
            setHamburgerOpen(false);
            clearActiveShiftRemote();
            localStorage.removeItem(STORAGE_KEY);
            setState(getDefaultState());
            setPrefsLoadKey(k => k + 1);
          }
        }}
      />

      {shiftSetupModal}

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
                  // Clear local + remote so this prompt doesn't reappear on next load
                  localStorage.removeItem(STORAGE_KEY);
                  clearActiveShiftRemote();
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

        {/* Pre-shift entry card — setup now lives in a modal */}
        {!shiftStarted && (
          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-center space-y-4">
            <div>
              <div className="text-sm font-semibold text-zinc-200">Ready to roll?</div>
              <div className="text-xs text-zinc-500 mt-1">
                {zone} · {day} · start {startTime} · min ${minGoalDollars}/{minGoalHours}h
              </div>
            </div>
            <button
              onClick={() => setSetupModalOpen(true)}
              className="w-full bg-green-700 hover:bg-green-600 active:bg-green-800 text-white font-semibold rounded-xl py-3.5 min-h-[52px] text-sm transition-colors"
            >
              Set Up &amp; Start Shift
            </button>
          </div>
        )}

        {/* ── Live Dashboard ── */}
        {shiftStarted && (
          <>
            {/* Elapsed + time-goal countdown tiles */}
            <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Elapsed</div>
                  <div className="text-3xl font-bold text-zinc-100 tabular-nums">
                    {fmtDuration(elapsedMinutes)}
                  </div>
                </div>
                {breakRunning && (
                  <span className="text-xs font-medium text-amber-400">⏸ on break</span>
                )}
              </div>

              <div className="space-y-2.5">
                {[
                  { label: 'MIN GOAL', hours: minGoalHours, left: minTimeLeft, eta: minTimeETA, pct: minTimePct },
                  { label: 'STRETCH', hours: stretchGoalHours, left: stretchTimeLeft, eta: stretchTimeETA, pct: stretchTimePct },
                ].filter(g => g.hours > 0).map(({ label, hours, left, eta, pct }) => {
                  const hit = left <= 0;
                  return (
                    <div
                      key={label}
                      className={`rounded-lg border px-3 py-2.5 ${
                        hit ? 'border-green-800 bg-green-950/40' : 'border-zinc-800 bg-zinc-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-semibold tracking-wide ${hit ? 'text-green-400' : 'text-zinc-400'}`}>
                          {label}
                        </span>
                        <span className={`text-sm font-bold tabular-nums ${hit ? 'text-green-400' : 'text-zinc-200'}`}>
                          {hit ? '✓ met' : `${fmtDuration(left)} left`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${hit ? 'bg-green-500' : 'bg-zinc-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-zinc-500 tabular-nums shrink-0 w-16 text-right">
                          {hit ? `${hours}h done` : eta ? `~${fmtTime(eta)}` : '—'}
                        </span>
                      </div>
                    </div>
                  );
                })}
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
                            eph > lastEphEntry.eph ? 'text-green-400'
                            : eph < lastEphEntry.eph ? 'text-red-400'
                            : 'text-zinc-400'
                          }>
                            {eph > lastEphEntry.eph ? '↑' : eph < lastEphEntry.eph ? '↓' : '→'}
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
                  {strikeMode !== 'manual' && (
                    <span className="text-xs text-zinc-600 capitalize">{strikeMode}</span>
                  )}
                  <div className="flex gap-2">
                    {Array.from({ length: strikeThreshold }, (_, i) => i).map(i => (
                      <div
                        key={i}
                        className={`w-5 h-5 rounded-full ${i < strikes ? 'bg-red-500' : 'bg-zinc-700'}`}
                      />
                    ))}
                  </div>
                </div>
                {strikeMode !== 'auto' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => update({ strikes: Math.min(strikeThreshold, strikes + 1) })}
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
                )}
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

            {/* Order guidance strip — Order Min $ / Miles Max on one line */}
            <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 space-y-3">
              <div className="flex items-center justify-center gap-3 text-center">
                <span className="text-lg font-bold text-zinc-200 tabular-nums">
                  Order Min <span className="text-green-400">${Math.round(orderMin)}</span>
                </span>
                <span className="text-zinc-600 text-lg font-light">/</span>
                <span className="text-lg font-bold text-zinc-200 tabular-nums">
                  <span className="text-amber-400">{Math.round(avgMiles)}</span> Miles Max
                </span>
              </div>
              <div className="border-t border-zinc-800 pt-3 text-center">
                <div className="text-xs text-zinc-500">Recommended</div>
                <div className="text-lg font-bold text-zinc-200">{orderType}</div>
              </div>
            </div>

            {/* Order entry — opens full-screen quick-add logger */}
            <button
              onClick={() => setOrderInputOpen(true)}
              className="mt-3 w-full rounded-xl border border-zinc-800 bg-zinc-900 flex items-center justify-center gap-2 py-5 min-h-[68px] text-base font-semibold text-zinc-200 hover:bg-zinc-800 active:bg-zinc-700 transition-colors"
            >
              <Plus size={20} />
              Log Order
            </button>

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
                    <StatRow
                      label={liveAvgTripMins != null ? 'Avg trip time (shift)' : 'Avg trip time (zone)'}
                      value={`${Math.round(liveAvgTripMins ?? avgTripMins)} min`}
                    />
                  </div>

                </div>
              )}
            </div>

            {/* End Shift */}
            <button
              onClick={() => {
                if (window.confirm('End shift? This saves it to your history and clears the tracker.')) {
                  handleEndShift();
                }
              }}
              className="mt-3 w-full rounded-xl border border-red-900 bg-red-950/40 hover:bg-red-950/70 text-red-300 font-semibold py-3.5 min-h-[52px] text-sm transition-colors"
            >
              End Shift
            </button>
          </>
        )}

      </main>

      {/* Full-screen quick-add order logger */}
      {orderInputOpen && (
        <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col">
          <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-3 border-b border-zinc-800">
            <h2 className="text-lg font-bold text-zinc-100">Log Order</h2>
            <button
              onClick={() => { setOrderInputOpen(false); setOrderInputValue(''); }}
              className="flex items-center justify-center w-10 h-10 rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 flex flex-col px-4 py-5 gap-4 overflow-y-auto">
            {/* Platform — two buttons (UberEats / DoorDash) */}
            <div className="grid grid-cols-2 gap-2.5">
              {PLATFORMS.map(p => {
                const active = selectedPlatform === p;
                const activeCls = p === 'UberEats'
                  ? 'bg-green-900 border-green-600 text-green-200'
                  : 'bg-red-900 border-red-600 text-red-200';
                return (
                  <button
                    key={p}
                    onClick={() => { setSelectedPlatform(p); localStorage.setItem(LAST_PLATFORM_KEY, p); }}
                    className={`min-h-[56px] rounded-xl border text-base font-semibold transition-colors ${
                      active ? activeCls : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>

            {/* Big amount input */}
            <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-700 rounded-xl px-4 min-h-[88px]">
              <span className="text-zinc-400 text-3xl font-light">$</span>
              <input
                type="number" min="0" step="0.01" inputMode="decimal"
                value={orderInputValue}
                onChange={e => setOrderInputValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addOrder(selectedPlatform, orderInputValue)}
                autoFocus
                placeholder="0.00"
                className="flex-1 bg-transparent text-zinc-100 outline-none text-5xl font-bold tabular-nums min-w-0"
              />
            </div>

            {/* Quick-add +/- buttons */}
            <div className="space-y-3">
              <div className="flex gap-2.5">
                {[1, 5, 10].map(delta => (
                  <button
                    key={`+${delta}`}
                    onClick={() => setOrderInputValue(prev => {
                      const next = Math.max(0, (parseFloat(prev) || 0) + delta);
                      return next === 0 ? '' : next.toFixed(2);
                    })}
                    className="flex-1 flex flex-col items-center justify-center bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 border border-zinc-700 rounded-xl min-h-[68px] transition-colors gap-0.5"
                  >
                    <span className="text-green-400 text-xl font-bold">+{delta}</span>
                    <span className="text-zinc-500 text-xs">${delta}.00</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2.5">
                {[1, 5, 10].map(delta => (
                  <button
                    key={`-${delta}`}
                    onClick={() => setOrderInputValue(prev => {
                      const next = Math.max(0, (parseFloat(prev) || 0) - delta);
                      return next === 0 ? '' : next.toFixed(2);
                    })}
                    className="flex-1 flex flex-col items-center justify-center bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 border border-zinc-700 rounded-xl min-h-[68px] transition-colors gap-0.5"
                  >
                    <span className="text-red-400 text-xl font-bold">−{delta}</span>
                    <span className="text-zinc-500 text-xs">${delta}.00</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-3 border-t border-zinc-800">
            <button
              onClick={() => addOrder(selectedPlatform, orderInputValue)}
              className="w-full bg-green-700 hover:bg-green-600 active:bg-green-800 text-white font-bold text-xl py-5 rounded-2xl min-h-[72px] transition-colors"
            >
              OK — Log Order
            </button>
          </div>
        </div>
      )}

      {/* End-of-shift recap screen */}
      {recap && (
        <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col">
          <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6 overflow-y-auto py-8">
            <div className="text-center">
              <div className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Shift Complete</div>
              <div className={`text-5xl font-black tabular-nums ${
                recap.eph >= recap.dayMax ? 'text-green-400'
                : recap.eph >= recap.zoneEPH ? 'text-amber-400'
                : 'text-red-400'
              }`}>
                {fmtMoney(recap.eph)}
              </div>
              <div className="text-zinc-500 text-sm mt-1">/hr (EPH)</div>
            </div>
            <div className="grid grid-cols-2 gap-3 w-full max-w-xs">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                <div className="text-xs text-zinc-500 mb-1">Total Earned</div>
                <div className="text-xl font-bold text-zinc-100 tabular-nums">{fmtMoney(recap.combined)}</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                <div className="text-xs text-zinc-500 mb-1">Shift Length</div>
                <div className="text-xl font-bold text-zinc-100 tabular-nums">{fmtDuration(recap.durationMinutes)}</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                <div className="text-xs text-zinc-500 mb-1">Orders / hr</div>
                <div className="text-xl font-bold text-zinc-100 tabular-nums">
                  {recap.ordersPerHr > 0 ? recap.ordersPerHr.toFixed(1) : '—'}
                </div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                <div className="text-xs text-zinc-500 mb-1">Total Orders</div>
                <div className="text-xl font-bold text-zinc-100 tabular-nums">{recap.totalOrders}</div>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-zinc-500">
              {recap.minGoalDollars > 0 && (
                <span className={recap.combined >= recap.minGoalDollars ? 'text-green-400' : 'text-zinc-500'}>
                  {recap.combined >= recap.minGoalDollars ? '✓' : '·'} Min ${recap.minGoalDollars}
                </span>
              )}
              {recap.stretchGoalDollars > 0 && (
                <span className={recap.combined >= recap.stretchGoalDollars ? 'text-green-400' : 'text-zinc-500'}>
                  {recap.combined >= recap.stretchGoalDollars ? '✓' : '·'} Stretch ${recap.stretchGoalDollars}
                </span>
              )}
            </div>
          </div>
          <div className="px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-4">
            <button
              onClick={() => setRecap(null)}
              className="w-full bg-green-700 hover:bg-green-600 active:bg-green-800 text-white font-bold text-lg py-4 rounded-2xl min-h-[60px] transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
