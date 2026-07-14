import { useAppStore } from '@/stores/useAppStore';
import { Activity, AlertTriangle, AlertCircle, Info } from 'lucide-react';

const severityConfig = {
  low: { icon: <Info size={12} />, color: 'text-zinc-500', bg: 'bg-zinc-800/30' },
  medium: { icon: <Info size={12} />, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  high: { icon: <AlertTriangle size={12} />, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  critical: { icon: <AlertCircle size={12} />, color: 'text-red-400', bg: 'bg-red-500/10' },
};

export default function SymptomsPanel() {
  const currentCaseDef = useAppStore(s => s.currentCaseDef);

  if (!currentCaseDef) return null;

  return (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-3">
        <Activity size={14} className="text-cyan-400" />
        <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
          Symptoms
        </span>
      </div>

      <div className="space-y-1.5">
        {currentCaseDef.symptoms.map(symptom => {
          const config = severityConfig[symptom.severity];
          return (
            <div
              key={symptom.id}
              className={`flex items-start gap-2 p-2 rounded ${config.bg}`}
            >
              <span className={`${config.color} flex-shrink-0 mt-0.5`}>
                {config.icon}
              </span>
              <p className="text-xs text-zinc-400 leading-snug">
                {symptom.description}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
