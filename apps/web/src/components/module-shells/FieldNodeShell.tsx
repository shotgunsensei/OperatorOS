'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fieldNodeIntroductionPath } from '../../../../../packages/modules/fieldnode.js';

/** The enclosing module host verifies the signed-in user's active tenant grant. */
export default function FieldNodeShell() {
  const [introduction, setIntroduction] = useState('https://fieldnode.operatoros.net/');
  useEffect(() => {
    setIntroduction(fieldNodeIntroductionPath(window.location.hostname, window.location.pathname));
  }, []);
  return (
    <section id="fieldnode-management" className="fieldnode-management" data-testid="fieldnode-management-unavailable">
      <h1>Manage my FieldNodes</h1>
      <p role="status">Remote management is not connected yet. Before devices can appear here, an approved pairing service must verify device ownership for your organization.</p>
      <p>The application is free with your OperatorOS account. A paid plan or software license does not verify hardware ownership.</p>
      <p>Continue using your appliance’s local console while remote pairing is unavailable.</p>
      <Link href={introduction}>About FieldNode and hardware purchasing</Link>
    </section>
  );
}
