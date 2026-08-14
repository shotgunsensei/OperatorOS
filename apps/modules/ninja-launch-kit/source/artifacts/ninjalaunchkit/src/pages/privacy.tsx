export default function Privacy() {
  return (
    <div className="container max-w-3xl mx-auto py-12 px-4 font-sans prose prose-invert">
      <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
      <p className="text-sm font-mono text-muted-foreground mb-8">Last Updated: SYSTEM_CURRENT_DATE</p>
      
      <section className="space-y-4 text-foreground/80">
        <h2 className="text-2xl font-bold text-foreground">1. Information Collection</h2>
        <p>We collect information you provide directly to us, such as when you create or modify your account, request on-demand services, contact customer support, or otherwise communicate with us.</p>
        
        <h2 className="text-2xl font-bold text-foreground mt-8">2. Use of Information</h2>
        <p>We may use the information we collect about you to provide, maintain, and improve our services, including providing marketing copy tailored to your business profile.</p>

        <h2 className="text-2xl font-bold text-foreground mt-8">3. Data Security</h2>
        <p>We take reasonable measures to help protect information about you from loss, theft, misuse and unauthorized access, disclosure, alteration and destruction.</p>
      </section>
    </div>
  );
}