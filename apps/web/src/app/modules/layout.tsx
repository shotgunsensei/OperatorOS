import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { buildPublicMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPublicMetadata({
  title: 'OperatorOS Modules | Build Your Operations Stack',
  description:
    'Compare OperatorOS core products, included apps, and companion modules that share your team, billing, and access controls.',
  path: '/modules',
});

export default function ModulesLayout({ children }: { children: ReactNode }) {
  return children;
}