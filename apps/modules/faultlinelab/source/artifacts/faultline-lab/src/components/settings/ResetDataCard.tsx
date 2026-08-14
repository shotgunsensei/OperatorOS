import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { clearAllData } from '@/lib/persistence';

export function ResetDataCard() {
  const [confirmReset, setConfirmReset] = useState(false);

  const handleReset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    clearAllData();
    window.location.reload();
  };

  return (
    <div className="bg-[#111822] border border-red-500/20 rounded-lg p-4 mt-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Trash2 size={16} className="text-red-400" />
          <div>
            <p className="text-sm text-zinc-200">Reset All Data</p>
            <p className="text-xs text-zinc-600">
              Clear all progress, scores, and settings
            </p>
          </div>
        </div>
        <button
          onClick={handleReset}
          className={`px-4 py-1.5 rounded text-xs font-mono uppercase transition-colors ${
            confirmReset
              ? 'bg-red-500/20 border border-red-500/50 text-red-400'
              : 'bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-red-400'
          }`}
        >
          {confirmReset ? 'Confirm Reset' : 'Reset'}
        </button>
      </div>
    </div>
  );
}
