import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Gauge } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  DEFAULT_HOURLY_RATE, DEFAULT_BENCHMARKS, benchmarkWeekly, freshnessColor, freshnessLabel,
} from './debtcalc/benchmarks';

const SB_ROW_ID = 'luke';
const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n ?? 0);

const SWATCHES = ['#f59e0b', '#94a3b8', '#6366f1', '#10b981', '#ec4899', '#06b6d4', '#a855f7', '#ef4444'];

// Settings families (Monarch-style left nav). One real family for now; the
// structure leaves room for more.
const FAMILIES = [
  { id: 'gig', label: 'Side Gig & Benchmarks', icon: Gauge },
];

export default function DebtCalcSettings() {
  const [family, setFamily] = useState('gig');
  const [hourlyRate, setHourlyRate] = useState(DEFAULT_HOURLY_RATE);
  const [rateUpdated, setRateUpdated] = useState('');
  const [benchmarks, setBenchmarks] = useState(DEFAULT_BENCHMARKS);
  const [synced, setSynced] = useState(false);

  // Load saved settings on mount.
  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!supabase) { if (!cancelled) setSynced(true); return; }
      const { data } = await supabase.from('debt_settings').select('hourly_rate, hourly_rate_updated, benchmarks').eq('id', SB_ROW_ID).single();
      if (cancelled) return;
      if (data) {
        if (data.hourly_rate) setHourlyRate(Number(data.hourly_rate));
        if (data.hourly_rate_updated) setRateUpdated(data.hourly_rate_updated);
        if (Array.isArray(data.benchmarks) && data.benchmarks.length) setBenchmarks(data.benchmarks);
      }
      setSynced(true);
    }
    init();
    return () => { cancelled = true; };
  }, []);

  // Debounced save.
  const debounceRef = useRef(null);
  const save = useCallback(() => {
    if (!synced || !supabase) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      supabase.from('debt_settings').upsert({
        id: SB_ROW_ID,
        hourly_rate: hourlyRate,
        hourly_rate_updated: rateUpdated || null,
        benchmarks,
        updated_at: new Date().toISOString(),
      }).then(({ error }) => { if (error) console.error('[settings save]', error.message); });
    }, 800);
  }, [synced, hourlyRate, rateUpdated, benchmarks]);
  useEffect(() => { save(); return () => clearTimeout(debounceRef.current); }, [save]);

  const setRateToday = () => setRateUpdated(new Date().toISOString().slice(0, 10));
  const updateBenchmark = (id, field, value) =>
    setBenchmarks((prev) => prev.map((b) => b.id === id ? { ...b, [field]: value } : b));

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Link to="/debt-calculator" className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors text-sm mb-3">
          <ArrowLeft size={15} />Back to Calculator
        </Link>
        <h1 className="text-2xl font-bold tracking-tight mb-6">Calculator Settings</h1>

        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
          {/* Left family nav */}
          <nav className="bg-zinc-900 border border-zinc-800 rounded-xl p-2 h-max">
            {FAMILIES.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setFamily(id)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-colors ${
                  family === id ? 'bg-purple-900/40 text-purple-300' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'}`}>
                <Icon size={15} className="shrink-0" />{label}
              </button>
            ))}
          </nav>

          {/* Right config panel */}
          {family === 'gig' && (
            <div className="space-y-5">
              {/* Hourly rate */}
              <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <h2 className="text-base font-semibold mb-1">Average earnings / hour</h2>
                <p className="text-xs text-zinc-500 mb-4">Your flat side-gig rate. Benchmarks below convert hours/week into a weekly $ target using this.</p>
                <div className="flex flex-wrap items-end gap-4">
                  <label className="block">
                    <span className="text-xs text-zinc-400 mb-1 block">$ / hour</span>
                    <div className="relative w-40">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">$</span>
                      <input type="number" step="0.01" value={hourlyRate}
                        onChange={(e) => setHourlyRate(parseFloat(e.target.value) || 0)} onFocus={(e) => e.target.select()}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg py-2 pl-7 pr-3 text-sm text-white focus:outline-none focus:border-purple-500" />
                    </div>
                  </label>
                  <label className="block">
                    <span className="text-xs text-zinc-400 mb-1 block">Last updated</span>
                    <input type="date" value={rateUpdated ? rateUpdated.slice(0, 10) : ''}
                      onChange={(e) => setRateUpdated(e.target.value)}
                      className="bg-zinc-800 border border-zinc-700 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-purple-500" />
                  </label>
                  <div className="flex items-center gap-2 pb-2">
                    <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: freshnessColor(rateUpdated) }} title="Freshness — reddens as it nears 90 days" />
                    <span className="text-xs text-zinc-500">{freshnessLabel(rateUpdated)}</span>
                    <button onClick={setRateToday} className="text-xs text-purple-400 hover:text-purple-300 ml-1">mark today</button>
                  </div>
                </div>
              </section>

              {/* Benchmarks */}
              <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <h2 className="text-base font-semibold mb-1">Slider benchmarks</h2>
                <p className="text-xs text-zinc-500 mb-4">The quick-pick targets under the earnings slider. Break-even is calculated; the rest convert hours/week → weekly $.</p>

                <div className="space-y-3">
                  {benchmarks.map((b) => (
                    <div key={b.id} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                      <div className="flex items-center gap-2 mb-3">
                        {b.computed ? (
                          <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                        ) : (
                          <ColorPicker value={b.color} onChange={(c) => updateBenchmark(b.id, 'color', c)} />
                        )}
                        <span className="text-sm font-medium text-zinc-200">{b.computed ? b.name : 'Custom benchmark'}</span>
                        {b.computed && <span className="text-[11px] text-zinc-600 ml-auto">calculated · break-even</span>}
                        {!b.computed && (
                          <span className="ml-auto text-sm font-semibold tabular-nums text-emerald-400">{fmt(benchmarkWeekly(b, hourlyRate))}/wk</span>
                        )}
                      </div>

                      {b.computed ? (
                        <p className="text-xs text-zinc-500">Name &amp; subtext fixed: <span className="text-zinc-400">{b.name}</span> · {b.subtext}. Its value tracks your minimums automatically.</p>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          <Field label="Name"><input value={b.name} onChange={(e) => updateBenchmark(b.id, 'name', e.target.value)} className={inputCls} /></Field>
                          <Field label="Subtext"><input value={b.subtext} onChange={(e) => updateBenchmark(b.id, 'subtext', e.target.value)} className={inputCls} /></Field>
                          <Field label="Hours / week">
                            <input type="number" step="0.1" value={b.hours ?? ''} onChange={(e) => updateBenchmark(b.id, 'hours', parseFloat(e.target.value) || 0)} onFocus={(e) => e.target.select()} className={inputCls} />
                          </Field>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full bg-zinc-800 border border-zinc-700 rounded-lg py-1.5 px-2.5 text-sm text-white focus:outline-none focus:border-purple-500';

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs text-zinc-500 mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function ColorPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="h-4 w-4 rounded-full ring-1 ring-zinc-600" style={{ backgroundColor: value }} title="Pick color" />
      {open && (
        <div className="absolute z-10 mt-1 flex gap-1 rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-xl">
          {SWATCHES.map((c) => (
            <button key={c} onClick={() => { onChange(c); setOpen(false); }} className="h-4 w-4 rounded-full ring-1 ring-zinc-600 hover:scale-110 transition-transform" style={{ backgroundColor: c }} />
          ))}
        </div>
      )}
    </div>
  );
}
