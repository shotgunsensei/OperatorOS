import { useCallback, useEffect, useState } from 'react';

export function useResource<T>(loader: () => Promise<T>, deps: React.DependencyList = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await loader()); } catch (value) { setError(value instanceof Error ? value.message : 'Unable to load TorqueShed data'); }
    finally { setLoading(false); }
  }, deps);
  useEffect(() => { void reload(); }, [reload]);
  return { data, loading, error, reload, setData };
}
