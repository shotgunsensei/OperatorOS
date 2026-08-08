import type { Metadata } from 'next';
import LegalMessagingPage from '@/components/marketing/LegalMessagingPage';

export const metadata: Metadata = {
  title: 'SMS/MMS Messaging Privacy Policy | OperatorOS',
  description: 'How OperatorOS Messaging handles phone numbers, consent, message data, delivery information, and opt-outs.',
};

export default function MessagingPrivacyPage() {
  return <LegalMessagingPage kind="privacy" />;
}