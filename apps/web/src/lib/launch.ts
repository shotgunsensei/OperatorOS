import { Capacitor } from '@capacitor/core';

export async function openExternal(url: string): Promise<void> {
  if (!url) return;

  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url, presentationStyle: 'fullscreen' });
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}
