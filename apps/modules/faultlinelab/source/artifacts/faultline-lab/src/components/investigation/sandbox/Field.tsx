import { Plus } from 'lucide-react';

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function Section({
  title,
  children,
  onAdd,
}: {
  title: string;
  children: React.ReactNode;
  onAdd: () => void;
}) {
  return (
    <div className="border border-zinc-800/50 rounded p-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">{title}</span>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 text-[11px] text-fuchsia-300 hover:text-fuchsia-200"
        >
          <Plus size={11} /> Add
        </button>
      </div>
      {children}
    </div>
  );
}
