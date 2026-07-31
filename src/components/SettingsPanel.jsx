import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

// Plain-language "How strikes work" rows. The threshold numbers track the
// current aggressiveness so the explainer always matches live behavior — keep
// these in sync with the AGG_* maps in GigTracker.jsx.
function strikeRules(agg) {
  const a = agg || 'balanced';
  const droopPct = { conservative: '15%', balanced: '20%', aggressive: '30%' };
  const idleMins = { conservative: '20', balanced: '25', aggressive: '35' };
  const lookback = { conservative: '1 order', balanced: '2 orders', aggressive: '3 orders' };
  const aggLabel = { conservative: 'Hustle', balanced: 'Balanced', aggressive: 'Selective' };
  return [
    { key: 'droop',      rule: `30-min EPH drops ${droopPct[a]} below your zone average`,       badge: aggLabel[a]   },
    { key: 'idle',       rule: `No orders for ${idleMins[a]} min with EPH below zone average`,   badge: aggLabel[a]   },
    { key: 'stretch',    rule: `Stretch goal hit and the last ${lookback[a]} underperformed`,    badge: aggLabel[a]   },
    { key: 'mingoal',    rule: '≤30 min to goal time and under 70% of target earnings',          badge: 'all modes'   },
    { key: 'order-drop', rule: 'A logged order drops EPH below your zone average',               badge: 'auto/hybrid' },
    { key: 'recovery',   rule: 'An order hits your daily peak → one strike removed',             badge: 'auto/hybrid' },
  ];
}

// Slide-in settings panel: Behavior (strike tracking) only.
// Shift-in-progress controls (Edit Setup, Break Timer, End Shift, Reset)
// live in the separate ShiftPanel, opened from its own menu button.
export default function SettingsPanel({
  open,
  onClose,
  strikeMode,
  onStrikeModeChange,
  strikeThreshold,
  onStrikeThresholdChange,
  aggressiveness,
  onAggressivenessChange,
}) {
  const [howStrikesOpen, setHowStrikesOpen] = useState(false);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className={`fixed top-0 right-0 h-full w-80 max-w-[90vw] bg-zinc-900 border-l border-zinc-800 z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <span className="text-base font-semibold text-zinc-100 select-none">Settings</span>
          <button
            onClick={onClose}
            className="flex items-center justify-center text-zinc-500 hover:text-zinc-200 transition-colors rounded-lg min-h-[44px] min-w-[44px]"
            aria-label="Close settings"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {/* Behavior */}
          <div>
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Behavior</h3>
            <div className="rounded-xl border border-zinc-800 bg-zinc-800/40 px-4 py-4">
              <div className="text-sm font-medium text-zinc-200 mb-1">Strike Tracking</div>
              <div className="text-xs text-zinc-500 mb-3">How strikes are added and removed</div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'manual', label: 'Manual' },
                  { id: 'hybrid', label: 'Hybrid' },
                  { id: 'auto',   label: 'Auto' },
                ].map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => onStrikeModeChange(id)}
                    className={`py-2.5 rounded-lg text-xs font-semibold transition-colors min-h-[44px] ${
                      strikeMode === id
                        ? 'bg-zinc-600 text-zinc-100 border border-zinc-500'
                        : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-2.5 text-xs text-zinc-600">
                {strikeMode === 'manual' && 'Use + Strike / − Strike buttons to track manually. No automatic strikes or prompts.'}
                {strikeMode === 'hybrid' && 'Prompts you (Yes/Skip) before adding a strike on a slow-down trigger, and auto-removes one when your EPH hits the daily peak.'}
                {strikeMode === 'auto' && 'Adds strikes automatically on slow-down triggers (with an Undo toast) and removes one when your EPH hits the daily peak.'}
              </div>

              <div className="border-t border-zinc-700/50 mt-4 pt-4">
                <div className="text-sm font-medium text-zinc-200 mb-1">Strike Threshold</div>
                <div className="text-xs text-zinc-500 mb-3">Strikes needed to trigger &quot;stop dashing&quot; warning</div>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map(n => (
                    <button
                      key={n}
                      onClick={() => onStrikeThresholdChange(n)}
                      className={`py-2.5 rounded-lg text-xs font-semibold transition-colors min-h-[44px] ${
                        strikeThreshold === n
                          ? 'bg-zinc-600 text-zinc-100 border border-zinc-500'
                          : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700'
                      }`}
                    >
                      {n} {n === 1 ? 'Strike' : 'Strikes'}
                    </button>
                  ))}
                </div>
                <div className="mt-2.5 text-xs text-zinc-600">
                  {strikeThreshold === 1 && 'Warning fires after 1 strike — most sensitive.'}
                  {strikeThreshold === 2 && 'Warning fires after 2 strikes — balanced.'}
                  {strikeThreshold === 3 && 'Warning fires after 3 strikes — default, most lenient.'}
                </div>
              </div>

              <div className="border-t border-zinc-700/50 mt-4 pt-4">
                <div className="text-sm font-medium text-zinc-200 mb-1">Acceptance Aggressiveness</div>
                <div className="text-xs text-zinc-500 mb-3">How early the auto/hybrid triggers fire</div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'conservative', label: 'Hustle' },
                    { id: 'balanced',     label: 'Balanced' },
                    { id: 'aggressive',   label: 'Selective' },
                  ].map(({ id, label }) => (
                    <button
                      key={id}
                      onClick={() => onAggressivenessChange(id)}
                      className={`py-2.5 rounded-lg text-xs font-semibold transition-colors min-h-[44px] ${
                        aggressiveness === id
                          ? 'bg-zinc-600 text-zinc-100 border border-zinc-500'
                          : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mt-2.5 text-xs text-zinc-600">
                  {aggressiveness === 'conservative' && 'Hustle — fires earliest (droop at 15% below zone avg, idle at 20 min).'}
                  {aggressiveness === 'balanced' && 'Balanced — default (droop at 20% below zone avg, idle at 25 min).'}
                  {aggressiveness === 'aggressive' && 'Selective — fires latest (droop at 30% below zone avg, idle at 35 min).'}
                </div>
              </div>

              <div className="border-t border-zinc-700/50 mt-4 pt-4">
                <button
                  onClick={() => setHowStrikesOpen(o => !o)}
                  className="flex items-center justify-between w-full min-h-[44px]"
                >
                  <span className="text-sm font-medium text-zinc-200">How strikes work</span>
                  <span className="text-xs text-zinc-500">{howStrikesOpen ? '▲' : '▼'}</span>
                </button>
                {howStrikesOpen && (
                  <div className="mt-3 space-y-2.5">
                    {strikeRules(aggressiveness).map(r => (
                      <div key={r.key} className="flex items-start gap-2">
                        <span className="text-xs text-zinc-300 leading-snug flex-1">{r.rule}</span>
                        <span className="shrink-0 text-[10px] font-semibold bg-zinc-700 text-zinc-400 px-2 py-0.5 rounded-full whitespace-nowrap">
                          {r.badge}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
