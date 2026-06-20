import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ArrowDownToLine, Wallet, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Redacted } from './CashflowLayout';
import { INFLOW, BALANCES, WATERFALL, fmt, fmtDec } from './mockData';

// The Cash Waterfall — weekly allocation engine. Available funds pour through
// prioritized steps (hard gates → surplus slices → absorbers). The hero answer
// is "how much more DoorDash do I need to clear the hard gates this week?".
export default function Waterfall() {
  const { privacy } = useOutletContext();
  const [doordash, setDoordash] = useState(INFLOW.doordash);

  const cashOnHand = BALANCES.reduce((s, b) => s + b.balance, 0);
  const available  = INFLOW.paycheck + doordash + cashOnHand;

  // Hard gates are the must-fund tier; what's left to cover drives the goal.
  const hardGates  = WATERFALL[0].steps.reduce((s, st) => s + st.need, 0);
  const stillNeeded = Math.max(0, hardGates - available);

  // Demo allocation: pour available down the steps in order until it runs out.
  const allocated = useMemo(() => {
    let pool = available;
    const out = {};
    for (const g of WATERFALL) for (const st of g.steps) {
      const a = Math.min(pool, st.need);
      out[st.id] = a; pool -= a;
    }
    return { map: out, leftover: pool };
  }, [available]);

  const gatesMet = stillNeeded <= 0;

  return (
    <div className="space-y-6">
      {/* Top strip: available, gates, goal */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1.2fr] gap-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex items-center gap-2 text-zinc-500 mb-3">
            <Wallet size={15} className="text-emerald-400" /><span className="text-xs">Available this week</span>
          </div>
          <Redacted on={privacy}>
            <p className="text-3xl font-bold text-emerald-400 tabular-nums">{fmt(available)}</p>
          </Redacted>
          <div className="mt-3 space-y-1 text-xs text-zinc-500">
            <Line k="Paycheck" v={INFLOW.paycheck} privacy={privacy} />
            <div className="flex justify-between items-center">
              <span>DoorDash (editable)</span>
              <div className="flex items-center gap-1">
                <span className="text-zinc-600">$</span>
                <input type="number" value={doordash}
                  onChange={(e) => setDoordash(Math.max(0, parseFloat(e.target.value) || 0))}
                  className={`w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-right text-xs text-white focus:outline-none focus:border-emerald-500 ${privacy ? 'blur-sm' : ''}`} />
              </div>
            </div>
            <Line k="Cash on hand" v={cashOnHand} privacy={privacy} />
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex items-center gap-2 text-zinc-500 mb-3">
            <ArrowDownToLine size={15} className="text-blue-400" /><span className="text-xs">Hard gates to clear</span>
          </div>
          <Redacted on={privacy}>
            <p className="text-3xl font-bold text-white tabular-nums">{fmt(hardGates)}</p>
          </Redacted>
          <p className="mt-3 text-xs text-zinc-500">
            Essentials, 7-day bill & debt runway, and the core stability floor build.
          </p>
        </div>

        <div className={`rounded-xl border p-5 ${gatesMet ? 'border-emerald-800/50 bg-emerald-950/20' : 'border-amber-800/50 bg-amber-950/20'}`}>
          <div className="flex items-center gap-2 mb-3">
            {gatesMet ? <CheckCircle2 size={15} className="text-emerald-400" /> : <AlertTriangle size={15} className="text-amber-400" />}
            <span className="text-xs text-zinc-400">{gatesMet ? 'Gates covered' : 'DoorDash still needed'}</span>
          </div>
          {gatesMet ? (
            <>
              <Redacted on={privacy}><p className="text-3xl font-bold text-emerald-400 tabular-nums">{fmt(allocated.leftover)}</p></Redacted>
              <p className="mt-3 text-xs text-emerald-600/80">surplus flowing into savings & debt cleanup ✓</p>
            </>
          ) : (
            <>
              <Redacted on={privacy}><p className="text-3xl font-bold text-amber-400 tabular-nums">{fmt(stillNeeded)}</p></Redacted>
              <p className="mt-3 text-xs text-amber-600/80">earn this much more to clear every hard gate</p>
            </>
          )}
        </div>
      </div>

      {/* The waterfall steps */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        {WATERFALL.map((group) => (
          <section key={group.group} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-sm font-semibold text-zinc-200">{group.group}</h2>
            <p className="text-xs text-zinc-500 mt-0.5 mb-4">{group.note}</p>
            <div className="space-y-3">
              {group.steps.map((st) => {
                const a    = allocated.map[st.id] || 0;
                const pct  = st.need > 0 ? Math.min(100, (a / st.need) * 100) : (a > 0 ? 100 : 0);
                const full = st.need > 0 && a >= st.need - 0.01;
                return (
                  <div key={st.id}>
                    <div className="flex justify-between items-baseline gap-2 mb-1">
                      <span className="text-xs text-zinc-300 leading-snug">
                        <span className="text-zinc-600 mr-1">{st.id}</span>{st.label}
                        {st.pct && <span className="text-zinc-600"> · {st.pct}%</span>}
                      </span>
                      <Redacted on={privacy}>
                        <span className="text-xs tabular-nums text-zinc-500 shrink-0">
                          {st.need > 0 ? fmt(st.need) : '—'}
                        </span>
                      </Redacted>
                    </div>
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div className={`h-1.5 rounded-full transition-all ${full ? 'bg-emerald-500' : 'bg-blue-500'}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <p className="text-xs text-zinc-600">
        Demo: allocation pours available funds top-down until they run out. The real engine
        applies the surplus percentages (5a/5b/5c) and self-limiting absorber targets from your Inputs sheet.
      </p>
    </div>
  );
}

function Line({ k, v, privacy }) {
  return (
    <div className="flex justify-between">
      <span>{k}</span>
      <Redacted on={privacy}><span className="tabular-nums text-zinc-400">{fmtDec(v)}</span></Redacted>
    </div>
  );
}
