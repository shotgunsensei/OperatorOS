import type { Metadata } from 'next';
import LegalMessagingPage from '@/components/marketing/LegalMessagingPage';

export const metadata: Metadata = {
  title: 'SMS/MMS Messaging Terms & Conditions | OperatorOS',
  description: 'Terms for participating in consent-based OperatorOS Messaging.',
};

export default function MessagingTermsPage() {
  return <LegalMessagingPage kind="terms" />;
}