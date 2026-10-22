import type { Metadata } from 'next';
import { headers } from 'next/headers';
import FieldNodeLanding from '@/components/marketing/FieldNodeLanding';
import { fieldNodeLinks, fieldNodePurchaseUrl } from '../../../../../packages/modules/fieldnode.js';

export const metadata: Metadata = {
  title: 'FieldNode hardware and free application | OperatorOS',
  description: 'Explore FieldNode hardware and the free OperatorOS application. Existing owners can open the device-management entry.',
};

export default async function FieldNodePage() {
  const requestHeaders = await headers();
  const links = fieldNodeLinks({ host: requestHeaders.get('host'), forwardedHost: requestHeaders.get('x-forwarded-host'), forwardedProto: requestHeaders.get('x-forwarded-proto') }, process.env.APP_ENV ?? process.env.NODE_ENV);
  return <FieldNodeLanding purchaseHref={links.purchase} manageHref={links.manage} checkoutHref={fieldNodePurchaseUrl(process.env.FIELDNODE_HARDWARE_PURCHASE_URL)} />;
}
