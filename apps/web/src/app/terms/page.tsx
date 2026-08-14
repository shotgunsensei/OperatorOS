import type { Metadata } from 'next';
import OperatorOsPolicyPage from '@/components/marketing/OperatorOsPolicyPage';

export const metadata: Metadata = {
  title: 'Terms and Conditions | OperatorOS',
  description: 'Terms governing OperatorOS and its optional SMS communications program.',
};

export default function TermsPage() {
  return <OperatorOsPolicyPage kind="terms" />;
}
