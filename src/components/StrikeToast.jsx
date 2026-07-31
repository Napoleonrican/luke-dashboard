// Strike notifications for the Gig Tracker (ported from the standalone app,
// items 2.10/2.11). Two variants share this component:
//  - Prompt (hybrid mode): a Yes/Skip toast — the driver decides whether the
//    strike is added. Auto-fades to "Skip" if untouched.
//  - Info (auto mode): a strike was added automatically; shows an Undo button
//    plus a dismiss ✕. Auto-fades after a few seconds.
export default function StrikeToast({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-6 left-0 right-0 z-50 flex flex-col-reverse gap-2 px-4 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className="flex items-start gap-3 bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-3 shadow-xl pointer-events-auto max-w-md mx-auto w-full"
        >
          <span className="text-[13px] leading-snug flex-1 text-zinc-200">{t.message}</span>
          <div className="flex gap-1.5 shrink-0 mt-0.5">
            {t.onYes ? (
              <>
                <button
                  onClick={t.onYes}
                  className="text-xs font-semibold text-green-400 bg-zinc-800 border border-zinc-600 rounded-lg px-2.5 min-h-[36px]"
                >
                  Yes
                </button>
                <button
                  onClick={t.onSkip}
                  className="text-xs text-zinc-400 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 min-h-[36px]"
                >
                  Skip
                </button>
              </>
            ) : (
              <>
                {t.undoFn && (
                  <button
                    onClick={() => { t.undoFn(); onDismiss(t.id); }}
                    className="text-xs font-semibold text-amber-400 bg-zinc-800 border border-zinc-600 rounded-lg px-2.5 min-h-[36px]"
                  >
                    Undo
                  </button>
                )}
                <button
                  onClick={() => onDismiss(t.id)}
                  className="text-xs text-zinc-500 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 min-h-[36px]"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
