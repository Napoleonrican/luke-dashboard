import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

// Slide-in "Shift" panel: the controls a driver reaches for mid-shift —
// Edit Shift Setup, plus a grouped Shift Controls card (Break, End Shift,
// Reset) — in one place instead of split across the main page and Settings.
//
// End Shift and Reset use in-line "tap again to confirm" guards rather than
// browser confirm() dialogs, so the whole flow stays inside the drawer and
// works one-handed on mobile. Parent handlers should perform the action
// directly (no confirm()); this component owns the confirmation UX.
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
  const [endShiftConfirm, setEndShiftConfirm] = useState(false);
  const [resetConfirming, setResetConfirming] = useState(false);
  const endShiftConfirmTimerRef = useRef(null);
  const resetTimerRef = useRef(null);

  useEffect(() => () => {
    clearTimeout(endShiftConfirmTimerRef.current);
    clearTimeout(resetTimerRef.current);
  }, []);

  // Clear pending confirms when the panel closes so they don't linger.
  useEffect(() => {
    if (!open) {
      clearTimeout(endShiftConfirmTimerRef.current);
      clearTimeout(resetTimerRef.current);
      setEndShiftConfirm(false);
      setResetConfirming(false);
    }
  }, [open]);

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
    setNow(Date.now()); // seed immediately so first paint isn't stale
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

  function handleEndShiftConfirmed() {
    clearTimeout(endShiftConfirmTimerRef.current);
    setEndShiftConfirm(false);
    onClose();
    onEndShift();
  }

  function handleResetConfirmed() {
    clearTimeout(resetTimerRef.current);
    setResetConfirming(false);
    onClose();
    onReset();
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

              {/* Shift Controls — Break, End Shift, Reset grouped in one card,
                  matching the Gig Tracker product version (inline tap-again
                  confirms, break counter shown in-menu). */}
              <div>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Shift Controls</h3>
                <div className="rounded-xl border border-zinc-800 bg-zinc-800/40 px-4 py-4 space-y-3">

                  {/* Break timer */}
                  {breakRunning && breakStartMs ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-amber-400">On break</span>
                        <span className="text-2xl font-bold tabular-nums text-amber-400">{breakTimerDisplay}</span>
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
                    <div>
                      <button
                        onClick={handleStartBreak}
                        className="w-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm font-semibold rounded-lg py-3 min-h-[44px] transition-colors"
                      >
                        Take Break
                      </button>
                      {Number(breakMinutes) > 0 && (
                        <div className="mt-1.5 text-xs text-zinc-500">
                          Total break: {Math.round(Number(breakMinutes))} min
                        </div>
                      )}
                    </div>
                  )}

                  <div className="border-t border-zinc-700/50" />

                  {/* End Shift — tap-again confirm, closes panel then fires */}
                  {endShiftConfirm ? (
                    <button
                      onClick={handleEndShiftConfirmed}
                      className="w-full bg-red-700 hover:bg-red-600 border border-red-500 text-white text-sm font-semibold py-3 rounded-lg min-h-[44px] transition-colors"
                    >
                      Tap again to end shift
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setEndShiftConfirm(true);
                        clearTimeout(endShiftConfirmTimerRef.current);
                        endShiftConfirmTimerRef.current = setTimeout(() => setEndShiftConfirm(false), 3000);
                      }}
                      className="w-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-zinc-100 text-sm font-semibold py-3 rounded-lg min-h-[44px] transition-colors"
                    >
                      End Shift
                    </button>
                  )}

                  {/* Reset Shift — visually subdued, destructive-guarded */}
                  {resetConfirming ? (
                    <button
                      onClick={handleResetConfirmed}
                      className="w-full bg-red-900 hover:bg-red-800 border border-red-700 text-red-300 text-xs font-medium py-3 rounded-lg min-h-[44px] transition-colors"
                    >
                      Tap again to confirm reset
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setResetConfirming(true);
                        clearTimeout(resetTimerRef.current);
                        resetTimerRef.current = setTimeout(() => setResetConfirming(false), 3000);
                      }}
                      className="w-full bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-800 text-zinc-500 hover:text-zinc-400 text-xs font-medium py-3 rounded-lg min-h-[44px] transition-colors"
                    >
                      Reset Shift
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
