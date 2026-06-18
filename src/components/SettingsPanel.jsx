import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

// Slide-in settings panel: Break Timer, Behavior (strike tracking), and Reset.
// Ported from the standalone Gig Tracker so the dashboard shares the same
// manual / hybrid / auto strike-tracking controls.
export default function SettingsPanel({
  open,
  onClose,
  shiftStarted,
  breakMinutes,
  breakRunning,
  breakStartMs,
  onUpdate,
  strikeMode,
  onStrikeModeChange,
  strikeThreshold,
  onStrikeThresholdChange,
  onReset,
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !breakRunning) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open, breakRunning]);

  const liveBreakMs = breakRunning && breakStartMs ? now - breakStartMs : 0;
  const totalBreakMs = (Number(breakMinutes) * 60000) + liveBreakMs;
  const hrs = Math.floor(totalBreakMs / 3600000);
  const mins = Math.floor((totalBreakMs % 3600000) / 60000);
  const secs = Math.floor((totalBreakMs % 60000) / 1000);
  const breakTimerDisplay = hrs > 0
    ? `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${mins}:${String(secs).padStart(2, '0')}`;

  function handleStartBreak() {
    onUpdate({ breakRunning: true, breakStartMs: Date.now() });
  }

  function handleEndBreak() {
    const elapsed = breakStartMs ? (Date.now() - breakStartMs) / 60000 : 0;
    onUpdate({ breakRunning: false, breakStartMs: null, breakMinutes: Number(breakMinutes) + elapsed });
  }

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
          {/* Break Timer */}
          <div>
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Break Timer</h3>
            <div className="rounded-xl border border-zinc-800 bg-zinc-800/40 px-4 py-4">
              {!shiftStarted ? (
                <p className="text-xs text-zinc-500 text-center">Start a shift to use the break timer.</p>
              ) : breakRunning && breakStartMs ? (
                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-zinc-500 mb-1">On break</div>
                    <div className="text-3xl font-bold tabular-nums text-amber-400">{breakTimerDisplay}</div>
                  </div>
                  <button
                    onClick={handleEndBreak}
                    className="w-full bg-amber-900 hover:bg-amber-800 border border-amber-700 text-amber-300 text-sm font-semibold py-3 rounded-lg min-h-[44px] transition-colors"
                  >
                    End Break
                  </button>
                  {Number(breakMinutes) > 0 && (
                    <div className="text-xs text-zinc-500">Prior breaks: {Math.round(Number(breakMinutes))} min</div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={handleStartBreak}
                    className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-semibold rounded-lg py-3 min-h-[44px] transition-colors"
                  >
                    Take Break
                  </button>
                  {Number(breakMinutes) > 0 && (
                    <div className="text-xs text-zinc-500">Total break: {Math.round(Number(breakMinutes))} min</div>
                  )}
                </div>
              )}
            </div>
          </div>

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

          {/* Danger zone */}
          {shiftStarted && (
            <div>
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Danger Zone</h3>
              <button
                onClick={onReset}
                className="w-full bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-3 rounded-lg min-h-[44px] transition-colors"
              >
                Reset Shift
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
