import { useRef } from 'react';

const PALETTES = [
  // Palette 1 — Royal Deep
  `radial-gradient(at 20% 30%, rgba(1, 47, 152, 0.6) 0px, transparent 50%),
radial-gradient(at 80% 70%, rgba(30, 27, 75, 0.7) 0px, transparent 50%),
radial-gradient(at 60% 20%, rgba(37, 99, 235, 0.3) 0px, transparent 50%),
#050816`,
  // Palette 2 — Royal Aurora
  `radial-gradient(at 15% 25%, rgba(1, 47, 152, 0.55) 0px, transparent 50%),
radial-gradient(at 85% 80%, rgba(45, 212, 191, 0.25) 0px, transparent 50%),
radial-gradient(at 70% 30%, rgba(124, 58, 237, 0.3) 0px, transparent 50%),
#050816`,
  // Palette 3 — Royal & Gold
  `radial-gradient(at 25% 30%, rgba(1, 47, 152, 0.55) 0px, transparent 50%),
radial-gradient(at 80% 75%, rgba(245, 158, 11, 0.18) 0px, transparent 50%),
radial-gradient(at 65% 25%, rgba(30, 27, 75, 0.5) 0px, transparent 50%),
#050816`,
  // Palette 4 — Royal Twilight
  `radial-gradient(at 20% 30%, rgba(1, 47, 152, 0.55) 0px, transparent 50%),
radial-gradient(at 80% 70%, rgba(190, 24, 93, 0.25) 0px, transparent 50%),
radial-gradient(at 65% 25%, rgba(67, 56, 202, 0.35) 0px, transparent 50%),
#050816`,
  // Palette 5 — Royal Ocean
  `radial-gradient(at 20% 30%, rgba(1, 47, 152, 0.6) 0px, transparent 50%),
radial-gradient(at 85% 75%, rgba(8, 145, 178, 0.3) 0px, transparent 50%),
radial-gradient(at 60% 25%, rgba(30, 58, 138, 0.4) 0px, transparent 50%),
#050816`,
];

export function useRandomPalette() {
  const indexRef = useRef(null);
  if (indexRef.current === null) {
    indexRef.current = Math.floor(Math.random() * PALETTES.length);
  }
  return PALETTES[indexRef.current];
}
