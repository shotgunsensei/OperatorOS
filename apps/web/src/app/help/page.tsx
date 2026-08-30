import type { Metadata } from 'next';
import HelpCenter from '@/components/help/HelpCenter';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import { buildPublicMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPublicMetadata({
  title: 'OperatorOS Help Center',
  description: 'Searchable guides for OperatorOS, Platform Command, and every OperatorOS module page and function.',
  path: '/help',
});

type HelpPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function HelpPage({ searchParams }: HelpPageProps) {
  const query = searchParams ? await searchParams : {};
  return (
    <MarketingLayout testId="page-help-center">
      <HelpCenter
        initialGuideId={first(query.guide) ?? first(query.module)}
        initialPagePath={first(query.page)}
      />
    </MarketingLayout>
  );
}
