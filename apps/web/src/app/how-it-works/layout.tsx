import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { buildPublicMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPublicMetadata({
  title: 'How OperatorOS Works | One Console for Business Operations',
  description:
    'See how OperatorOS connects sign-in, organizations, billing, access, and module launches in one operational command layer.',
  path: '/how-it-works',
});

export default function HowItWorksLayout({ children }: { children: ReactNode }) {
  return children;
}