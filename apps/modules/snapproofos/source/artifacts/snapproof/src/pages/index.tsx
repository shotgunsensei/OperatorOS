import { Link } from "wouter";

export default function Index() {
  return (
    <div className="flex flex-col items-center">
      <section className="w-full max-w-7xl mx-auto px-6 py-24 md:py-32 flex flex-col items-center text-center">
        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-6 max-w-4xl text-balance leading-tight">
          Turn field chaos into <br/><span className="text-primary">polished proof</span> in minutes.
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl leading-relaxed">
          The tactical field operations console for mechanics, IT engineers, and contractors. Capture photos, document findings, and generate client-ready reports instantly.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 mb-16">
          <Link href="/register" className="bg-primary text-primary-foreground px-8 py-4 rounded-md font-medium text-lg shadow-lg hover:bg-primary/90 transition-all active:scale-[0.98]">
            Start for free
          </Link>
          <Link href="/demo" className="bg-secondary text-secondary-foreground border border-border px-8 py-4 rounded-md font-medium text-lg hover:bg-secondary/80 transition-all">
            View Sample Reports
          </Link>
        </div>
        <div className="w-full max-w-5xl">
          <img 
            src="/images/hero-mockup.png" 
            alt="SnapProof OS - Field documentation on mobile and tablet" 
            className="w-full rounded-xl shadow-2xl shadow-primary/10 border border-border/30"
          />
        </div>
      </section>

      <section className="w-full bg-card border-y border-border py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-12">
            <div className="space-y-4">
              <div className="w-12 h-12 bg-primary/10 text-primary rounded flex items-center justify-center font-bold text-xl">1</div>
              <h3 className="text-xl font-bold">Capture the Mess</h3>
              <p className="text-muted-foreground leading-relaxed">Snap photos of the site, log parts used, and record voice notes while your hands are dirty.</p>
            </div>
            <div className="space-y-4">
              <div className="w-12 h-12 bg-primary/10 text-primary rounded flex items-center justify-center font-bold text-xl">2</div>
              <h3 className="text-xl font-bold">AI Organizes It</h3>
              <p className="text-muted-foreground leading-relaxed">Our AI structures your raw data into professional findings, summaries, and recommendations.</p>
            </div>
            <div className="space-y-4">
              <div className="w-12 h-12 bg-primary/10 text-primary rounded flex items-center justify-center font-bold text-xl">3</div>
              <h3 className="text-xl font-bold">Prove & Bill</h3>
              <p className="text-muted-foreground leading-relaxed">Export a high-end PDF report with your branding. Send to the client and get paid faster.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
