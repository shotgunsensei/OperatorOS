import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { buildPublicMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPublicMetadata({
  title: 'How OperatorOS Works | One Console for Business Operations',
  description:
    'See how OperatorOS gives your organization one sign-in, one team, one bill, and a clear place to open every business application.',
  path: '/how-it-works',
});

export default function HowItWorksLayout({ children }: { children: ReactNode }) {
  return children;
}
