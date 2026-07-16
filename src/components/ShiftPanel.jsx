import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

// Slide-in "Shift" panel: the 4 controls a driver reaches for mid-shift —
// Edit Shift Setup, Break Timer, End Shift, Reset — grouped in one place
// instead of split across the main page and the Settings panel.
export default function ShiftPanel({
  open,
  onClose,
  shiftStarted,
  breakMinutes,
  breakRunning,
  breakStartMs,
  onUpdate,
  onEditSetup,
  onEndShift,
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
        aria-label="Shift controls"
        className={`fixed top-0 right-0 h-full w-80 max-w-[90vw] bg-zinc-900 border-l border-zinc-800 z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <span className="text-base font-semibold text-zinc-100 select-none">Shift</span>
          <button
            onClick={onClose}
            className="flex items-center justify-center text-zinc-500 hover:text-zinc-200 transition-colors rounded-lg min-h-[44px] min-w-[44px]"
            aria-label="Close shift controls"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {!shiftStarted ? (
            <p className="text-sm text-zinc-500 text-center py-6">Start a shift to see controls here.</p>
          ) : (
            <>
              {/* Edit Shift Setup */}
              <div>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Setup</h3>
                <button
                  onClick={onEditSetup}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-semibold py-3 rounded-lg min-h-[44px] transition-colors"
                >
                  Edit Shift Setup
                </button>
              </div>

              {/* Break Timer */}
              <div>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Break Timer</h3>
                <div className="rounded-xl border border-zinc-800 bg-zinc-800/40 px-4 py-4">
                  {breakRunning && breakStartMs ? (
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

              {/* End / Reset */}
              <div>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">End of Shift</h3>
                <div className="space-y-2.5">
                  <button
                    onClick={onEndShift}
                    className="w-full bg-red-700 hover:bg-red-600 text-white text-sm font-semibold py-3 rounded-lg min-h-[44px] transition-colors"
                  >
                    End Shift &amp; Save
                  </button>
                  <button
                    onClick={onReset}
                    className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-sm font-medium py-3 rounded-lg min-h-[44px] transition-colors"
                  >
                    Reset (discard without saving)
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
