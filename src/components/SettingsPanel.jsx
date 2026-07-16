import { useEffect } from 'react';
import { X } from 'lucide-react';

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
}) {
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
                {strikeMode === 'manual' && 'Use + Strike / − Strike buttons to track manually.'}
                {strikeMode === 'hybrid' && 'One strike is removed when your EPH hits the daily peak. Add them manually when you decline.'}
                {strikeMode === 'auto' && 'Strikes increment when EPH drops below zone avg, decrement when EPH hits the daily peak.'}
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
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
