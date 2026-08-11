export type NinjaPoolVisualQuality = 'battery' | 'balanced' | 'high';

const KEY = 'ninja-pool-hall:visual-quality';

export function getVisualQuality(): NinjaPoolVisualQuality {
  if (typeof window === 'undefined') return 'balanced';
  const value = window.localStorage.getItem(KEY);
  return value === 'battery' || value === 'high' ? value : 'balanced';
}

export function setVisualQuality(value: NinjaPoolVisualQuality): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, value);
}

export function visualQualityProfile(value = getVisualQuality()): { frameInterval: number; durationScale: number } {
  if (value === 'battery') return { frameInterval: 7, durationScale: 0.72 };
  if (value === 'high') return { frameInterval: 1, durationScale: 1 };
  return { frameInterval: 3, durationScale: 0.9 };
}
