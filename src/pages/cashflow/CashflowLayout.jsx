import { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Layers, Droplets, Receipt, CreditCard, Repeat, Banknote, Eye, EyeOff, LogOut, Sun, Moon, Menu, BookOpen } from 'lucide-react';
import TopNav from '../../components/TopNav';
import { useAuth } from '../../lib/useAuth';
import { getPref, setPref } from '../../lib/fin';
import { ToastHost } from './toast';
import './cashflow-theme.css';

// Each permanent tab carries a subtle accent color — a faint tint always, a
// stronger one when active. Kept low-opacity so it reads as a hint, not a block.
const NAV_ITEMS = [
  { to: 'waterfall',     label: 'Waterfall',     icon: Droplets,          color: '#06b6d4' },
  { to: 'summary',       label: 'Summary',       icon: Layers,            color: '#64748b' },
  { to: 'bills',         label: 'Bills',         icon: Receipt,           color: '#3b82f6' },
  { to: 'debts',         label: 'Debts',         icon: CreditCard,        color: '#8b5cf6' },
  { to: 'subscriptions', label: 'Subscriptions', icon: Repeat,            color: '#ec4899' },
  { to: 'earnin',        label: 'Earnin',        icon: Banknote,          color: '#f59e0b' },
];

const THEME_PREF = 'cashflow_theme';   // 'light' | 'dark'

// Full-bleed shell: no max-width cap so the module uses the entire screen
// width, per Luke's "take up all the space" preference. Privacy state is shared
// to every sub-page through the Outlet context (same idea as the Debt module).
export default function CashflowLayout() {
  const [privacy, setPrivacy] = useState(true);
  const [theme, setTheme] = useState('dark');
  // Page-specific menu items: a child page (e.g. Waterfall) registers actions
  // here on mount and clears them on unmount, so the ⋯ menu shows page-relevant
  // options only on the tab that owns them.
  const [pageMenuItems, setPageMenuItems] = useState([]);
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
      <TopNav
        title="Cashflow Plan"
        subtitle="Budget, accounts & weekly dash goals — your data, live from Supabase"
        right={
          <div className="flex items-center gap-2">
            {/* Show/hide figures — pulled out of the menu into a standalone
                one-tap toggle so it's always a click away. */}
            <button
              onClick={() => setPrivacy((p) => !p)}
              title={privacy ? 'Show figures' : 'Hide figures'}
              aria-label={privacy ? 'Show figures' : 'Hide figures'}
              className={`flex items-center px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                privacy
                  ? 'border-amber-600 bg-amber-900/30 text-amber-400 hover:bg-amber-900/50'
                  : 'border-zinc-700 bg-zinc-800 text-amber-400 hover:border-zinc-500'
              }`}
            >
              {privacy ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
            <SettingsMenu
              theme={theme} onToggleTheme={toggleTheme}
              onSignOut={signOut}
              pageItems={pageMenuItems}
            />
          </div>
        }
      />
      <main className="w-full px-6 pb-12 pt-4">
        {/* Horizontal tab bar — scrolls on narrow screens instead of
            overflowing, and drops down to icon-only below sm so it fits
            mobile widths without wrapping or clipping. Scrollbar hidden
            (still scrollable via touch/trackpad) so it doesn't stack a second
            bar under the tabs. */}
        <nav aria-label="Cashflow sections" className="flex gap-1 overflow-x-auto border-b border-zinc-800 mb-6 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {NAV_ITEMS.map(({ to, label, icon: Icon, color }) => (
            <NavLink
              key={to}
              to={to}
              title={label}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 sm:px-4 py-2.5 text-sm font-medium whitespace-nowrap shrink-0 transition-colors rounded-t-lg border-b-2 -mb-px ${
                  isActive ? 'text-white' : 'text-zinc-400 hover:text-zinc-100'
                }`
              }
              style={({ isActive }) => ({
                backgroundColor: isActive ? `${color}26` : `${color}0d`,
                borderBottomColor: isActive ? color : 'transparent',
              })}
            >
              <Icon size={15} className="shrink-0" style={{ color }} />
              <span className="hidden sm:inline">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* min-height keeps a switched-to tab from momentarily collapsing to a
            single "Loading…" row while its data fetches — without it, the
            browser clamps your scroll position to fit that sliver and never
            un-clamps once the real (taller) content fills in below. */}
        <div className="min-h-[75vh]">
          <Outlet context={{ privacy, onTogglePrivacy: () => setPrivacy((p) => !p), setPageMenuItems }} />
        </div>
      </main>
      <ToastHost />
    </div>
  );
}

// Shared privacy-blur wrapper so figures stay hidden until unlocked.
export function Redacted({ children, on }) {
  if (!on) return <>{children}</>;
  return <span className="blur-sm select-none pointer-events-none">{children}</span>;
}

// Collapses Light/Dark, Show/Hide, and Sign out into one menu button so they
// don't eat horizontal space next to the tab bar.
function SettingsMenu({ theme, onToggleTheme, onSignOut, pageItems = [] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Cashflow settings"
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
          open ? 'border-zinc-500 bg-zinc-800 text-zinc-200' : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500'
        }`}
      >
        <Menu size={15} />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-52 rounded-xl border border-zinc-700 bg-zinc-900 p-1.5 shadow-xl shadow-black/40">
          {pageItems.length > 0 && (
            <>
              {pageItems.map((item) => (
                <MenuItem
                  key={item.label}
                  icon={item.icon}
                  label={item.label}
                  tone={item.tone}
                  onClick={() => { setOpen(false); item.onClick(); }}
                />
              ))}
              <div className="my-1 border-t border-zinc-800" />
            </>
          )}
          <MenuItem
            icon={BookOpen}
            label="How it works"
            onClick={() => { setOpen(false); navigate('/cashflow/guide'); }}
          />
          <MenuItem
            icon={theme === 'dark' ? Sun : Moon}
            label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            onClick={() => { onToggleTheme(); setOpen(false); }}
          />
          <div className="my-1 border-t border-zinc-800" />
          <MenuItem icon={LogOut} label="Sign out" onClick={() => { setOpen(false); onSignOut(); }} />
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, tone = 'text-zinc-300' }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-zinc-800 ${tone}`}
    >
      <Icon size={15} className="shrink-0" />
      {label}
    </button>
  );
}
