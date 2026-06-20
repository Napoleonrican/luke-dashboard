import { useOutletContext, Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { Redacted } from './CashflowLayout';
import {
  MONTHLY_BILLS, DEBT_ROWS, INPUTS, catColor, fmt, fmtDec,
} from './mockData';

// Consolidated "All Bills & Debts" view from the Financial Workbook. Debt detail
// links over to the existing Debt Payoff Calculator rather than duplicating it.
export default function BillsDebts() {
  const { privacy } = useOutletContext();

  const billsTotal = MONTHLY_BILLS.reduce((s, b) => s + b.monthly, 0);
  const debtMins   = DEBT_ROWS.reduce((s, d) => s + d.monthly, 0);
  const debtBal    = DEBT_ROWS.reduce((s, d) => s + d.balance, 0);
  const maxBill    = Math.max(...MONTHLY_BILLS.map((b) => b.monthly));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Bills / mo" value={fmt(billsTotal)} privacy={privacy} tone="text-blue-400" />
        <Stat label="Debt mins / mo" value={fmt(debtMins)} privacy={privacy} tone="text-purple-400" />
        <Stat label="Total outflow / mo" value={fmt(billsTotal + debtMins)} privacy={privacy} />
        <Stat label="Debt balance" value={fmt(debtBal)} privacy={privacy} tone="text-red-400" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-6">
        {/* Monthly bills */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-base font-semibold mb-4">Monthly Bills &amp; Operating</h2>
          <div className="space-y-2.5">
            {MONTHLY_BILLS.map((b) => (
              <div key={b.name}>
                <div className="flex justify-between items-center text-sm mb-1">
                  <span className="flex items-center gap-2 text-zinc-300">
                    <span className="h-2 w-2 rounded-full" style={{ background: catColor(b.category) }} />
                    {b.name}
                    <span className="text-[10px] text-zinc-600">{b.category}</span>
                  </span>
                  <Redacted on={privacy}><span className="tabular-nums text-zinc-200">{fmtDec(b.monthly)}</span></Redacted>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-1.5 rounded-full" style={{ width: `${(b.monthly / maxBill) * 100}%`, background: catColor(b.category) }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-6">
          {/* Debts */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Debts</h2>
              <Link to="/debt-calculator" className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
                Payoff Calculator <ArrowUpRight size={13} />
              </Link>
            </div>
            <div className="space-y-2">
              {DEBT_ROWS.map((d) => (
                <div key={d.name} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-300">{d.name}</span>
                  <span className="flex gap-4 tabular-nums">
                    <Redacted on={privacy}><span className="text-zinc-500">{fmtDec(d.monthly)}/mo</span></Redacted>
                    <Redacted on={privacy}><span className="text-zinc-200 w-20 text-right">{fmt(d.balance)}</span></Redacted>
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Inputs / targets */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-base font-semibold mb-4">Inputs &amp; Targets</h2>
            <div className="grid grid-cols-2 gap-3">
              {INPUTS.map((i) => (
                <div key={i.label} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                  <p className="text-[11px] text-zinc-500 leading-tight mb-1">{i.label}</p>
                  <Redacted on={privacy}>
                    <span className="text-sm font-semibold tabular-nums text-zinc-200">
                      {fmt(i.value)} <span className="text-[10px] text-zinc-600 font-normal">{i.unit}</span>
                    </span>
                  </Redacted>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, privacy, tone = 'text-white' }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <Redacted on={privacy}><span className={`text-xl font-bold tabular-nums ${tone}`}>{value}</span></Redacted>
    </div>
  );
}
