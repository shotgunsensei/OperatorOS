import type { ReactNode } from 'react';

interface SettingsRowProps {
  icon: ReactNode;
  title: string;
  description: string;
  action: ReactNode;
  className?: string;
}

export function SettingsRow({ icon, title, description, action, className }: SettingsRowProps) {
  return (
    <div className={`bg-[#111822] border border-zinc-800/40 rounded-lg p-4 ${className ?? ''}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <p className="text-sm text-zinc-200">{title}</p>
            <p className="text-xs text-zinc-600">{description}</p>
          </div>
        </div>
        {action}
      </div>
    </div>
  );
}

export function ToggleSwitch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-11 h-6 rounded-full transition-colors relative ${
        on ? 'bg-cyan-500' : 'bg-zinc-700'
      }`}
    >
      <div
        className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
          on ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
