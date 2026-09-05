import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { buildPublicMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPublicMetadata({
  title: 'OperatorOS Ecosystem | Connected Business Applications',
  description:
    'Explore available and upcoming business applications that share secure sign-in, billing, administration, and team access through OperatorOS.',
  path: '/ecosystem',
});

export default function EcosystemLayout({ children }: { children: ReactNode }) {
  return children;
}
