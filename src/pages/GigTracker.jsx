import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Plus, X, Trash2, Edit2, Check } from 'lucide-react';
import TopNav from '../components/TopNav';

const STORAGE_KEY = 'gig_tracker_state';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ZONES = ['Augusta', 'Brunswick/Bath/Freeport', 'Lewiston', 'Portland'];

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
    breakLength: 0,
    minGoalHours: 4,
    minGoalDollars: 107,
    stretchGoalHours: 6,
    stretchGoalDollars: 156,
    orderLog: [],
    ephElapsedMinutes: 0,
    strikes: 0,
    setupCollapsed: false,
    statsCollapsed: true,
    orderLogCollapsed: true,
    shiftDate: todayISO(),
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

  // Always-fresh ref for use inside intervals
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // Check for resumable shift on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved && saved.shiftDate === todayISO() && saved.shiftStarted) {
        setSavedResume(saved);
        setResumePrompt(true);
      }
    } catch {
      // ignore corrupt data
    }
  }, []);

  // Live clock — 1s tick (display only, not EPH)
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // EPH auto-refresh every 15 minutes
  useEffect(() => {
    const id = setInterval(() => {
      const s = stateRef.current;
      if (s.shiftStarted && s.startTime) {
        const elapsed = computeElapsedMinutes(s.startTime, s.breakLength);
        setState(prev => ({ ...prev, ephElapsedMinutes: elapsed }));
      }
    }, 15 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Persist every state change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  function update(partial) {
    setState(s => ({ ...s, ...partial }));
  }

  function startShift() {
    const elapsed = computeElapsedMinutes(state.startTime, state.breakLength);
    update({ shiftStarted: true, setupCollapsed: true, shiftDate: todayISO(), ephElapsedMinutes: elapsed });
  }

  function addOrder(platform, amountStr) {
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) return;

    const platformLabel = platform === 'ue' ? 'UberEats' : 'DoorDash';
    const newOrder = { id: Date.now(), platform: platformLabel, amount, timestamp: new Date().toISOString() };
    const newLog = [...state.orderLog, newOrder];
    const newCombined = newLog.reduce((s, o) => s + o.amount, 0);

    const currentElapsed = computeElapsedMinutes(state.startTime, state.breakLength);
    const newEph = currentElapsed > 0 ? newCombined / (currentElapsed / 60) : 0;
    const dayIndex = DAYS.indexOf(state.day);
    const dayMax = DAY_MAX_EPH[dayIndex] ?? 22;
    const newStrikes = newEph >= dayMax ? Math.max(0, state.strikes - 1) : state.strikes;

    setState(s => ({
      ...s,
      orderLog: newLog,
      ephElapsedMinutes: currentElapsed,
      strikes: newStrikes,
    }));

    if (platform === 'ue') { setUeInputOpen(false); setUeInputValue(''); }
    else { setDdInputOpen(false); setDdInputValue(''); }
  }

  function removeOrder(id) {
    const currentElapsed = computeElapsedMinutes(state.startTime, state.breakLength);
    setState(s => ({
      ...s,
      orderLog: s.orderLog.filter(o => o.id !== id),
      ephElapsedMinutes: currentElapsed,
    }));
  }

  function editOrder(id, newAmountStr) {
    const newAmount = parseFloat(newAmountStr);
    if (isNaN(newAmount) || newAmount <= 0) return;
    const currentElapsed = computeElapsedMinutes(state.startTime, state.breakLength);
    setState(s => ({
      ...s,
      orderLog: s.orderLog.map(o => o.id === id ? { ...o, amount: newAmount } : o),
      ephElapsedMinutes: currentElapsed,
    }));
    setEditingOrderId(null);
    setEditingValue('');
  }

  // Destructure for derived calcs
  const {
    shiftStarted, startTime, zone, day, breakLength,
    minGoalHours, minGoalDollars, stretchGoalHours, stretchGoalDollars,
    orderLog, ephElapsedMinutes, strikes, setupCollapsed, statsCollapsed, orderLogCollapsed,
  } = state;

  // Live elapsed time — used for the clock display and goal timing only
  let elapsedMinutes = 0;
  if (shiftStarted && startTime) {
    const [h, m] = startTime.split(':').map(Number);
    const startDate = new Date(now);
    startDate.setHours(h, m, 0, 0);
    if (startDate > now) startDate.setDate(startDate.getDate() - 1);
    elapsedMinutes = Math.max(0, (now - startDate) / 60000 - Number(breakLength));
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

  const dayIndex = DAYS.indexOf(day);
  const zoneEPH = ZONE_EPH[zone]?.[day] ?? 20;
  const dayMax = DAY_MAX_EPH[dayIndex] ?? 22;
  const midpoint = (zoneEPH + dayMax) / 2;

  const avgTripMins = ZONE_TRIP_MINS[zone]?.[day] ?? 30;
  const avgMiles = ZONE_MILES[zone]?.[day] ?? 10;
  const orderMin = zoneEPH * (avgTripMins / 60);

  const ordersPerHour = elapsedHours > 0 && totalOrders > 0 ? totalOrders / elapsedHours : 0;
  const perOrderPay = totalOrders > 0 ? combined / totalOrders : 0;

  const minDollarLeft = Math.max(0, minGoalDollars - combined);
  const stretchDollarLeft = Math.max(0, stretchGoalDollars - combined);
  const minTimeLeft = Math.max(0, minGoalHours * 60 - elapsedMinutes);
  const stretchTimeLeft = Math.max(0, stretchGoalHours * 60 - elapsedMinutes);

  const minOrdersLeft = orderMin > 0 ? Math.ceil(minDollarLeft / orderMin) : 0;
  const stretchOrdersLeft = orderMin > 0 ? Math.ceil(stretchDollarLeft / orderMin) : 0;

  // Base start timestamp — derived from startTime string, not from the live `now`
  let shiftStartMs = 0;
  if (shiftStarted && startTime) {
    const [sh, sm] = startTime.split(':').map(Number);
    const sd = new Date();
    sd.setHours(sh, sm, 0, 0);
    if (sd > new Date()) sd.setDate(sd.getDate() - 1);
    shiftStartMs = sd.getTime();
  }

  // ETAs anchored to snapshotted elapsed time — only update on order add/remove or 15-min tick
  const etaAnchorMs = shiftStartMs + ephElapsedMinutes * 60000;
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

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <TopNav />
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
                onClick={() => setResumePrompt(false)}
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

        {/* ── Section 1: Shift Setup ── */}
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
                <label className="block text-xs text-zinc-500 mb-1.5">Break Length (min)</label>
                <input
                  type="number"
                  min="0"
                  value={breakLength}
                  onChange={e => update({ breakLength: Number(e.target.value) })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 min-h-[44px] outline-none focus:border-zinc-500"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Min Goal</label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 min-h-[44px]">
                    <span className="text-zinc-500 text-xs shrink-0">hrs</span>
                    <input
                      type="number" min="0" step="0.5"
                      value={minGoalHours}
                      onChange={e => update({ minGoalHours: Number(e.target.value) })}
                      className="flex-1 bg-transparent text-sm text-zinc-100 outline-none min-w-0"
                    />
                  </div>
                  <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 min-h-[44px]">
                    <span className="text-zinc-500 text-xs shrink-0">$</span>
                    <input
                      type="number" min="0"
                      value={minGoalDollars}
                      onChange={e => update({ minGoalDollars: Number(e.target.value) })}
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
                      type="number" min="0" step="0.5"
                      value={stretchGoalHours}
                      onChange={e => update({ stretchGoalHours: Number(e.target.value) })}
                      className="flex-1 bg-transparent text-sm text-zinc-100 outline-none min-w-0"
                    />
                  </div>
                  <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 min-h-[44px]">
                    <span className="text-zinc-500 text-xs shrink-0">$</span>
                    <input
                      type="number" min="0"
                      value={stretchGoalDollars}
                      onChange={e => update({ stretchGoalDollars: Number(e.target.value) })}
                      className="flex-1 bg-transparent text-sm text-zinc-100 outline-none min-w-0"
                    />
                  </div>
                </div>
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

        {/* ── Section 2: Live Dashboard ── */}
        {shiftStarted && (
          <>
            {/* Time row */}
            <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Elapsed</div>
                  <div className="text-2xl font-bold text-zinc-100 tabular-nums">
                    {fmtDuration(elapsedMinutes)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">→ Min</div>
                  <div className={`text-2xl font-bold tabular-nums ${minTimeLeft <= 0 ? 'text-green-400' : 'text-zinc-100'}`}>
                    {minTimeLeft <= 0 ? '✓' : fmtDuration(minTimeLeft)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">→ Stretch</div>
                  <div className={`text-2xl font-bold tabular-nums ${stretchTimeLeft <= 0 ? 'text-green-400' : 'text-zinc-100'}`}>
                    {stretchTimeLeft <= 0 ? '✓' : fmtDuration(stretchTimeLeft)}
                  </div>
                </div>
              </div>
            </div>

            {/* Earnings + EPH */}
            <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-xs text-zinc-500 mb-1">UberEats</div>
                  <div className="text-3xl font-bold text-zinc-100 tabular-nums">{fmtMoney(ueTotal)}</div>
                  <div className="text-xs text-zinc-600 mt-0.5">{ueOrders.length} order{ueOrders.length !== 1 ? 's' : ''}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-zinc-500 mb-1">DoorDash</div>
                  <div className="text-3xl font-bold text-zinc-100 tabular-nums">{fmtMoney(ddTotal)}</div>
                  <div className="text-xs text-zinc-600 mt-0.5">{ddOrders.length} order{ddOrders.length !== 1 ? 's' : ''}</div>
                </div>
              </div>
              <div className="text-center border-t border-zinc-800 pt-4">
                <div className="text-xs text-zinc-500 mb-1">Combined EPH</div>
                <div className={`text-5xl font-bold tabular-nums ${ephColor}`}>
                  {ephElapsedHours > 0.01 ? fmtMoney(eph) : '—'}
                  {ephElapsedHours > 0.01 && (
                    <span className="text-2xl font-normal text-zinc-500">/hr</span>
                  )}
                </div>
                <div className="text-xs text-zinc-600 mt-1.5">
                  Zone avg: ${zoneEPH.toFixed(2)}/hr ({zone}, {day})
                </div>
              </div>
            </div>

            {/* Goal progress */}
            <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-4">
              {/* Overall ETA */}
              <div className="text-center pb-4 border-b border-zinc-800">
                <div className="text-xs text-zinc-500 mb-1">Done by</div>
                {eph === 0 ? (
                  <div className="text-sm text-zinc-500">Log an order to calculate</div>
                ) : (
                  <>
                    <div className="text-3xl font-bold text-zinc-100 tabular-nums">
                      {overallETA ? fmtTime(overallETA) : '—'}
                    </div>
                    <div className="text-xs text-zinc-600 mt-1">
                      {elapsedHours < minGoalHours
                        ? `min goal (${minGoalHours}h)`
                        : `stretch goal (${stretchGoalHours}h)`}
                    </div>
                  </>
                )}
              </div>

              {/* Min goal */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Min Goal</span>
                  <span className={`text-xs font-medium ${minDollarLeft <= 0 && minTimeLeft <= 0 ? 'text-green-400' : 'text-zinc-500'}`}>
                    {minDollarLeft <= 0 && minTimeLeft <= 0 ? '✓ Complete' : `${fmtMoney(minDollarLeft)} left`}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-xs text-zinc-600">$ left</div>
                    <div className="text-xl font-semibold text-zinc-200 tabular-nums">{fmtMoney(minDollarLeft)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-600">orders</div>
                    <div className="text-xl font-semibold text-zinc-200 tabular-nums">{minOrdersLeft}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-600">ETA</div>
                    <div className={`font-semibold tabular-nums ${eph === 0 ? 'text-xs text-zinc-500' : 'text-xl text-zinc-200'}`}>
                      {eph === 0 ? 'Log an order' : fmtTime(minETA)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-zinc-800" />

              {/* Stretch goal */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Stretch Goal</span>
                  <span className={`text-xs font-medium ${stretchDollarLeft <= 0 && stretchTimeLeft <= 0 ? 'text-green-400' : 'text-zinc-500'}`}>
                    {stretchDollarLeft <= 0 && stretchTimeLeft <= 0 ? '✓ Complete' : `${fmtMoney(stretchDollarLeft)} left`}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-xs text-zinc-600">$ left</div>
                    <div className="text-xl font-semibold text-zinc-200 tabular-nums">{fmtMoney(stretchDollarLeft)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-600">orders</div>
                    <div className="text-xl font-semibold text-zinc-200 tabular-nums">{stretchOrdersLeft}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-600">ETA</div>
                    <div className={`font-semibold tabular-nums ${eph === 0 ? 'text-xs text-zinc-500' : 'text-xl text-zinc-200'}`}>
                      {eph === 0 ? 'Log an order' : fmtTime(stretchETA)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Order guidance strip */}
            <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-xs text-zinc-500">Order Min</div>
                  <div className="text-lg font-bold text-zinc-200 tabular-nums">{fmtMoney(orderMin)}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500">Miles Max</div>
                  <div className="text-lg font-bold text-zinc-200 tabular-nums">{avgMiles.toFixed(1)}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500">Avg Trip</div>
                  <div className="text-lg font-bold text-zinc-200 tabular-nums">{Math.round(avgTripMins)}m</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center border-t border-zinc-800 pt-3">
                <div>
                  <div className="text-xs text-zinc-500">Avg EPH</div>
                  <div className="text-lg font-bold text-zinc-200 tabular-nums">{fmtMoney(zoneEPH)}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500">Max EPH</div>
                  <div className="text-lg font-bold text-zinc-200 tabular-nums">{fmtMoney(dayMax)}</div>
                </div>
              </div>
            </div>

            {/* Three-Strike tracker */}
            <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex items-center justify-between">
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
                    onClick={() => update({ strikes: 0 })}
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs font-medium px-3 rounded-lg min-h-[40px] transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Section 3: Order Entry ── */}
        {shiftStarted && (
          <div className="mt-3 space-y-3">
            {/* UberEats */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
              {!ueInputOpen ? (
                <button
                  onClick={() => setUeInputOpen(true)}
                  className="w-full flex items-center justify-center gap-2 py-4 min-h-[60px] text-sm font-semibold text-zinc-200 hover:bg-zinc-800 active:bg-zinc-700 transition-colors"
                >
                  <Plus size={18} />
                  UberEats Order
                </button>
              ) : (
                <div className="p-3 flex gap-2 items-stretch">
                  <div className="flex-1 flex items-center gap-2 bg-zinc-800 rounded-lg px-3 min-h-[52px] border border-zinc-600">
                    <span className="text-zinc-400 text-base">$</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={ueInputValue}
                      onChange={e => setUeInputValue(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addOrder('ue', ueInputValue)}
                      autoFocus
                      placeholder="0.00"
                      className="flex-1 bg-transparent text-zinc-100 outline-none text-xl min-w-0"
                    />
                  </div>
                  <button
                    onClick={() => addOrder('ue', ueInputValue)}
                    className="bg-green-700 hover:bg-green-600 text-white font-semibold px-5 rounded-lg min-h-[52px] text-sm transition-colors"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => { setUeInputOpen(false); setUeInputValue(''); }}
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 px-3 rounded-lg min-h-[52px] transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
            </div>

            {/* DoorDash */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
              {!ddInputOpen ? (
                <button
                  onClick={() => setDdInputOpen(true)}
                  className="w-full flex items-center justify-center gap-2 py-4 min-h-[60px] text-sm font-semibold text-zinc-200 hover:bg-zinc-800 active:bg-zinc-700 transition-colors"
                >
                  <Plus size={18} />
                  DoorDash Order
                </button>
              ) : (
                <div className="p-3 flex gap-2 items-stretch">
                  <div className="flex-1 flex items-center gap-2 bg-zinc-800 rounded-lg px-3 min-h-[52px] border border-zinc-600">
                    <span className="text-zinc-400 text-base">$</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={ddInputValue}
                      onChange={e => setDdInputValue(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addOrder('dd', ddInputValue)}
                      autoFocus
                      placeholder="0.00"
                      className="flex-1 bg-transparent text-zinc-100 outline-none text-xl min-w-0"
                    />
                  </div>
                  <button
                    onClick={() => addOrder('dd', ddInputValue)}
                    className="bg-green-700 hover:bg-green-600 text-white font-semibold px-5 rounded-lg min-h-[52px] text-sm transition-colors"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => { setDdInputOpen(false); setDdInputValue(''); }}
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 px-3 rounded-lg min-h-[52px] transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Section 4: Order Log ── */}
        {shiftStarted && safeLog.length > 0 && (
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
                            className="text-green-400 hover:text-green-300 transition-colors p-1 shrink-0"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => { setEditingOrderId(null); setEditingValue(''); }}
                            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 shrink-0"
                          >
                            <X size={14} />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 text-sm font-semibold text-zinc-200 tabular-nums">
                            {fmtMoney(order.amount)}
                          </span>
                          <span className="text-xs text-zinc-500">
                            {fmtTime(new Date(order.timestamp))}
                          </span>
                          <button
                            onClick={() => { setEditingOrderId(order.id); setEditingValue(String(order.amount)); }}
                            className="text-zinc-600 hover:text-zinc-300 transition-colors p-1 shrink-0"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => removeOrder(order.id)}
                            className="text-zinc-600 hover:text-red-400 transition-colors p-1 shrink-0"
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

        {/* ── Section 5: Detailed Stats ── */}
        {shiftStarted && (
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
                  <StatRow label="Orders/hr" value={elapsedHours > 0 && totalOrders > 0 ? ordersPerHour.toFixed(1) : '—'} />
                  <StatRow label="Per-order avg" value={totalOrders > 0 ? fmtMoney(perOrderPay) : '—'} />
                  <StatRow label="UE orders" value={ueOrders.length} />
                  <StatRow label="DD orders" value={ddOrders.length} />
                  <StatRow label="Total orders" value={totalOrders} />
                  <StatRow label="Combined total" value={fmtMoney(combined)} />
                  <StatRow label="Avg trip time" value={`${Math.round(avgTripMins)} min`} />
                  <StatRow label="Break length" value={`${breakLength} min`} />
                </div>

                <button
                  onClick={() => {
                    if (window.confirm('Reset shift? This clears all orders and earnings.')) {
                      setState(getDefaultState());
                    }
                  }}
                  className="mt-5 w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 text-xs font-medium py-3 rounded-lg min-h-[44px] transition-colors"
                >
                  Reset Shift
                </button>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
