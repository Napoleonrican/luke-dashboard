// Simple concurrency-limited queue so TMDB calls triggered by many
// simultaneously-visible cards/rows don't burst past its rate limit.
// Callers await enqueue(fn) instead of calling fn() directly.
const MAX_CONCURRENT = 4;
let active = 0;
const pending = [];

function runNext() {
  if (active >= MAX_CONCURRENT || pending.length === 0) return;
  active++;
  const { fn, resolve, reject } = pending.shift();
  fn().then(resolve, reject).finally(() => {
    active--;
    runNext();
  });
}

export function enqueue(fn) {
  return new Promise((resolve, reject) => {
    pending.push({ fn, resolve, reject });
    runNext();
  });
}
