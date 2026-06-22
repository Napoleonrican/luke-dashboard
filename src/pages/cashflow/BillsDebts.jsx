import { useState, useEffect } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { ArrowUpRight, Pencil, Check, X, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Redacted } from './CashflowLayout';
import {
  fetchBills, fetchDebts, fetchDigitalSubs, fetchConsumableSubs, fetchInputs,
  upsertBill, upsertDebt, upsertDigitalSub, upsertConsumableSub, upsertInput,
  deleteRow,
} from '../../lib/fin';

// ── Formatting helpers ────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n ?? 0);
const fmtDec = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);

const CAT_COLOR = { Bill: '#3b82f6', Operating: '#10b981', Subscription: '#ec4899', 'Digital Sub.': '#ec4899' };
const catColor = (c) => CAT_COLOR[c] || '#94a3b8';

// ── Inline editable cell ──────────────────────────────────────────────────────
function EditCell({ value, type = 'text', onSave, className = '' }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    const parsed = type === 'number' ? (parseFloat(draft) || 0) : draft;
    onSave(parsed);
    setEditing(false);
  };
  const cancel = () => { setDraft(value); setEditing(false); };

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(value); setEditing(true); }}
        className={`group flex items-center gap-1 text-left hover:text-white transition-colors ${className}`}
      >
        {value}
        <Pencil size={11} className="opacity-0 group-hover:opacity-40 shrink-0" />
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <input
        autoFocus
        type={type === 'number' ? 'number' : 'text'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
        className="w-24 rounded border border-emerald-600 bg-zinc-800 px-1.5 py-0.5 text-xs text-white focus:outline-none"
        step={type === 'number' ? '0.01' : undefined}
      />
      <button onClick={commit} className="text-emerald-400 hover:text-emerald-300"><Check size={13} /></button>
      <button onClick={cancel} className="text-zinc-500 hover:text-zinc-300"><X size={13} /></button>
    </span>
  );
}

// ── Generic hook: fetch once on mount ────────────────────────────────────────
// fetcher must be a stable module-level function (not re-created on render).
function useFin(fetcher) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetcher().then(({ data }) => {
      if (!active) return;
      if (data) setRows(data);
      setLoading(false);
    });
    return () => { active = false; };
  // fetcher is a stable module-level import — intentionally omitted from deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [rows, setRows, loading];
}

// ── Bills section ─────────────────────────────────────────────────────────────
function BillsSection({ privacy }) {
  const [bills, setBills, loading] = useFin(fetchBills);

  const updateField = async (id, field, value) => {
    setBills((prev) => prev.map((b) => b.id === id ? { ...b, [field]: value } : b));
    await upsertBill({ id, [field]: value });
  };

  const addBill = async () => {
    const { data } = await upsertBill({ name: 'New Bill', amount: 0, category: 'Bill', sort_order: bills.length });
    if (data?.[0]) setBills((prev) => [...prev, data[0]]);
    else { const { data: fresh } = await fetchBills(); if (fresh) setBills(fresh); }
  };

  const removeBill = async (id) => {
    setBills((prev) => prev.filter((b) => b.id !== id));
    await deleteRow('fin_bills', id);
  };

  const total = bills.reduce((s, b) => s + (b.amount ?? 0), 0);
  const maxAmt = Math.max(1, ...bills.map((b) => b.amount ?? 0));

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold">Bills &amp; Operating</h2>
        <div className="flex items-center gap-3">
          <Redacted on={privacy}><span className="text-sm text-zinc-400 tabular-nums">{fmtDec(total)}/mo</span></Redacted>
          <button onClick={addBill} className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>
      {loading ? <Skeleton rows={6} /> : (
        <div className="space-y-2.5">
          {bills.map((b) => (
            <div key={b.id}>
              <div className="flex justify-between items-center text-sm mb-1 group">
                <span className="flex items-center gap-2 text-zinc-300 min-w-0 flex-1 mr-2">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: catColor(b.category) }} />
                  <EditCell value={b.name} onSave={(v) => updateField(b.id, 'name', v)} className="text-zinc-300 truncate" />
                  <span className="text-[10px] text-zinc-600 shrink-0">{b.category}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <Redacted on={privacy}>
                    <EditCell value={b.amount ?? 0} type="number" onSave={(v) => updateField(b.id, 'amount', v)} className="tabular-nums text-zinc-200" />
                  </Redacted>
                  <button onClick={() => removeBill(b.id)} className="opacity-0 group-hover:opacity-40 hover:!opacity-100 text-red-400"><Trash2 size={12} /></button>
                </span>
              </div>
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-1.5 rounded-full transition-all" style={{ width: `${((b.amount ?? 0) / maxAmt) * 100}%`, background: catColor(b.category) }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Debts section ─────────────────────────────────────────────────────────────
function DebtsSection({ privacy }) {
  const [debts, setDebts, loading] = useFin(fetchDebts);
  const [expanded, setExpanded] = useState(null);

  const updateField = async (id, field, value) => {
    setDebts((prev) => prev.map((d) => d.id === id ? { ...d, [field]: value } : d));
    await upsertDebt({ id, [field]: value });
  };

  const addDebt = async () => {
    const { data } = await upsertDebt({ purchase: 'New Debt', balance: 0, normal_payment: 0, sort_order: debts.length });
    if (data?.[0]) setDebts((prev) => [...prev, data[0]]);
    else { const { data: fresh } = await fetchDebts(); if (fresh) setDebts(fresh); }
  };

  const removeDebt = async (id) => {
    setDebts((prev) => prev.filter((d) => d.id !== id));
    await deleteRow('fin_debts', id);
  };

  const totalMins = debts.reduce((s, d) => s + (d.normal_payment ?? 0), 0);
  const totalBal  = debts.reduce((s, d) => s + (d.balance ?? 0), 0);

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold">Debts</h2>
        <div className="flex items-center gap-3">
          <Link to="/debt-calculator" className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
            Payoff Calc <ArrowUpRight size={13} />
          </Link>
          <button onClick={addDebt} className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>
      {loading ? <Skeleton rows={5} /> : (
        <div className="space-y-1">
          {debts.map((d) => (
            <div key={d.id}>
              <div className="flex items-center justify-between text-sm py-1 group rounded hover:bg-zinc-800/40 px-1 -mx-1 transition-colors">
                <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                  <button onClick={() => setExpanded(expanded === d.id ? null : d.id)} className="text-zinc-600 hover:text-zinc-400 shrink-0">
                    {expanded === d.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                  <EditCell value={d.purchase} onSave={(v) => updateField(d.id, 'purchase', v)} className="text-zinc-300 truncate" />
                  {d.lender && <span className="text-[10px] text-zinc-600 shrink-0">{d.lender}</span>}
                </div>
                <span className="flex items-center gap-4 tabular-nums shrink-0">
                  <Redacted on={privacy}><span className="text-zinc-500">{fmtDec(d.normal_payment)}/mo</span></Redacted>
                  <Redacted on={privacy}><span className="text-zinc-200 w-20 text-right">{fmt(d.balance)}</span></Redacted>
                  <button onClick={() => removeDebt(d.id)} className="opacity-0 group-hover:opacity-40 hover:!opacity-100 text-red-400"><Trash2 size={12} /></button>
                </span>
              </div>
              {expanded === d.id && (
                <div className="ml-7 mb-2 grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-lg bg-zinc-800/50 border border-zinc-800">
                  <AdvField label="Balance" value={d.balance} type="number" privacy={privacy} onSave={(v) => updateField(d.id, 'balance', v)} />
                  <AdvField label="Payment" value={d.normal_payment} type="number" privacy={privacy} onSave={(v) => updateField(d.id, 'normal_payment', v)} />
                  <AdvField label="Next due" value={d.next_due_date ?? '—'} onSave={(v) => updateField(d.id, 'next_due_date', v)} />
                  <AdvField label="Day due" value={d.day_due ?? '—'} type="number" onSave={(v) => updateField(d.id, 'day_due', v)} />
                  <AdvField label="APR" value={d.apr != null ? `${(d.apr * 100).toFixed(2)}%` : '—'} />
                  <AdvField label="Pmts remain." value={d.payments_remaining ?? '—'} type="number" onSave={(v) => updateField(d.id, 'payments_remaining', v)} />
                  <AdvField label="Expected payoff" value={d.expected_payoff_date ?? '—'} />
                  <AdvField label="Type" value={d.credit_type ?? '—'} onSave={(v) => updateField(d.id, 'credit_type', v)} />
                  <AdvField label="Priority" value={d.paydown_priority ?? '—'} type="number" onSave={(v) => updateField(d.id, 'paydown_priority', v)} />
                </div>
              )}
            </div>
          ))}
          <div className="flex justify-between text-xs text-zinc-500 pt-2 mt-1 border-t border-zinc-800 px-1">
            <span>Total minimums</span>
            <span className="flex gap-4 tabular-nums">
              <Redacted on={privacy}><span>{fmtDec(totalMins)}/mo</span></Redacted>
              <Redacted on={privacy}><span className="w-20 text-right text-zinc-400">{fmt(totalBal)}</span></Redacted>
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Digital Subscriptions ─────────────────────────────────────────────────────
function DigitalSubsSection({ privacy }) {
  const [subs, setSubs, loading] = useFin(fetchDigitalSubs);

  const updateField = async (id, field, value) => {
    setSubs((prev) => prev.map((s) => s.id === id ? { ...s, [field]: value } : s));
    await upsertDigitalSub({ id, [field]: value });
  };

  const addSub = async () => {
    const { data } = await upsertDigitalSub({ name: 'New Subscription', amount: 0, frequency: 'Monthly', sort_order: subs.length });
    if (data?.[0]) setSubs((prev) => [...prev, data[0]]);
    else { const { data: fresh } = await fetchDigitalSubs(); if (fresh) setSubs(fresh); }
  };

  const removeSub = async (id) => {
    setSubs((prev) => prev.filter((s) => s.id !== id));
    await deleteRow('fin_digital_subscriptions', id);
  };

  const total = subs.reduce((s, sub) => {
    const monthly = sub.frequency === 'Annually' ? (sub.amount ?? 0) / 12 : (sub.amount ?? 0);
    return s + monthly;
  }, 0);

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold">Digital Subscriptions</h2>
        <div className="flex items-center gap-3">
          <Redacted on={privacy}><span className="text-sm text-zinc-400 tabular-nums">{fmtDec(total)}/mo</span></Redacted>
          <button onClick={addSub} className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>
      {loading ? <Skeleton rows={4} /> : (
        <div className="space-y-1">
          {subs.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-sm py-1 group rounded hover:bg-zinc-800/40 px-1 -mx-1 transition-colors">
              <span className="flex items-center gap-2 min-w-0 flex-1 mr-2 text-zinc-300">
                <span className="h-1.5 w-1.5 rounded-full shrink-0 bg-pink-500" />
                <EditCell value={s.name} onSave={(v) => updateField(s.id, 'name', v)} className="truncate" />
                <span className="text-[10px] text-zinc-600 shrink-0">{s.frequency}</span>
              </span>
              <span className="flex items-center gap-2 shrink-0 tabular-nums">
                <Redacted on={privacy}>
                  <EditCell value={s.amount ?? 0} type="number" onSave={(v) => updateField(s.id, 'amount', v)} className="text-zinc-200" />
                </Redacted>
                <button onClick={() => removeSub(s.id)} className="opacity-0 group-hover:opacity-40 hover:!opacity-100 text-red-400"><Trash2 size={12} /></button>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Consumable Subscriptions ──────────────────────────────────────────────────
function ConsumableSubsSection({ privacy }) {
  const [subs, setSubs, loading] = useFin(fetchConsumableSubs);

  const updateField = async (id, field, value) => {
    setSubs((prev) => prev.map((s) => s.id === id ? { ...s, [field]: value } : s));
    await upsertConsumableSub({ id, [field]: value });
  };

  const addSub = async () => {
    const { data } = await upsertConsumableSub({ name: 'New Item', cost_per_order: 0, order_frequency_days: 30, sort_order: subs.length });
    if (data?.[0]) setSubs((prev) => [...prev, data[0]]);
    else { const { data: fresh } = await fetchConsumableSubs(); if (fresh) setSubs(fresh); }
  };

  const removeSub = async (id) => {
    setSubs((prev) => prev.filter((s) => s.id !== id));
    await deleteRow('fin_consumable_subscriptions', id);
  };

  const total = subs.reduce((s, sub) => s + (sub.monthly_estimate ?? 0), 0);

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold">Consumable Subscriptions</h2>
        <div className="flex items-center gap-3">
          <Redacted on={privacy}><span className="text-sm text-zinc-400 tabular-nums">{fmtDec(total)}/mo est.</span></Redacted>
          <button onClick={addSub} className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>
      {loading ? <Skeleton rows={4} /> : (
        <div className="space-y-1">
          {subs.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-sm py-1 group rounded hover:bg-zinc-800/40 px-1 -mx-1 transition-colors">
              <span className="flex items-center gap-2 min-w-0 flex-1 mr-2 text-zinc-300">
                <span className="h-1.5 w-1.5 rounded-full shrink-0 bg-emerald-500" />
                <EditCell value={s.name} onSave={(v) => updateField(s.id, 'name', v)} className="truncate" />
                <span className="text-[10px] text-zinc-600 shrink-0">every {s.order_frequency_days}d</span>
              </span>
              <span className="flex items-center gap-3 shrink-0 tabular-nums text-xs">
                <Redacted on={privacy}><span className="text-zinc-500">{fmtDec(s.cost_per_order)}/order</span></Redacted>
                <Redacted on={privacy}><span className="text-zinc-200">≈{fmtDec(s.monthly_estimate ?? 0)}/mo</span></Redacted>
                <button onClick={() => removeSub(s.id)} className="opacity-0 group-hover:opacity-40 hover:!opacity-100 text-red-400"><Trash2 size={12} /></button>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Inputs / targets ──────────────────────────────────────────────────────────
function InputsSection({ privacy }) {
  const [inputs, setInputs, loading] = useFin(fetchInputs);

  const updateValue = async (id, value) => {
    setInputs((prev) => prev.map((i) => i.id === id ? { ...i, value } : i));
    await upsertInput({ id, value });
  };

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <h2 className="text-base font-semibold mb-4">Inputs &amp; Targets</h2>
      {loading ? <Skeleton rows={4} /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {inputs.map((i) => (
            <div key={i.id} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
              <p className="text-[11px] text-zinc-500 leading-tight mb-1.5 truncate" title={i.label}>{i.label}</p>
              <Redacted on={privacy}>
                <div className="flex items-baseline gap-1">
                  <EditCell
                    value={i.value ?? 0}
                    type="number"
                    onSave={(v) => updateValue(i.id, v)}
                    className="text-sm font-semibold tabular-nums text-zinc-200"
                  />
                  {i.unit && <span className="text-[10px] text-zinc-600 font-normal">{i.unit}</span>}
                </div>
              </Redacted>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Summary stats ─────────────────────────────────────────────────────────────
function SummaryStats({ privacy }) {
  const [bills, setBills] = useState([]);
  const [debts, setDebts] = useState([]);
  const [digitalSubs, setDigitalSubs] = useState([]);
  const [consumableSubs, setConsumableSubs] = useState([]);

  useEffect(() => {
    fetchBills().then(({ data }) => data && setBills(data));
    fetchDebts().then(({ data }) => data && setDebts(data));
    fetchDigitalSubs().then(({ data }) => data && setDigitalSubs(data));
    fetchConsumableSubs().then(({ data }) => data && setConsumableSubs(data));
  }, []);

  const billsTotal = bills.reduce((s, b) => s + (b.amount ?? 0), 0);
  const debtMins   = debts.reduce((s, d) => s + (d.normal_payment ?? 0), 0);
  const debtBal    = debts.reduce((s, d) => s + (d.balance ?? 0), 0);
  const subTotal   = digitalSubs.reduce((s, sub) => {
    return s + (sub.frequency === 'Annually' ? (sub.amount ?? 0) / 12 : (sub.amount ?? 0));
  }, 0) + consumableSubs.reduce((s, sub) => s + (sub.monthly_estimate ?? 0), 0);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatCard label="Bills & Operating / mo" value={fmt(billsTotal)} privacy={privacy} tone="text-blue-400" />
      <StatCard label="Subscriptions / mo" value={fmt(subTotal)} privacy={privacy} tone="text-pink-400" />
      <StatCard label="Debt mins / mo" value={fmt(debtMins)} privacy={privacy} tone="text-purple-400" />
      <StatCard label="Debt balance" value={fmt(debtBal)} privacy={privacy} tone="text-red-400" />
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function StatCard({ label, value, privacy, tone = 'text-white' }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <Redacted on={privacy}><span className={`text-xl font-bold tabular-nums ${tone}`}>{value}</span></Redacted>
    </div>
  );
}

function AdvField({ label, value, type, privacy, onSave }) {
  return (
    <div>
      <p className="text-[10px] text-zinc-600 mb-0.5">{label}</p>
      {onSave ? (
        <Redacted on={privacy}>
          <EditCell value={value} type={type} onSave={onSave} className="text-xs text-zinc-300" />
        </Redacted>
      ) : (
        <Redacted on={privacy}><span className="text-xs text-zinc-300">{value}</span></Redacted>
      )}
    </div>
  );
}

function Skeleton({ rows = 4 }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-6 bg-zinc-800 rounded" style={{ opacity: 1 - i * 0.15 }} />
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function BillsDebts() {
  const { privacy } = useOutletContext();

  return (
    <div className="space-y-6">
      <SummaryStats privacy={privacy} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <BillsSection privacy={privacy} />
        <DebtsSection privacy={privacy} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <DigitalSubsSection privacy={privacy} />
        <ConsumableSubsSection privacy={privacy} />
      </div>

      <InputsSection privacy={privacy} />
    </div>
  );
}
