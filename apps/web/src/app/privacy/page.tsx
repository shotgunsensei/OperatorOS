import type { Metadata } from 'next';
import OperatorOsPolicyPage from '@/components/marketing/OperatorOsPolicyPage';
import { buildPublicMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPublicMetadata({
  title: 'Privacy Policy | OperatorOS',
  description: 'OperatorOS privacy practices, including SMS and mobile messaging privacy.',
  path: '/privacy',
});

export default function PrivacyPage() {
  return <OperatorOsPolicyPage kind="privacy" />;
}
