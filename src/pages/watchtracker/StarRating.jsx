import { useState } from 'react';
import { Star } from 'lucide-react';

const LABELS = { 1: 'Bad', 2: 'Meh', 3: 'Good', 4: 'Great', 5: 'Loved it' };

// Private 1-5 rating — not TVTime's social/display stars, just an input
// signal for the recommendation engine. Click a star to set; click the
// current rating again to clear it.
export default function StarRating({ value, onChange, size = 16, showLabel = false }) {
  const [hover, setHover] = useState(null);
  const shown = hover ?? value ?? 0;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => onChange(value === n ? null : n)}
            onMouseEnter={() => setHover(n)}
            title={`Rate ${n}/5`}
            className="p-0.5"
          >
            <Star
              size={size}
              className={n <= shown ? 'fill-amber-400 text-amber-400' : 'text-zinc-700'}
            />
          </button>
        ))}
      </div>
      {showLabel && (
        <span className="text-xs font-medium text-amber-300">
          {LABELS[shown] ?? (value ? '' : 'Rate this')}
        </span>
      )}
    </div>
  );
}
