import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import AudienceDetail from '@/components/marketing/AudienceDetail';
import { AUDIENCE_LANES, findAudienceLane, lanePath } from '@/lib/audience-lanes';
import { buildPublicMetadata, serializeJsonLd } from '@/lib/seo';

type Props = { params: Promise<{ audience: string }> };
export const dynamicParams = false;
export const generateStaticParams = () => AUDIENCE_LANES.map(lane => ({ audience: lane.slug }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lane = findAudienceLane((await params).audience);
  if (!lane) return {};
  return buildPublicMetadata({ title: `${lane.product} for ${lane.audience} | OperatorOS`, description: lane.intro, path: lanePath(lane), imagePath: `/media/audiences/${lane.slug}-social.png`, imageAlt: `${lane.product}: ${lane.cardTitle}` });
}

export default async function AudiencePage({ params }: Props) {
  const lane = findAudienceLane((await params).audience);
  if (!lane) notFound();
  const faq = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: lane.faq.map(item => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) };
  return <MarketingLayout testId={`page-marketing-${lane.slug}`}><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(faq) }} /><AudienceDetail lane={lane} /></MarketingLayout>;
}
