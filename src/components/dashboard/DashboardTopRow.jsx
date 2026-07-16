import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ChevronDown, Grid3x3, Wallet, ExternalLink, Lock, Bot } from 'lucide-react';
import { byPlacement, MODULES } from '../../pages/homeModules';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
const todayLabel = () =>
  new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

// Close a popover when clicking anywhere outside its ref.
function useClickOutside(ref, onClose) {
  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', (e) => e.key === 'Escape' && onClose());
    return () => document.removeEventListener('mousedown', handle);
  }, [ref, onClose]);
}

// Big, thumb-friendly action button (matches the Gig/Money prominence).
function ActionButton({ icon: Icon, label, to, accent, onClick, chevron }) {
  const cls =
    'flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-100 transition-colors hover:border-zinc-500 hover:bg-zinc-800';
  const inner = (
    <>
      <Icon size={17} className={accent} strokeWidth={2} />
      {label}
      {chevron && <ChevronDown size={14} className="text-zinc-500" />}
    </>
  );
  if (to) return <Link to={to} className={cls}>{inner}</Link>;
  return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
}

// "Money" — a grouped doorway to Cashflow and Debt Payoff. Keeps the two modules
// entirely separate (each its own route); the button just collects the two
// "focus-session" money tools behind one entry point.
function MoneyButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));
  const items = byPlacement('action-money');

  return (
    <div className="relative" ref={ref}>
      <ActionButton icon={Wallet} label="Money" accent="text-emerald-400" chevron onClick={() => setOpen((o) => !o)} />
      {open && (
        <div className="absolute left-0 sm:left-auto sm:right-0 z-20 mt-2 w-56 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl shadow-black/40">
          {items.map((m) => (
            <Link
              key={m.id}
              to={m.to}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-800"
            >
              <m.icon size={16} className={m.accent} strokeWidth={1.75} />
              <span className="flex-1 text-sm text-zinc-100">{m.title}</span>
              {m.locked && <Lock size={12} className="text-zinc-600" />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// "All modules" — the universal launcher. Lists every module (including the odd
// ones out); selecting one closes the menu and opens that page.
function AllModulesButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  useClickOutside(ref, () => setOpen(false));

  function go(m) {
    setOpen(false);
    if (m.wip) return;
    if (m.to) navigate(m.to);
    else if (m.href) window.open(m.href, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-100 transition-colors hover:border-zinc-500 hover:bg-zinc-800"
        aria-label="All modules"
      >
        <Grid3x3 size={17} className="text-zinc-400" strokeWidth={2} />
        <span className="hidden sm:inline">All</span>
      </button>
      {open && (
        <div className="absolute left-0 sm:left-auto sm:right-0 z-20 mt-2 max-h-[70vh] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl shadow-black/40">
          <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">All modules</p>
          {MODULES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => go(m)}
              disabled={m.wip}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <m.icon size={16} className={m.accent} strokeWidth={1.75} />
              <span className="flex-1 text-sm text-zinc-100">{m.title}</span>
              {m.wip ? (
                <span className="text-[9px] uppercase tracking-wide text-zinc-600">WIP</span>
              ) : m.href ? (
                <ExternalLink size={12} className="text-zinc-600" />
              ) : m.locked ? (
                <Lock size={12} className="text-zinc-600" />
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Small read-only stat chip — for ambient state that doesn't need its own
// button/row (e.g. Claude-week pace). Not a nav target.
function StatChip({ icon: Icon, label, value, accent }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-xs">
      <Icon size={14} className={accent} strokeWidth={1.75} />
      <span className="text-zinc-500">{label}</span>
      <span className="font-semibold tabular-nums text-zinc-200">{value}</span>
    </div>
  );
}

export default function DashboardTopRow({ claude }) {
  const gig = MODULES.find((m) => m.id === 'gig');
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-white sm:text-xl">
          Luke's Dashboard
        </h1>
        <p className="text-xs text-zinc-500">{greeting()} — {todayLabel()}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {claude && (
          <StatChip icon={Bot} label="Claude week" value={`${claude.pct.toFixed(0)}% elapsed`} accent="text-amber-400" />
        )}
        <ActionButton icon={gig.icon} label="Gig" to={gig.to} accent={gig.accent} />
        <MoneyButton />
        <AllModulesButton />
      </div>
    </header>
  );
}
