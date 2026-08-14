import { useEffect, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useAppStore } from '@/stores/useAppStore';
import EvidenceLocker from './investigation/EvidenceLocker';
import HintPanel from './investigation/HintPanel';
import ActionLog from './investigation/ActionLog';
import SymptomsPanel from './investigation/SymptomsPanel';
import DiagnosisForm from './investigation/DiagnosisForm';
import { type PremiumToolMeta } from './investigation/premiumTools';
import { BriefingModal } from './investigation/BriefingModal';
import {
  getRequiredProductForFeature,
  getEntitlements,
  subscribeEntitlements,
} from '@/lib/entitlements';
import { useUpgradePrompt } from './UpgradePrompt';
import { useCaseTimer } from './investigation/useCaseTimer';
import { WorkspaceHeader } from './investigation/WorkspaceHeader';
import { SIDEBAR_TABS, ToolTabBar } from './investigation/ToolTabBar';
import { MobileToolsList } from './investigation/MobileToolsList';
import { ActiveToolPanel } from './investigation/ActiveToolPanel';

export default function InvestigationWorkspace() {
  const currentCaseDef = useAppStore((s) => s.currentCaseDef);
  const currentCaseState = useAppStore((s) => s.currentCaseState);
  const activeTool = useAppStore((s) => s.activeTool);
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const trackToolUsage = useAppStore((s) => s.trackToolUsage);
  const showDiagnosisForm = useAppStore((s) => s.showDiagnosisForm);
  const toggleDiagnosisForm = useAppStore((s) => s.toggleDiagnosisForm);
  const exitCase = useAppStore((s) => s.exitCase);
  useSyncExternalStore((cb) => subscribeEntitlements(cb), () => getEntitlements());
  const { prompt } = useUpgradePrompt();

  const { elapsed, countdown } = useCaseTimer(currentCaseState);
  const [showBriefing, setShowBriefing] = useState(true);
  const [mobileDrawer, setMobileDrawer] = useState<string | null>(null);

  useEffect(() => {
    if (activeTool) trackToolUsage(activeTool);
  }, [activeTool, trackToolUsage]);

  const openUpgradeForFeature = (tool: PremiumToolMeta) => {
    const required = getRequiredProductForFeature(tool.id);
    if (!required) return;
    prompt({
      productId: required.id,
      contextKey: `feature:${tool.id}`,
      reason: `${tool.label} is part of ${required.name}. ${tool.description}`,
    });
  };

  const handlePremiumTool = (tool: PremiumToolMeta) => {
    trackToolUsage(tool.id);
    setActiveTool(tool.id);
  };

  const handleMobilePremiumTap = (tool: PremiumToolMeta) => {
    setMobileDrawer(null);
    handlePremiumTool(tool);
  };

  if (!currentCaseDef || !currentCaseState) return null;

  const renderDrawerContent = () => {
    switch (mobileDrawer) {
      case 'evidence':
        return <EvidenceLocker />;
      case 'hints':
        return <HintPanel />;
      case 'symptoms':
        return (
          <>
            <SymptomsPanel />
            <div className="border-t border-zinc-800/30">
              <ActionLog />
            </div>
          </>
        );
      case 'tools':
        return <MobileToolsList onSelect={handleMobilePremiumTap} />;
      default:
        return null;
    }
  };

  return (
    <div data-tour="investigation-workspace" className="fixed inset-0 bg-[#0a0e14] flex flex-col">
      <WorkspaceHeader
        currentCaseDef={currentCaseDef}
        elapsed={elapsed}
        countdown={countdown}
        onExit={exitCase}
        onShowBriefing={() => setShowBriefing(true)}
        onToggleDiagnosis={toggleDiagnosisForm}
      />

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0">
          <ToolTabBar
            activeTool={activeTool}
            mobileDrawer={mobileDrawer}
            onActiveToolChange={setActiveTool}
            onPremiumTool={handlePremiumTool}
            onMobileDrawerChange={setMobileDrawer}
          />

          <div className="flex-1 p-2 sm:p-3 overflow-hidden relative">
            <ActiveToolPanel activeTool={activeTool} onUpgrade={openUpgradeForFeature} />

            <AnimatePresence>
              {mobileDrawer && (
                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  className="absolute inset-x-0 bottom-0 z-30 bg-[#0c1017] border-t border-zinc-800/50 rounded-t-xl max-h-[60%] overflow-y-auto lg:hidden"
                >
                  <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 bg-[#0c1017] border-b border-zinc-800/30">
                    <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
                      {mobileDrawer === 'tools'
                        ? 'Premium Tools'
                        : SIDEBAR_TABS.find((t) => t.id === mobileDrawer)?.label}
                    </span>
                    <button
                      onClick={() => setMobileDrawer(null)}
                      className="p-1 text-zinc-500 hover:text-zinc-300"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {renderDrawerContent()}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="hidden lg:flex w-72 border-l border-zinc-800/50 bg-[#0c1017] flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <SymptomsPanel />

            <div className="border-t border-zinc-800/30">
              <EvidenceLocker />
            </div>

            <div className="border-t border-zinc-800/30">
              <HintPanel />
            </div>

            <div className="border-t border-zinc-800/30">
              <ActionLog />
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>{showDiagnosisForm && <DiagnosisForm />}</AnimatePresence>

      <AnimatePresence>
        {showBriefing && (
          <BriefingModal caseDef={currentCaseDef} onClose={() => setShowBriefing(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
