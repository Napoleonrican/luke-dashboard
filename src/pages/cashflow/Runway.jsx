import { useOutletContext } from 'react-router-dom';
import {
  ResponsiveContainer, ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { Redacted } from './CashflowLayout';
import { RUNWAY_DAYS, UPCOMING_DEBITS, typeColor, fmt, fmtDec } from './mockData';

// Short Term Needs & Planning — the day-by-day runway. Shows whether projected
// earnings keep "ending available" above zero through the week, plus the dated
// list of debits driving each day's need.
export default function Runway() {
  const { privacy } = useOutletContext();

  const lowest   = Math.min(...RUNWAY_DAYS.map((d) => d.end));
  const totalNeed = RUNWAY_DAYS.reduce((s, d) => s + d.needed, 0);
  const totalEarn = RUNWAY_DAYS.reduce((s, d) => s + d.earnings, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Lowest balance" value={fmt(lowest)} privacy={privacy} tone={lowest < 100 ? 'text-amber-400' : 'text-emerald-400'} />
        <Stat label="7-day needs" value={fmt(totalNeed)} privacy={privacy} tone="text-red-300" />
        <Stat label="Projected earnings" value={fmt(totalEarn)} privacy={privacy} tone="text-emerald-400" />
        <Stat label="Debits scheduled" value={UPCOMING_DEBITS.length} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-6">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-base font-semibold mb-4">Daily Runway</h2>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={RUNWAY_DAYS} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 11 }} />
              <YAxis tickFormatter={(v) => privacy ? '●●' : `$${v}`} tick={{ fill: '#71717a', fontSize: 11 }} width={48} />
              <Tooltip cursor={{ fill: '#ffffff08' }} content={(p) => <RunwayTooltip {...p} privacy={privacy} />} />
              <Area type="monotone" dataKey="end" name="Ending available" stroke="#10b981" fill="#10b98122" strokeWidth={2} />
              <Bar dataKey="needed" name="Needed" fill="#ef4444" radius={[3, 3, 0, 0]} barSize={18} />
              <Bar dataKey="earnings" name="Earnings" fill="#3b82f6" radius={[3, 3, 0, 0]} barSize={18} />
            </ComposedChart>
          </ResponsiveContainer>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-base font-semibold mb-4">Upcoming Debits</h2>
          <div className="space-y-2">
            {UPCOMING_DEBITS.map((d) => (
              <div key={d.name + d.date} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: typeColor(d.type) }} />
                    <span className="text-sm text-zinc-200 truncate">{d.name}</span>
                  </div>
                  <span className="text-xs text-zinc-500 ml-4">{d.date} · {d.type}</span>
                </div>
                <Redacted on={privacy}>
                  <span className="text-sm font-medium tabular-nums text-zinc-200 shrink-0">{fmtDec(d.amount)}</span>
                </Redacted>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function RunwayTooltip({ active, payload, label, privacy }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-zinc-300 font-medium mb-1.5">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.color || p.fill }}>{p.name}</span>
          <Redacted on={privacy}><span className="text-white font-mono">{fmtDec(p.value)}</span></Redacted>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, privacy, tone = 'text-white' }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      {privacy !== undefined
        ? <Redacted on={privacy}><span className={`text-xl font-bold tabular-nums ${tone}`}>{value}</span></Redacted>
        : <span className={`text-xl font-bold tabular-nums ${tone}`}>{value}</span>}
    </div>
  );
}
