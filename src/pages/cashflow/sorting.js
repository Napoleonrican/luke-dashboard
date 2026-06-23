// Shared sorting helpers for the Cashflow tables.

// Click a header to cycle asc → desc → off, persisting via the supplied saver.
export function makeToggleSort(setSort, persist) {
  return (key) => {
    setSort((prev) => {
      let next;
      if (!prev || prev.key !== key) next = { key, dir: 'asc' };
      else if (prev.dir === 'asc') next = { key, dir: 'desc' };
      else next = null;
      persist(next);
      return next;
    });
  };
}

// Generic sort: accessors map column key → value getter; blanks sink to bottom.
export function sortRows(rows, sort, accessors) {
  if (!sort?.key || !accessors[sort.key]) return rows;
  const get = accessors[sort.key];
  const dir = sort.dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = get(a), bv = get(b);
    const aEmpty = av == null || av === '';
    const bEmpty = bv == null || bv === '';
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}
