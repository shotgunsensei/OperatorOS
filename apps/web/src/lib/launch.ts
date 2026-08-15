import { Capacitor } from '@capacitor/core';

async function openNativeBrowser(url: string): Promise<void> {
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url, presentationStyle: 'fullscreen' });
}

export function isNativeLaunchRuntime(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Deliberate external-document/checkout action. Web callers should label this
 * as opening another tab; module launchers must use a real anchor instead.
 */
export async function openExternalDocument(url: string): Promise<void> {
  if (!url) return;

  if (isNativeLaunchRuntime()) return openNativeBrowser(url);

  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (opened) opened.opener = null;
}

/** Programmatic fallback only; ordinary web module launches are anchors. */
export async function navigateToModuleProgrammatically(url: string): Promise<void> {
  if (!url) return;

  if (isNativeLaunchRuntime()) return openNativeBrowser(url);
  window.location.assign(url);
}
