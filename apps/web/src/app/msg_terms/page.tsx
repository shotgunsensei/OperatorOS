import type { Metadata } from 'next';
import OperatorOsPolicyPage from '@/components/marketing/OperatorOsPolicyPage';
import { buildPublicMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPublicMetadata({
  title: 'SMS/MMS Messaging Terms & Conditions | OperatorOS',
  description: 'Terms for participating in consent-based OperatorOS Messaging.',
  path: '/msg_terms',
});

export default function MessagingTermsPage() {
  return <OperatorOsPolicyPage kind="terms" />;
}
