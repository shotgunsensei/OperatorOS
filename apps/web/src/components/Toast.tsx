'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastContextType {
  toast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = nextId++;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  }, []);

  const bgMap = {
    success: 'rgba(63,185,80,0.15)',
    error: 'rgba(248,81,73,0.15)',
    info: 'rgba(88,166,255,0.15)',
  };
  const borderMap = {
    success: '#3fb950',
    error: '#f85149',
    info: '#58a6ff',
  };
  const iconMap = {
    success: '\u2713',
    error: '\u2717',
    info: '\u2139',
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div role="status" aria-live="polite" aria-atomic="true" style={{
        position: 'fixed', top: 16, right: 16, zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 8,
        pointerEvents: 'none',
      }}>
        {toasts.map(t => (
          <div key={t.id} data-testid="toast-message" style={{
            padding: '12px 20px', borderRadius: 10,
            background: bgMap[t.type], border: `1px solid ${borderMap[t.type]}`,
            color: '#c9d1d9', fontSize: 13, fontWeight: 500,
            display: 'flex', alignItems: 'center', gap: 10,
            animation: 'toastSlide 0.25s ease-out',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            pointerEvents: 'auto', minWidth: 240, maxWidth: 400,
          }}>
            <span style={{ fontSize: 16, color: borderMap[t.type], flexShrink: 0 }}>{iconMap[t.type]}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes toastSlide {
          from { opacity: 0; transform: translateX(40px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
