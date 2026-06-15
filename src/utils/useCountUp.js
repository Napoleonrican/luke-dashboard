import { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Animate a number from 0 to `target` once on mount (ease-out, ~500ms).
// Returns the target immediately when reduced-motion is set or target is non-finite.
export function useCountUp(target, duration = 500) {
  const valid = typeof target === 'number' && isFinite(target);
  const [value, setValue] = useState(valid && !prefersReducedMotion() ? 0 : target);
  const rafRef = useRef(null);

  useEffect(() => {
    // Reduced-motion / non-numeric: nothing to animate. Initial state already
    // holds the target, so we just skip the animation.
    if (!valid || prefersReducedMotion()) return undefined;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setValue(target * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration, valid]);

  return value;
}
