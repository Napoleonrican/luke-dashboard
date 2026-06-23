import { useState, useEffect } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { Redacted } from './CashflowLayout';
import { fetchBills, fetchDebts, fetchDigitalSubs, fetchConsumableSubs } from '../../lib/fin';
import { fmt, fmtDec, fmtPct, fmtDate, monthlyOf } from './format';
import { monthlyDigital, monthlyConsumable } from './subsAgg';

// Category accent colors (match the workbook's grouping + the nav tints).
const CAT_META = {
  Bill:         { color: '#3b82f6', order: 0 },
  Debt:         { color: '#8b5cf6', order: 1 },
  Operating:    { color: '#f59e0b', order: 2 },
  Subscription: { color: '#ec4899', order: 3 },
};
const metaFor = (cat) => CAT_META[cat] || { color: '#64748b', order: 9 };

// The combined Bills & Debts rollup — one derived view over every obligation.
// Nothing is editable here; each row's source of truth lives on its own tab.
// This is the summary other things (e.g. the Debt Payoff Calculator) build on.
export default function Summary() {
  const { privacy } = useOutletContext();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([fetchBills(), fetchDebts(), fetchDigitalSubs(), fetchConsumableSubs()]).then(
      ([bills, debts, digital, consumable]) => {
        if (!active) return;
        const out = [];

        for (const b of bills.data || []) {
          out.push({
            name: b.name,
            monthly: monthlyOf(b.amount, b.frequency),
            category: b.category || 'Bill',
            balance: null,
            yoy: b.yoy_change ?? null,
            updated: b.updated_on,
          });
        }
        for (const d of debts.data || []) {
          out.push({
            name: d.purchase,
            monthly: d.normal_payment ?? 0,
            category: 'Debt',
            balance: d.balance ?? 0,
            yoy: null,
            updated: d.updated_on,
          });
        }
        // Subscriptions roll up to two summary lines (active only), matching the
        // workbook's "Digital/Consumable Subscriptions" aggregate rows.
        const digitalTotal = (digital.data || []).filter((s) => s.active).reduce((t, s) => t + monthlyDigital(s), 0);
        const consumableTotal = (consumable.data || []).filter((s) => s.active).reduce((t, s) => t + monthlyConsumable(s), 0);
        out.push({ name: 'Digital Subscriptions', monthly: digitalTotal, category: 'Subscription', balance: null, yoy: null, updated: null });
        out.push({ name: 'Consumable Subscriptions', monthly: consumableTotal, category: 'Subscription', balance: null, yoy: null, updated: null });

        setRows(out);
        setLoading(false);
      },
    );
    return () => { active = false; };
  }, []);

  // Group by category, ordered like the workbook; sort within a group by monthly.
  const groups = {};
  for (const r of rows) (groups[r.category] ||= []).push(r);
  const ordered = Object.entries(groups).sort((a, b) => metaFor(a[0]).order - metaFor(b[0]).order);
  for (const [, list] of ordered) list.sort((a, b) => b.monthly - a.monthly);

  const totalMonthly = rows.reduce((s, r) => s + (r.monthly ?? 0), 0);
  const totalDebt = rows.reduce((s, r) => s + (r.balance ?? 0), 0);
  const debtMonthly = (groups.Debt || []).reduce((s, r) => s + (r.monthly ?? 0), 0);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">All Bills &amp; Debts</h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          A live rollup of every obligation. Edit on the individual tabs — this view derives from them.
        </p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total monthly" value={fmt(totalMonthly)} privacy={privacy} tone="text-emerald-400" />
        <StatCard label="Debt balance" value={fmt(totalDebt)} privacy={privacy} tone="text-violet-400" />
        <StatCard label="Debt payments / mo" value={fmt(debtMonthly)} privacy={privacy} tone="text-blue-400" />
        <StatCard label="Annualized" value={fmt(totalMonthly * 12)} privacy={privacy} tone="text-amber-400" />
      </div>

      {/* Rollup table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2.5 font-medium">Item</th>
              <th className="px-3 py-2.5 font-medium text-right">Monthly</th>
              <th className="px-3 py-2.5 font-medium">Category</th>
              <th className="px-3 py-2.5 font-medium text-right">Balance</th>
              <th className="px-3 py-2.5 font-medium text-right">YoY</th>
              <th className="px-3 py-2.5 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-zinc-600">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-zinc-600">Nothing yet — add bills, debts, or subscriptions.</td></tr>
            ) : ordered.map(([category, list]) => {
              const meta = metaFor(category);
              const subtotal = list.reduce((s, r) => s + (r.monthly ?? 0), 0);
              return (
                <GroupRows key={category} category={category} meta={meta} list={list} subtotal={subtotal} privacy={privacy} />
              );
            })}
          </tbody>
          {!loading && rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-zinc-700 font-semibold text-zinc-200">
                <td className="px-3 py-2.5">Total</td>
                <td className="px-3 py-2.5 text-right"><Redacted on={privacy}><span className="tabular-nums text-emerald-400">{fmtDec(totalMonthly)}</span></Redacted></td>
                <td />
                <td className="px-3 py-2.5 text-right"><Redacted on={privacy}><span className="tabular-nums text-violet-400">{fmtDec(totalDebt)}</span></Redacted></td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          Want to model paying these down? The Debt Payoff Calculator can build on this rollup.
        </p>
        <Link to="/debt-calculator" className="text-xs font-medium text-violet-400 hover:text-violet-300 flex items-center gap-1 shrink-0">
          Debt Payoff Calculator <ArrowUpRight size={13} />
        </Link>
      </div>
    </div>
  );
}

function GroupRows({ category, meta, list, subtotal, privacy }) {
  return (
    <>
      <tr style={{ backgroundColor: `${meta.color}14` }}>
        <td colSpan={6} className="px-3 py-1.5">
          <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wide font-semibold" style={{ color: meta.color }}>
            <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
            {category}
            <span className="text-zinc-600 font-normal normal-case">· {list.length}</span>
          </span>
        </td>
      </tr>
      {list.map((r, i) => (
        <tr key={`${category}-${i}`} className="border-b border-zinc-800/60 hover:bg-zinc-800/30">
          <td className="px-3 py-2 text-zinc-200">{r.name}</td>
          <td className="px-3 py-2 text-right"><Redacted on={privacy}><span className="tabular-nums text-zinc-300">{fmtDec(r.monthly)}</span></Redacted></td>
          <td className="px-3 py-2"><span className="text-xs" style={{ color: meta.color }}>{r.category}</span></td>
          <td className="px-3 py-2 text-right">{r.balance == null ? <span className="text-zinc-700">—</span> : <Redacted on={privacy}><span className="tabular-nums text-zinc-400">{fmtDec(r.balance)}</span></Redacted>}</td>
          <td className="px-3 py-2 text-right tabular-nums text-zinc-500">{r.yoy == null ? '' : fmtPct(r.yoy)}</td>
          <td className="px-3 py-2 tabular-nums text-zinc-500">{r.updated ? fmtDate(r.updated) : ''}</td>
        </tr>
      ))}
      <tr className="border-b border-zinc-800 text-xs">
        <td className="px-3 py-1.5 text-right text-zinc-500" >Subtotal</td>
        <td className="px-3 py-1.5 text-right"><Redacted on={privacy}><span className="tabular-nums font-medium" style={{ color: meta.color }}>{fmtDec(subtotal)}</span></Redacted></td>
        <td colSpan={4} />
      </tr>
    </>
  );
}

function StatCard({ label, value, privacy, tone = 'text-white' }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <Redacted on={privacy}><span className={`text-xl font-bold tabular-nums ${tone}`}>{value}</span></Redacted>
    </div>
  );
}
