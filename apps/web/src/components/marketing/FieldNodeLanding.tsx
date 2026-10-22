import Link from 'next/link';

interface FieldNodeLandingProps {
  purchaseHref: string;
  manageHref: string;
  checkoutHref: string | null;
}

export default function FieldNodeLanding({ purchaseHref, manageHref, checkoutHref }: FieldNodeLandingProps) {
  return (
    <main className="fieldnode-landing" data-testid="fieldnode-introduction">
      <Link href={new URL('/', purchaseHref).href}>OperatorOS</Link>
      <section className="fieldnode-hero">
        <p className="fieldnode-eyebrow">FieldNode · Hardware and your free application</p>
        <h1>Your field appliance. Your place to start.</h1>
        <p>Meet FieldNode, a dedicated appliance for work in the field. Explore the hardware here, or open the management entry for a FieldNode you already own.</p>
        <p>The FieldNode application is included with every free and paid OperatorOS account. Hardware is a separate purchase; the application does not require a license purchase or subscription.</p>
        <div className="fieldnode-actions">
          <Link href={purchaseHref} className="fieldnode-button fieldnode-button-primary">Get a FieldNode</Link>
          <Link href={manageHref} prefetch={false} className="fieldnode-button fieldnode-button-secondary">Manage my FieldNodes</Link>
        </div>
      </section>
      <section id="purchase" aria-labelledby="fieldnode-hardware-title" className="fieldnode-section">
        <h2 id="fieldnode-hardware-title">FieldNode hardware</h2>
        {checkoutHref
          ? <p><Link href={checkoutHref}>Continue to FieldNode hardware purchasing on OperatorOS</Link></p>
          : <p role="status">Online hardware ordering is not available yet. A purchase destination and hardware pricing have not been published here.</p>}
      </section>
      <section aria-labelledby="fieldnode-owner-title" className="fieldnode-section">
        <h2 id="fieldnode-owner-title">Already own a FieldNode?</h2>
        <p>Use your OperatorOS account to open management. Device access requires verified ownership and pairing with your organization. Remote device management is not connected in this release; your appliance’s local console remains separate.</p>
        <Link href={manageHref} prefetch={false}>Manage my FieldNodes</Link>
      </section>
    </main>
  );
}
