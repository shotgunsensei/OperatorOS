import type { Metadata } from 'next';
import OperatorOsPolicyPage from '@/components/marketing/OperatorOsPolicyPage';
import { buildPublicMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPublicMetadata({
  title: 'SMS/MMS Messaging Privacy Policy | OperatorOS',
  description: 'How OperatorOS Messaging handles phone numbers, consent, message data, delivery information, and opt-outs.',
  path: '/msg_privacy',
});

export default function MessagingPrivacyPage() {
  return <OperatorOsPolicyPage kind="privacy" />;
}
