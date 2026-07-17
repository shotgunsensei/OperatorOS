import { lazy, Suspense } from 'react';
import { hasFeature } from '@/lib/entitlements';
import TerminalPanel from './TerminalPanel';
import EventLogPanel from './EventLogPanel';
import TicketHistoryPanel from './TicketHistoryPanel';
import { PremiumToolPanel, premiumTools, type PremiumToolMeta } from './premiumTools';

// Lazy-load premium investigation panels — they are gated behind entitlements
// and rare in a typical session, so we keep them out of the initial chunk.
const WiresharkPanel = lazy(() => import('./WiresharkPanel'));
const DeepTelemetryPanel = lazy(() => import('./DeepTelemetryPanel'));
const ChaosModePanel = lazy(() => import('./ChaosModePanel'));
const SandboxPanel = lazy(() => import('./SandboxPanel'));
const ProAnalyticsPanel = lazy(() => import('./ProAnalyticsPanel'));

function PanelLoader({ label }: { label: string }) {
  return (
    <div className="h-full w-full flex items-center justify-center text-xs font-mono text-zinc-500">
      Loading {label}…
    </div>
  );
}

function resolvePremiumPanel(id: string) {
  switch (id) {
    case 'wireshark-panel':
      return WiresharkPanel;
    case 'deep-telemetry':
      return DeepTelemetryPanel;
    case 'chaos-mode':
      return ChaosModePanel;
    case 'sandbox-pro':
      return SandboxPanel;
    case 'pro-analytics':
      return ProAnalyticsPanel;
    default:
      return null;
  }
}

type Props = {
  activeTool: string;
  onUpgrade: (tool: PremiumToolMeta) => void;
};

export function ActiveToolPanel({ activeTool, onUpgrade }: Props) {
  switch (activeTool) {
    case 'terminal':
      return <TerminalPanel />;
    case 'event-log':
      return <EventLogPanel />;
    case 'ticket-history':
      return <TicketHistoryPanel />;
    default: {
      const premium = premiumTools.find((t) => t.id === activeTool);
      if (premium) {
        if (hasFeature(premium.id)) {
          const Lazy = resolvePremiumPanel(premium.id);
          if (Lazy) {
            return (
              <Suspense fallback={<PanelLoader label={premium.label} />}>
                <Lazy />
              </Suspense>
            );
          }
        }
        return (
          <PremiumToolPanel
            tool={premium}
            unlocked={false}
            onUpgrade={() => onUpgrade(premium)}
          />
        );
      }
      return <TerminalPanel />;
    }
  }
}
