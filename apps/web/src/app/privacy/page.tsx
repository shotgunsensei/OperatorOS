import type { Metadata } from 'next';
import OperatorOsPolicyPage from '@/components/marketing/OperatorOsPolicyPage';

export const metadata: Metadata = {
  title: 'Privacy Policy | OperatorOS',
  description: 'OperatorOS privacy practices, including SMS and mobile messaging privacy.',
};

export default function PrivacyPage() {
  return <OperatorOsPolicyPage kind="privacy" />;
}
