import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

// Sortable header cell. Pass sortKey + the shared { key, dir } sort state and an
// onSort(key) handler to make it clickable (asc → desc → off). Omit sortKey for
// a plain header (e.g. an actions column).
export function Th({ children, className = '', sortKey, sort, onSort, align = 'left' }) {
  if (!sortKey) return <th className={`px-3 py-2.5 font-medium whitespace-nowrap ${className}`}>{children}</th>;
  const active = sort?.key === sortKey;
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ChevronUp : ChevronDown;
  return (
    <th className={`px-3 py-2.5 font-medium whitespace-nowrap ${align === 'right' ? 'text-right' : ''} ${className}`}>
      <button
        onClick={() => onSort(sortKey)}
        className={`group inline-flex items-center gap-1 transition-colors hover:text-zinc-200 ${active ? 'text-emerald-400' : ''} ${align === 'right' ? 'flex-row-reverse' : ''}`}
        title="Sort"
      >
        {children}
        <Icon size={12} className={active ? 'opacity-100' : 'opacity-30 group-hover:opacity-60'} />
      </button>
    </th>
  );
}

export function Td({ children, className = '', colSpan }) {
  return <td colSpan={colSpan} className={`px-3 py-2 whitespace-nowrap ${className}`}>{children}</td>;
}
