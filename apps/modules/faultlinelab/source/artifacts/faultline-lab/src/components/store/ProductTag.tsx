export function ProductTag({ tag }: { tag: string }) {
  const colors: Record<string, string> = {
    new: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    popular: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    advanced: 'bg-red-500/20 text-red-400 border-red-500/30',
    'best-value': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    specialty: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  };
  return (
    <span
      className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${
        colors[tag] || 'bg-zinc-700/50 text-zinc-400 border-zinc-600/30'
      }`}
    >
      {tag.replace('-', ' ')}
    </span>
  );
}
