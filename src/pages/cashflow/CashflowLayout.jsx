import { useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Layers, Droplets, CalendarRange, Receipt, CreditCard, Repeat, SlidersHorizontal, Eye, EyeOff, LogOut, Sun, Moon } from 'lucide-react';
import TopNav from '../../components/TopNav';
import { useAuth } from '../../lib/useAuth';
import { getPref, setPref } from '../../lib/fin';
import './cashflow-theme.css';

// Each permanent tab carries a subtle accent color — a faint tint always, a
// stronger one when active. Kept low-opacity so it reads as a hint, not a block.
const NAV_ITEMS = [
  { to: 'summary',       label: 'Summary',       icon: Layers,            color: '#64748b' },
  { to: 'waterfall',     label: 'Waterfall',     icon: Droplets,          color: '#06b6d4' },
  { to: 'runway',        label: 'Runway',        icon: CalendarRange,     color: '#f59e0b' },
  { to: 'bills',         label: 'Bills',         icon: Receipt,           color: '#3b82f6' },
  { to: 'debts',         label: 'Debts',         icon: CreditCard,        color: '#8b5cf6' },
  { to: 'subscriptions', label: 'Subscriptions', icon: Repeat,            color: '#ec4899' },
  { to: 'inputs',        label: 'Inputs',        icon: SlidersHorizontal, color: '#10b981' },
];

const THEME_PREF = 'cashflow_theme';   // 'light' | 'dark'

// Full-bleed shell: no max-width cap so the module uses the entire screen
// width, per Luke's "take up all the space" preference. Privacy state is shared
// to every sub-page through the Outlet context (same idea as the Debt module).
export default function CashflowLayout() {
  const [privacy, setPrivacy] = useState(true);
  const [theme, setTheme] = useState('dark');
  const { signOut } = useAuth();

  useEffect(() => {
    let active = true;
    getPref(THEME_PREF).then(({ data }) => { if (active && (data === 'light' || data === 'dark')) setTheme(data); });
    return () => { active = false; };
  }, []);

  const toggleTheme = () => setTheme((t) => {
    const next = t === 'dark' ? 'light' : 'dark';
    setPref(THEME_PREF, next);
    return next;
  });

  return (
    <div className={`min-h-screen bg-zinc-950 text-zinc-100 ${theme === 'light' ? 'cf-light' : ''}`}>
      <TopNav />
      <main className="w-full px-6 pb-12">
        <header className="mt-6 mb-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Cashflow Plan</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              Budget, accounts &amp; weekly dash goals — your data, live from Supabase
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-200 hover:border-zinc-500"
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            <button
              onClick={() => setPrivacy((p) => !p)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                privacy
                  ? 'bg-amber-900/30 border-amber-600 text-amber-400 hover:bg-amber-900/50'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500'
              }`}
            >
              {privacy ? <Eye size={15} /> : <EyeOff size={15} />}
              {privacy ? 'Show' : 'Hide'}
            </button>
            <button
              onClick={signOut}
              title="Sign out of financial access"
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-200 hover:border-zinc-500"
            >
              <LogOut size={15} />
              Sign out
            </button>
          </div>
        </header>

        {/* Horizontal tab bar (full width), each tab faintly color-coded */}
        <nav aria-label="Cashflow sections" className="flex gap-1 border-b border-zinc-800 mb-6">
          {NAV_ITEMS.map(({ to, label, icon: Icon, color }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors rounded-t-lg border-b-2 -mb-px ${
                  isActive ? 'text-white' : 'text-zinc-400 hover:text-zinc-100'
                }`
              }
              style={({ isActive }) => ({
                backgroundColor: isActive ? `${color}26` : `${color}0d`,
                borderBottomColor: isActive ? color : 'transparent',
              })}
            >
              <Icon size={15} className="shrink-0" style={{ color }} />
              {label}
            </NavLink>
          ))}
        </nav>

        <Outlet context={{ privacy }} />
      </main>
    </div>
  );
}

// Shared privacy-blur wrapper so figures stay hidden until unlocked.
export function Redacted({ children, on }) {
  if (!on) return <>{children}</>;
  return <span className="blur-sm select-none pointer-events-none">{children}</span>;
}
