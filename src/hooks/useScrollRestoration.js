import { useEffect } from 'react';

// Remembers window scroll position per `key` (typically the route pathname)
// across a visit to a detail page and back — sessionStorage so it survives
// the unmount/remount but not a fresh tab. `ready` gates the restore until
// the page has real content (loading data first would restore against an
// empty, short page and land at the top anyway).
export default function useScrollRestoration(key, ready) {
  useEffect(() => {
    if (!ready) return;
    const saved = sessionStorage.getItem(`scroll:${key}`);
    if (saved) requestAnimationFrame(() => window.scrollTo(0, Number(saved)));
  }, [key, ready]);

  useEffect(() => {
    const onScroll = () => sessionStorage.setItem(`scroll:${key}`, String(window.scrollY));
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [key]);
}
