import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  ArrowDownToLine, SkipForward, X, Plus, Trash2, Layers, CalendarClock,
} from 'lucide-react';
import { Redacted } from './CashflowLayout';
import {
  fetchBills, fetchDebts, fetchDigitalSubs, fetchRunwayManual, fetchRunwayDeck,
  addToDeck, updateDeck, deleteRow, updateRow, upsertRunwayManual, getPref, setPref,
} from '../../lib/fin';
import { fmt, fmtDec, fmtDate } from './format';
import { DaysBadge } from './cells';
import { Td } from './tableparts';
import EditCell from './EditCell';
import WipNotice from './WipNotice';
import {
  normalizeSources, upcomingItems, deckItems, withinWindow, bucketTotals,
  advanceDate, itemKey, TABLE_FOR, DUE_COL_FOR, todayISO,
} from './runway';

const TYPE_COLOR = {
  Bill: '#3b82f6', 'Debt/Loan': '#8b5cf6', 'Digital Sub.': '#ec4899',
  'One-Time': '#f59e0b', 'Consumable Sub.': '#10b981',
};
const typeColor = (t) => TYPE_COLOR[t] || '#94a3b8';
const MANUAL_TYPES = ['Bill', 'Debt/Loan', 'One-Time', 'Digital Sub.'];

const WINDOW_PREF = 'runway_window';
const WINDOWS = [7, 14, 30];

export default function Runway() {
  const { privacy } = useOutletContext();
  const [bills, setBills] = useState([]);
  const [debts, setDebts] = useState([]);
  const [digital, setDigital] = useState([]);
  const [manual, setManual] = useState([]);
  const [deck, setDeck] = useState([]);
  const [loading, setLoading] = useState(true);
  const [windowDays, setWindowDays] = useState(14);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchBills(), fetchDebts(), fetchDigitalSubs(), fetchRunwayManual(), fetchRunwayDeck(),
    ]).then(([b, d, dig, man, dk]) => {
      if (!active) return;
      setBills(b.data || []); setDebts(d.data || []); setDigital(dig.data || []);
      setManual(man.data || []); setDeck(dk.data || []);
      setLoading(false);
    });
    getPref(WINDOW_PREF).then(({ data }) => { if (active && WINDOWS.includes(data)) setWindowDays(data); });
    return () => { active = false; };
  }, []);

  const setWindow = (n) => { setWindowDays(n); setPref(WINDOW_PREF, n); };

  // Derived views.
  const items = normalizeSources({ bills, debts, digital, manual });
  const deckSet = new Set(deck.map((r) => itemKey(r.source_kind, r.source_id)));
  const upcoming = upcomingItems(items, windowDays, deckSet);
  const onDeck = deckItems(deck, items);
  const totals = bucketTotals(withinWindow(items, windowDays));

  // ── Actions ────────────────────────────────────────────────────────────────
  const moveToDeck = async (it) => {
    const { data } = await addToDeck(it.source_kind, it.source_id);
    if (data?.[0]) setDeck((prev) => [...prev.filter((r) => r.id !== data[0].id), data[0]]);
  };

  const removeFromDeck = async (deckId) => {
    setDeck((prev) => prev.filter((r) => r.id !== deckId));
    await deleteRow('fin_runway_deck', deckId);
  };

  const togglePending = async (deckId, val) => {
    setDeck((prev) => prev.map((r) => r.id === deckId ? { ...r, pending_withdrawal: val } : r));
    await updateDeck(deckId, { pending_withdrawal: val });
  };

  // Patch the matching source row's due date (+ updated_on, where the table
  // has one) in local state.
  const patchSourceDue = (kind, id, fields) => {
    const setter = { bill: setBills, debt: setDebts, digital: setDigital, manual: setManual }[kind];
    setter?.((prev) => prev.map((r) => r.id === id ? { ...r, ...fields } : r));
  };

  // Tables that track a manual "last verified" date, distinct from updated_at.
  const HAS_UPDATED_ON = { bill: true, debt: true, digital: true, manual: false };

  // Roll an item to its next due date (and drop it from the deck if it was on
  // it — it's been handled). Also stamps "Updated" to today, since advancing
  // is effectively confirming the item as current. One-Time items have no
  // next date; the action is hidden for them.
  const advance = async (it, deckId) => {
    const next = advanceDate(it.dueISO, it.frequency);
    if (!next) return;
    const fields = { [DUE_COL_FOR[it.source_kind]]: next };
    if (HAS_UPDATED_ON[it.source_kind]) fields.updated_on = todayISO();
    patchSourceDue(it.source_kind, it.source_id, fields);
    if (deckId) { setDeck((prev) => prev.filter((r) => r.id !== deckId)); await deleteRow('fin_runway_deck', deckId); }
    await updateRow(TABLE_FOR[it.source_kind], it.source_id, fields);
  };

  const canAdvance = (it) => !!advanceDate(it.dueISO, it.frequency);

  // ── Manual (ad-hoc) entries ──────────────────────────────────────────────────
  const updateManual = async (id, field, value) => {
    setManual((prev) => prev.map((m) => m.id === id ? { ...m, [field]: value } : m));
    await upsertRunwayManual({ id, [field]: value });
  };
  const addManual = async () => {
    const { data } = await upsertRunwayManual({
      name: 'New item', amount: 0, bill_type: 'One-Time',
      next_due_date: todayISO(), sort_order: manual.length,
    });
    if (data?.[0]) setManual((prev) => [...prev, data[0]]);
  };
  const removeManual = async (id) => {
    setManual((prev) => prev.filter((m) => m.id !== id));
    setDeck((prev) => prev.filter((r) => !(r.source_kind === 'manual' && r.source_id === id)));
    await deleteRow('fin_runway_manual', id);
  };

  return (
    <div className="space-y-6">
      <WipNotice>
        Work in progress — this pulls live from your Bills, Debts &amp; Subscriptions,
        but is still being refined; don&rsquo;t treat it as final yet.
      </WipNotice>

      {/* Top: window selector + bill/debt/total headline for the window */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <CalendarClock size={17} className="text-amber-400" /> Short Term Needs
        </h2>
        <div className="inline-flex rounded-lg border border-zinc-700 bg-zinc-800 p-0.5">
          {WINDOWS.map((n) => (
            <button
              key={n}
              onClick={() => setWindow(n)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                windowDays === n ? 'bg-amber-900/40 text-amber-300' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {n} days
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label={`Bills — next ${windowDays}d`} value={fmt(totals.bills)} privacy={privacy} tone="text-blue-400" />
        <Stat label={`Debts — next ${windowDays}d`} value={fmt(totals.debt)} privacy={privacy} tone="text-violet-400" />
        <Stat label={`Total — next ${windowDays}d`} value={fmt(totals.total)} privacy={privacy} tone="text-amber-400" />
        <Stat label="On Deck" value={String(onDeck.length)} />
      </div>

      {/* On Deck / Pending Withdrawal */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
          <Layers size={15} className="text-emerald-400" />
          <h3 className="text-sm font-semibold">On Deck</h3>
          <span className="text-xs text-zinc-500">— staged to pay · mark Pending once triggered</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium">Due</th>
                <th className="px-3 py-2 font-medium text-right">Amount</th>
                <th className="px-3 py-2 font-medium text-right">Days</th>
                <th className="px-3 py-2 font-medium text-center">Pending</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {onDeck.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-zinc-600 text-xs">Nothing on deck. Move items down from the upcoming list below.</td></tr>
              ) : onDeck.map((it) => (
                <tr key={it.deckId} className={`border-b border-zinc-800/60 last:border-0 group ${it.pending_withdrawal ? 'bg-amber-950/20' : 'hover:bg-zinc-800/30'}`}>
                  <NameCell it={it} />
                  <Td className="tabular-nums text-zinc-300">{fmtDate(it.dueISO)}</Td>
                  <AmountCell amount={it.amount} privacy={privacy} />
                  <Td className="text-right"><DaysBadge iso={it.dueISO} /></Td>
                  <Td className="text-center">
                    <input type="checkbox" checked={!!it.pending_withdrawal}
                      onChange={(e) => togglePending(it.deckId, e.target.checked)}
                      className="h-4 w-4 accent-amber-500 cursor-pointer" title="Pending Withdrawal" />
                  </Td>
                  <Td className="text-right">
                    <span className="inline-flex items-center gap-2 justify-end">
                      {canAdvance(it) && (
                        <button onClick={() => advance(it, it.deckId)} title="Advance to next due date & clear"
                          className="text-zinc-500 hover:text-emerald-400 transition-colors"><SkipForward size={14} /></button>
                      )}
                      <button onClick={() => removeFromDeck(it.deckId)} title="Remove from On Deck"
                        className="text-zinc-500 hover:text-red-400 transition-colors"><X size={15} /></button>
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Upcoming in window */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
          <CalendarClock size={15} className="text-amber-400" />
          <h3 className="text-sm font-semibold">Coming Up — next {windowDays} days</h3>
          <span className="text-xs text-zinc-500">— live from Bills, Debts, Subscriptions &amp; ad-hoc</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium">Due</th>
                <th className="px-3 py-2 font-medium text-right">Amount</th>
                <th className="px-3 py-2 font-medium text-right">Days</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-zinc-600">Loading…</td></tr>
              ) : upcoming.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-zinc-600 text-xs">Nothing due in the next {windowDays} days.</td></tr>
              ) : upcoming.map((it) => (
                <tr key={it.key} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 group">
                  <NameCell it={it} />
                  <Td className="tabular-nums text-zinc-300">{fmtDate(it.dueISO)}</Td>
                  <AmountCell amount={it.amount} privacy={privacy} />
                  <Td className="text-right"><DaysBadge iso={it.dueISO} /></Td>
                  <Td className="text-right">
                    <span className="inline-flex items-center gap-2 justify-end">
                      {canAdvance(it) && (
                        <button onClick={() => advance(it)} title="Advance to next due date"
                          className="text-zinc-500 hover:text-emerald-400 transition-colors opacity-0 group-hover:opacity-100"><SkipForward size={14} /></button>
                      )}
                      <button onClick={() => moveToDeck(it)}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-700/60 bg-emerald-900/20 px-2 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-900/40 transition-colors">
                        <ArrowDownToLine size={13} /> On Deck
                      </button>
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Ad Hoc / Manual entry */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Plus size={15} className="text-zinc-400" />
            <h3 className="text-sm font-semibold">Ad Hoc / Manual Entry</h3>
            <span className="text-xs text-zinc-500">— one-offs not on the Bills or Debts tabs</span>
          </div>
          <button onClick={addManual} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-600 bg-emerald-900/30 text-xs font-medium text-emerald-400 hover:bg-emerald-900/50 transition-colors">
            <Plus size={14} /> Add item
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium">Due</th>
                <th className="px-3 py-2 font-medium text-right">Amount</th>
                <th className="px-3 py-2 font-medium text-right">Days</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {manual.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-zinc-600 text-xs">No manual items. Add rent-service or other one-off charges here.</td></tr>
              ) : manual.map((m) => (
                <tr key={m.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 group">
                  <Td>
                    <span className="flex items-center gap-2">
                      <select
                        value={m.bill_type} onChange={(e) => updateManual(m.id, 'bill_type', e.target.value)}
                        title={`${m.bill_type} — click to change`}
                        className="h-2.5 w-2.5 shrink-0 rounded-full border-0 p-0 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-900"
                        style={{ background: typeColor(m.bill_type) }}
                      >
                        {MANUAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <EditCell value={m.name} onSave={(v) => updateManual(m.id, 'name', v)} className="text-zinc-200 font-medium" />
                    </span>
                  </Td>
                  <Td><EditCell type="date" value={m.next_due_date} onSave={(v) => updateManual(m.id, 'next_due_date', v)} display={fmtDate} className="text-zinc-300 tabular-nums" /></Td>
                  <Td className="text-right">
                    <Redacted on={privacy}><EditCell type="number" value={m.amount} onSave={(v) => updateManual(m.id, 'amount', v)} display={fmtDec} className="text-zinc-200 tabular-nums" /></Redacted>
                  </Td>
                  <Td className="text-right"><DaysBadge iso={m.next_due_date} /></Td>
                  <Td className="text-right">
                    <button onClick={() => removeManual(m.id)} className="opacity-0 group-hover:opacity-40 hover:!opacity-100 text-red-400 transition-opacity"><Trash2 size={13} /></button>
                  </Td>
                </tr>
              ))}
            </tbody>
            {manual.length > 0 && (
              <tfoot>
                <tr className="border-t border-zinc-800 text-zinc-400">
                  <Td className="font-medium text-zinc-300" colSpan={2}>Total</Td>
                  <Td className="text-right font-semibold text-emerald-400">
                    <Redacted on={privacy}><span className="tabular-nums">{fmtDec(manual.reduce((s, m) => s + (m.amount ?? 0), 0))}</span></Redacted>
                  </Td>
                  <Td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      <p className="text-[11px] text-zinc-600 flex flex-wrap gap-4">
        <span><span className="inline-block h-2 w-2 rounded-full align-middle mr-1" style={{ background: 'hsl(0 85% 65%)' }} />Due soon / overdue</span>
        <span><span className="inline-block h-2 w-2 rounded-full align-middle mr-1" style={{ background: 'hsl(60 80% 60%)' }} />Coming up</span>
        <span><span className="inline-block h-2 w-2 rounded-full align-middle mr-1" style={{ background: 'hsl(120 70% 55%)' }} />Plenty of runway</span>
      </p>
    </div>
  );
}

// ── Small presentational cells ────────────────────────────────────────────────
// The colored dot doubles as the type indicator — hover it for the type name
// instead of a dedicated column.
function NameCell({ it }) {
  return (
    <Td>
      <span className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: typeColor(it.type) }} title={it.type} />
        <span className="text-zinc-200 font-medium">{it.name}</span>
      </span>
    </Td>
  );
}

function AmountCell({ amount, privacy }) {
  return (
    <Td className="text-right">
      <Redacted on={privacy}><span className="tabular-nums text-zinc-200">{fmtDec(amount)}</span></Redacted>
    </Td>
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
