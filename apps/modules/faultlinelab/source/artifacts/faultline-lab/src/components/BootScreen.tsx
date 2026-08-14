import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/stores/useAppStore';
import logoUrl from '@assets/faultlinelogotrans_1776394938786.png';

const bootLines = [
  { text: 'FAULTLINE LAB v1.0.0', delay: 0 },
  { text: 'Initializing diagnostic subsystems...', delay: 300 },
  { text: 'Loading simulation kernel.............. OK', delay: 600 },
  { text: 'Loading case definitions............... OK', delay: 900 },
  { text: 'Mounting evidence database............. OK', delay: 1200 },
  { text: 'Calibrating scoring engine............. OK', delay: 1500 },
  { text: 'Restoring investigator profile......... OK', delay: 1800 },
  { text: 'Verifying persistence layer............ OK', delay: 2100 },
  { text: '', delay: 2400 },
  { text: 'All systems nominal. Welcome, Investigator.', delay: 2500 },
];

export default function BootScreen() {
  const [visibleLines, setVisibleLines] = useState(0);
  const [ready, setReady] = useState(false);
  const setView = useAppStore(s => s.setView);
  const initFromStorage = useAppStore(s => s.initFromStorage);

  useEffect(() => {
    initFromStorage();

    bootLines.forEach((line, index) => {
      setTimeout(() => {
        setVisibleLines(index + 1);
      }, line.delay);
    });

    setTimeout(() => setReady(true), 3000);
  }, [initFromStorage]);

  return (
    <div className="fixed inset-0 bg-[#0a0e14] flex items-center justify-center">
      <div className="max-w-2xl w-full px-8">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex justify-center mb-6"
        >
          <img
            src={logoUrl}
            alt="Faultline Lab"
            className="h-28 sm:h-36 w-auto drop-shadow-[0_0_32px_rgba(34,211,238,0.2)] select-none"
            draggable={false}
          />
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="font-mono text-sm"
        >
          {bootLines.slice(0, visibleLines).map((line, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.15 }}
              className={`py-0.5 ${
                i === 0
                  ? 'text-cyan-400 text-lg font-bold mb-2'
                  : line.text.includes('OK')
                  ? 'text-emerald-400'
                  : line.text.includes('Welcome')
                  ? 'text-cyan-300'
                  : 'text-zinc-500'
              }`}
            >
              {line.text}
            </motion.div>
          ))}
        </motion.div>

        <AnimatePresence>
          {ready && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="mt-10"
            >
              <button
                onClick={() => setView('incident-board')}
                className="w-full py-4 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono text-sm uppercase tracking-widest hover:bg-cyan-500/20 hover:border-cyan-500/50 transition-all duration-300 rounded"
              >
                Enter Incident Board
              </button>
              <button
                onClick={() => setView('pricing')}
                className="mt-3 w-full py-2.5 border border-zinc-700 text-zinc-400 font-mono text-xs uppercase tracking-widest hover:text-cyan-300 hover:border-cyan-500/40 transition-all duration-300 rounded"
              >
                Compare Plans
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: ready ? 1 : visibleLines / bootLines.length }}
          transition={{ duration: 0.3 }}
          className="mt-6 h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent origin-left"
        />

        <AnimatePresence>
          {ready && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="mt-10 pt-6 border-t border-zinc-800/40 flex items-center justify-between gap-4 flex-wrap text-[11px] text-zinc-500 font-mono"
            >
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500/70" />
                Built by{' '}
                <a
                  href="https://shotgunninjas.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-red-400/80 hover:text-red-300 transition-colors"
                >
                  Shotgun Ninjas Productions
                </a>
              </span>
              <span className="text-zinc-600">FaultlineLab.com</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
