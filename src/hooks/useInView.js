import { useEffect, useRef, useState } from 'react';

// Fires once a ref'd element enters the viewport (with a margin so fetches
// start slightly before the card is actually visible), then disconnects —
// used to gate TMDB fetches to cards the user has actually scrolled to.
export default function useInView(rootMargin = '200px') {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView || !ref.current) return;
    const el = ref.current;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); observer.disconnect(); } },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView, rootMargin]);

  return [ref, inView];
}
