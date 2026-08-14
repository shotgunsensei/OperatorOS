import {
  Activity,
  FileText,
  Lightbulb,
  Lock,
  MessageSquare,
  Package,
  Terminal,
  type LucideIcon,
} from 'lucide-react';
import { hasFeature } from '@/lib/entitlements';
import { premiumTools, type PremiumToolMeta } from './premiumTools';

type Tab = { id: string; label: string; icon: LucideIcon };

export const TOOL_TABS: Tab[] = [
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'event-log', label: 'Event Logs', icon: FileText },
  { id: 'ticket-history', label: 'Tickets', icon: MessageSquare },
];

export const SIDEBAR_TABS: Tab[] = [
  { id: 'evidence', label: 'Evidence', icon: Package },
  { id: 'hints', label: 'Hints', icon: Lightbulb },
  { id: 'symptoms', label: 'Symptoms', icon: Activity },
];

type Props = {
  activeTool: string;
  mobileDrawer: string | null;
  onActiveToolChange: (id: string) => void;
  onPremiumTool: (tool: PremiumToolMeta) => void;
  onMobileDrawerChange: (id: string | null) => void;
};

export function ToolTabBar({
  activeTool,
  mobileDrawer,
  onActiveToolChange,
  onPremiumTool,
  onMobileDrawerChange,
}: Props) {
  return (
    <div className="flex items-center gap-0.5 sm:gap-1 px-2 sm:px-4 py-1.5 sm:py-2 bg-[#0d1219] border-b border-zinc-800/30">
      {TOOL_TABS.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={() => onActiveToolChange(tab.id)}
            className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 text-xs font-mono rounded transition-colors ${
              activeTool === tab.id
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
            }`}
          >
            <Icon size={12} />
            <span className="hidden xs:inline">{tab.label}</span>
          </button>
        );
      })}

      <div className="hidden md:flex items-center gap-1 ml-2 pl-2 border-l border-zinc-800/50">
        {premiumTools.map((tool) => {
          const Icon = tool.icon;
          const unlocked = hasFeature(tool.id);
          const isActive = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              onClick={() => onPremiumTool(tool)}
              className={`flex items-center gap-1 px-2 py-1.5 text-xs font-mono rounded border transition-colors ${
                isActive
                  ? unlocked
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                    : 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                  : unlocked
                    ? 'border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10'
                    : 'border-zinc-800/60 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700/60'
              }`}
              title={
                unlocked ? `${tool.label} (unlocked)` : `${tool.label} (upgrade to unlock)`
              }
            >
              {unlocked ? <Icon size={11} /> : <Lock size={11} />}
              <span>{tool.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1" />

      <div className="flex lg:hidden items-center gap-1">
        <button
          onClick={() => onMobileDrawerChange(mobileDrawer === 'tools' ? null : 'tools')}
          className={`md:hidden relative min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg transition-colors ${
            mobileDrawer === 'tools'
              ? 'bg-cyan-500/10 text-cyan-400'
              : 'text-zinc-600 hover:text-zinc-400'
          }`}
          title="Premium tools"
          aria-label="Premium tools"
        >
          <Lock size={18} />
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-cyan-500/80 text-[9px] font-mono font-semibold text-white flex items-center justify-center">
            {premiumTools.length}
          </span>
        </button>
        {SIDEBAR_TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onMobileDrawerChange(mobileDrawer === tab.id ? null : tab.id)}
              className={`min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg transition-colors ${
                mobileDrawer === tab.id
                  ? 'bg-cyan-500/10 text-cyan-400'
                  : 'text-zinc-600 hover:text-zinc-400'
              }`}
              title={tab.label}
            >
              <Icon size={18} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
