import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { buildPublicMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPublicMetadata({
  title: 'OperatorOS Applications | Build Your Operations Stack',
  description:
    'Compare flagship and specialized OperatorOS applications that share one sign-in, team, plan, and billing experience.',
  path: '/modules',
});

export default function ModulesLayout({ children }: { children: ReactNode }) {
  return children;
}
