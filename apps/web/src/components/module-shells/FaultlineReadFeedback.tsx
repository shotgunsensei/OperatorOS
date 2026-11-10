'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Read-only panel recovery. A newer read or disposal invalidates every older result. */
export function useFaultlineReadPanel<T>(initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [denied, setDenied] = useState(false);
  const sequence = useRef(0);
  const mounted = useRef(true);
  const initialValue = useRef(initial);
  const loader = useRef<(() => Promise<T>) | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; sequence.current += 1; };
  }, []);
  const read = useCallback(async (next: () => Promise<T>) => {
    if (!mounted.current) return;
    const request = ++sequence.current;
    loader.current = next;
    setState('loading');
    setDenied(false);
    try {
      const result = await next();
      if (!mounted.current || request !== sequence.current) return;
      setValue(result);
      setState('ready');
    } catch (error: unknown) {
      if (!mounted.current || request !== sequence.current) return;
      const status = (error as { status?: number; statusCode?: number })?.status
        ?? (error as { statusCode?: number })?.statusCode;
      // Hide cached protected values after a denied read, without treating it as empty success.
      if (status === 401 || status === 403) setValue(initialValue.current);
      setDenied(status === 401 || status === 403);
      setState('error');
    }
  }, []);
  const reset = useCallback(() => {
    sequence.current += 1;
    loader.current = null;
    setValue(initialValue.current);
    setState('idle');
    setDenied(false);
  }, []);
  const retry = useCallback(() => {
    if (loader.current) void read(loader.current);
  }, [read]);
  return { value, setValue, state, denied, read, reset, retry };
}

export function FaultlineReadFeedback({ label, panel }: {
  label: string;
  panel: { state: string; denied: boolean; retry: () => void };
}) {
  if (panel.state === 'loading') return <p role="status" aria-live="polite">Loading {label.toLowerCase()}…</p>;
  if (panel.state !== 'error') return null;
  return <div role="alert" className="fl-card">
    <p><strong>{label} unavailable.</strong> {panel.denied
      ? 'Your current access could not be verified. Previously loaded values are hidden.'
      : 'The latest read failed. Any values still shown are from the last successful read, not a confirmed empty result.'}</p>
    <button type="button" onClick={panel.retry}>Retry {label.toLowerCase()}</button>
  </div>;
}
