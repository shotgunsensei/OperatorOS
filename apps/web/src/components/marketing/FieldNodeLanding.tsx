import Link from 'next/link';

interface FieldNodeLandingProps {
  purchaseHref: string;
  manageHref: string;
  checkoutHref: string | null;
}

export default function FieldNodeLanding({ purchaseHref, manageHref, checkoutHref }: FieldNodeLandingProps) {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16" data-testid="fieldnode-introduction">
      <Link href={new URL('/', purchaseHref).href} className="text-sm text-cyan-300">OperatorOS</Link>
      <section className="py-14">
        <p className="text-sm font-semibold uppercase tracking-widest text-cyan-300">FieldNode · Hardware and your free application</p>
        <h1 className="mt-5 text-4xl font-bold sm:text-6xl">Your field appliance. Your place to start.</h1>
        <p className="mt-6 max-w-2xl text-lg text-slate-300">Meet FieldNode, a dedicated appliance for work in the field. Explore the hardware here, or open the management entry for a FieldNode you already own.</p>
        <p className="mt-4 max-w-2xl text-slate-300">The FieldNode application is included with every free and paid OperatorOS account. Hardware is a separate purchase; the application does not require a license purchase or subscription.</p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link href={purchaseHref} className="rounded-lg bg-cyan-300 px-6 py-3 font-semibold text-slate-950">Get a FieldNode</Link>
          <Link href={manageHref} prefetch={false} className="rounded-lg border border-slate-500 px-6 py-3 font-semibold">Manage my FieldNodes</Link>
        </div>
      </section>
      <section id="purchase" aria-labelledby="fieldnode-hardware-title" className="scroll-mt-8 border-t border-slate-700 py-10">
        <h2 id="fieldnode-hardware-title" className="text-2xl font-semibold">FieldNode hardware</h2>
        {checkoutHref
          ? <p className="mt-4"><Link href={checkoutHref} className="text-cyan-300 underline">Continue to FieldNode hardware purchasing on OperatorOS</Link></p>
          : <p className="mt-4 max-w-2xl text-slate-300" role="status">Online hardware ordering is not available yet. A purchase destination and hardware pricing have not been published here.</p>}
      </section>
      <section aria-labelledby="fieldnode-owner-title" className="border-t border-slate-700 py-10">
        <h2 id="fieldnode-owner-title" className="text-2xl font-semibold">Already own a FieldNode?</h2>
        <p className="mt-4 max-w-2xl text-slate-300">Use your OperatorOS account to open management. Device access requires verified ownership and pairing with your organization. Remote device management is not connected in this release; your appliance’s local console remains separate.</p>
        <Link href={manageHref} prefetch={false} className="mt-4 inline-block text-cyan-300 underline">Manage my FieldNodes</Link>
      </section>
    </main>
  );
}
