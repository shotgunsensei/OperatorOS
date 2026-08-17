import type { Metadata } from 'next';
import OperatorOsPolicyPage from '@/components/marketing/OperatorOsPolicyPage';
import { buildPublicMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPublicMetadata({
  title: 'Terms and Conditions | OperatorOS',
  description: 'Terms governing OperatorOS and its optional SMS communications program.',
  path: '/terms',
});

export default function TermsPage() {
  return <OperatorOsPolicyPage kind="terms" />;
}
