import { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Calendar, Wrench, Fuel, BarChart3, LogOut, Sun, Moon, Menu } from 'lucide-react';
import TopNav from '../../components/TopNav';
import { useAuth } from '../../lib/useAuth';
import { getPref, setPref, fetchVehicles } from '../../lib/vehicles';
import { ToastHost } from '../cashflow/toast';
import '../cashflow/cashflow-theme.css';

// Mirrors CashflowLayout.jsx one-for-one: tab bar, ⋯ settings menu, theme
// pref, Outlet context. No "How it works" guide for this module (it's scoped
// out — see the plan) and no privacy blur (vehicle data isn't sensitive).
const NAV_ITEMS = [
  { to: 'upcoming',     label: 'Upcoming',     icon: Calendar,   color: '#06b6d4' },
  { to: 'service-log',  label: 'Service Log',  icon: Wrench,     color: '#8b5cf6' },
  { to: 'fuel',         label: 'Fuel',         icon: Fuel,       color: '#f59e0b' },
  { to: 'insights',     label: 'Insights',     icon: BarChart3,  color: '#10b981' },
];

const THEME_PREF = 'vehicles_theme';           // 'light' | 'dark'
const VEHICLE_PREF = 'vehicles_active_vehicle'; // stored vehicle id

export default function VehiclesLayout() {
  const [theme, setTheme] = useState('dark');
  const [pageMenuItems, setPageMenuItems] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [vehicleId, setVehicleIdState] = useState(null);
  const { signOut } = useAuth();

  useEffect(() => {
    let active = true;
    getPref(THEME_PREF).then(({ data }) => { if (active && (data === 'light' || data === 'dark')) setTheme(data); });
    fetchVehicles().then(({ data }) => {
      if (!active || !data) return;
      setVehicles(data);
      getPref(VEHICLE_PREF).then(({ data: savedId }) => {
        if (!active) return;
        const match = data.find((v) => v.id === savedId);
        setVehicleIdState(match ? match.id : data[0]?.id ?? null);
      });
    });
    return () => { active = false; };
  }, []);

  const setVehicleId = (id) => { setVehicleIdState(id); setPref(VEHICLE_PREF, id); };

  const toggleTheme = () => setTheme((t) => {
    const next = t === 'dark' ? 'light' : 'dark';
    setPref(THEME_PREF, next);
    return next;
  });

  return (
    <div className={`min-h-screen bg-zinc-950 text-zinc-100 ${theme === 'light' ? 'cf-light' : ''}`}>
      <TopNav
        title="Vehicle Care"
        subtitle="Maintenance schedule, service log & fuel tracking — your data, live from Supabase"
        right={
          <SettingsMenu
            theme={theme} onToggleTheme={toggleTheme}
            onSignOut={signOut}
            pageItems={pageMenuItems}
          />
        }
      />
      <main className="w-full px-6 pb-12 pt-4">
        <nav aria-label="Vehicles sections" className="flex gap-1 overflow-x-auto border-b border-zinc-800 mb-4 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
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

        {/* Vehicle toggle — lives here (not per-tab) so it persists across tab
            switches. Every tab reads vehicleId from outlet context. */}
        {vehicles.length > 0 && (
          <div className="mb-6 inline-flex rounded-lg border border-zinc-700 bg-zinc-900 p-0.5">
            {vehicles.map((v) => (
              <button
                key={v.id}
                onClick={() => setVehicleId(v.id)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  vehicleId === v.id ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
                style={vehicleId === v.id && v.color ? { boxShadow: `inset 0 0 0 1px ${v.color}` } : undefined}
              >
                {v.nickname || v.name}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-[75vh]">
          <Outlet context={{ setPageMenuItems, vehicleId, setVehicleId, vehicles }} />
        </div>
      </main>
      <ToastHost />
    </div>
  );
}

function SettingsMenu({ theme, onToggleTheme, onSignOut, pageItems = [] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

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
        title="Vehicles settings"
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
