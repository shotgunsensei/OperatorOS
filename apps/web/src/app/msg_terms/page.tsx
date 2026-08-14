import type { Metadata } from 'next';
import OperatorOsPolicyPage from '@/components/marketing/OperatorOsPolicyPage';

export const metadata: Metadata = {
  title: 'SMS/MMS Messaging Terms & Conditions | OperatorOS',
  description: 'Terms for participating in consent-based OperatorOS Messaging.',
};

export default function MessagingTermsPage() {
  return <OperatorOsPolicyPage kind="terms" />;
}
