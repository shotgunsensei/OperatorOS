import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '@/stores/useAppStore';
import { Send, X, CheckSquare } from 'lucide-react';

export default function DiagnosisForm() {
  const currentCaseDef = useAppStore(s => s.currentCaseDef);
  const currentCaseState = useAppStore(s => s.currentCaseState);
  const submitDiagnosis = useAppStore(s => s.submitDiagnosis);
  const toggleDiagnosisForm = useAppStore(s => s.toggleDiagnosisForm);
  const [rootCause, setRootCause] = useState('');
  const [remediation, setRemediation] = useState('');
  const [selectedEvidence, setSelectedEvidence] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);

  if (!currentCaseDef || !currentCaseState) return null;

  const unlockedEvidence = currentCaseDef.evidence.filter(e =>
    currentCaseState.unlockedEvidence.includes(e.id)
  );

  const toggleEvidence = (id: string) => {
    setSelectedEvidence(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }

    submitDiagnosis({
      rootCause,
      supportingEvidence: selectedEvidence,
      proposedRemediation: remediation,
      submittedAt: Date.now(),
    });
  };

  const isValid = rootCause.trim().length > 10 && selectedEvidence.length > 0 && remediation.trim().length > 10;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="bg-[#111822] border border-zinc-800/60 rounded-lg max-w-2xl w-full max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/50">
          <div className="flex items-center gap-2">
            <Send size={16} className="text-cyan-400" />
            <h2 className="font-mono text-sm uppercase tracking-wider text-zinc-200">
              Submit Diagnosis
            </h2>
          </div>
          <button
            onClick={toggleDiagnosisForm}
            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="block text-xs font-mono text-zinc-400 uppercase tracking-wider mb-2">
              Suspected Root Cause *
            </label>
            <textarea
              value={rootCause}
              onChange={e => setRootCause(e.target.value)}
              placeholder="Describe the root cause you've identified..."
              rows={4}
              className="w-full bg-[#0c1017] border border-zinc-800/50 rounded px-3 py-2 text-sm text-zinc-200 font-mono placeholder:text-zinc-700 focus:outline-none focus:border-cyan-500/30 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-zinc-400 uppercase tracking-wider mb-2">
              Supporting Evidence * ({selectedEvidence.length} selected)
            </label>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {unlockedEvidence.map(evidence => (
                <button
                  key={evidence.id}
                  onClick={() => toggleEvidence(evidence.id)}
                  className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded text-xs transition-colors ${
                    selectedEvidence.includes(evidence.id)
                      ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-300'
                      : 'bg-[#0c1017] border border-zinc-800/30 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <CheckSquare
                    size={14}
                    className={
                      selectedEvidence.includes(evidence.id)
                        ? 'text-cyan-400'
                        : 'text-zinc-700'
                    }
                  />
                  <span className="font-medium text-zinc-300">
                    {evidence.title}
                  </span>
                </button>
              ))}
              {unlockedEvidence.length === 0 && (
                <p className="text-xs text-zinc-600 py-2">
                  No evidence collected yet. Use tools to discover evidence.
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-zinc-400 uppercase tracking-wider mb-2">
              Proposed Remediation *
            </label>
            <textarea
              value={remediation}
              onChange={e => setRemediation(e.target.value)}
              placeholder="Describe how to fix the issue..."
              rows={3}
              className="w-full bg-[#0c1017] border border-zinc-800/50 rounded px-3 py-2 text-sm text-zinc-200 font-mono placeholder:text-zinc-700 focus:outline-none focus:border-cyan-500/30 resize-none"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-zinc-600">
              {currentCaseState.hintsUsed.length > 0 && (
                <span className="text-amber-500">
                  {currentCaseState.hintsUsed.length} hint(s) used — score penalty applies
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={toggleDiagnosisForm}
                className="px-4 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!isValid}
                className={`px-6 py-2 rounded text-xs font-mono uppercase tracking-wider transition-all ${
                  confirming
                    ? 'bg-amber-500/20 border border-amber-500/50 text-amber-400 hover:bg-amber-500/30'
                    : isValid
                    ? 'bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/30'
                    : 'bg-zinc-800/30 border border-zinc-800/30 text-zinc-700 cursor-not-allowed'
                }`}
              >
                {confirming ? 'Confirm Submission' : 'Submit Diagnosis'}
              </button>
            </div>
          </div>

          {confirming && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-400"
            >
              Are you sure? Once submitted, your diagnosis will be evaluated and scored. This action cannot be undone.
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
