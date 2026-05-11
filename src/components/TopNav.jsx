import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function TopNav() {
  return (
    <nav className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/60">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors text-sm"
      >
        <ArrowLeft size={14} />
        Back to Hub
      </Link>
      <span className="text-xs text-zinc-600 tracking-wide">Luke's Dashboard</span>
    </nav>
  );
}
