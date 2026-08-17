import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { buildPublicMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPublicMetadata({
  title: 'OperatorOS Ecosystem | Connected Business Modules',
  description:
    'Explore the active and planned business modules connected through OperatorOS shared sign-on, billing, administration, and access.',
  path: '/ecosystem',
});

export default function EcosystemLayout({ children }: { children: ReactNode }) {
  return children;
}