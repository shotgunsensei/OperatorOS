import { Target, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';

export interface TierStyle {
  color: string;
  bg: string;
  border: string;
  icon: ReactNode;
}

export const tierConfig: Record<string, TierStyle> = {
  Surgical: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: <Target size={24} /> },
  Solid: { color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', icon: <CheckCircle size={24} /> },
  'Sloppy but Correct': { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: <AlertTriangle size={24} /> },
  Misdiagnosed: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', icon: <XCircle size={24} /> },
};
