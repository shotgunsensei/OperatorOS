'use client';

import React from 'react';
import { canonicalModuleLaunchUrl } from '@/lib/module-launch';
import { isNativeLaunchRuntime, navigateToModuleProgrammatically } from '@/lib/launch';

type ModuleLaunchLinkProps = Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  'href' | 'target' | 'rel' | 'onClick'
> & {
  moduleId?: string;
  href?: string;
  openInNewTab?: boolean;
  onLaunch?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
};

/**
 * Canonical module-navigation primitive. Web navigation remains a real anchor
 * so the browser owns ordinary, modifier, middle-click, context-menu, history,
 * and accessibility behavior. The primary action deliberately has no target.
 * Only an explicitly labelled secondary action receives `_blank`.
 *
 * Capacitor keeps its separate full-screen system-browser presentation for an
 * unmodified primary activation. Web modifier semantics are never intercepted.
 */
export default function ModuleLaunchLink({
  moduleId,
  href,
  openInNewTab = false,
  onLaunch,
  children,
  ...anchorProps
}: ModuleLaunchLinkProps) {
  const destination = href ?? (moduleId ? canonicalModuleLaunchUrl(moduleId) : '');
  if (!destination) return null;

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    onLaunch?.(event);
    if (event.defaultPrevented) return;

    const ordinaryPrimaryActivation = event.button === 0
      && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
    if (ordinaryPrimaryActivation && isNativeLaunchRuntime()) {
      event.preventDefault();
      void navigateToModuleProgrammatically(destination);
    }
  };

  return (
    <a
      {...anchorProps}
      href={destination}
      target={openInNewTab ? '_blank' : undefined}
      rel={openInNewTab ? 'noopener noreferrer' : undefined}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}
