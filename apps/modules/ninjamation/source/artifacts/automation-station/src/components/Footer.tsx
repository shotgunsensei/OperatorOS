import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="border-t border-border/50 bg-background pt-16 pb-8 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          <div className="col-span-1 md:col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <img src="/images/ninja-head.png" alt="Ninjamation" className="w-8 h-8 object-contain" />
              <span className="font-display font-bold text-xl tracking-tight">
                <span className="text-white">NINJA</span><span className="text-primary">MATION</span>
              </span>
            </Link>
            <p className="text-muted-foreground max-w-sm">
              Your AI-powered command center for building, deploying, and scaling automation workflows.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-4 text-foreground">Platform</h4>
            <ul className="space-y-3">
              <li><Link href="/library" className="text-muted-foreground hover:text-ninja-red transition-colors">Script Library</Link></li>
              <li><Link href="/generate" className="text-muted-foreground hover:text-ninja-red transition-colors">AI Generator</Link></li>
              <li><Link href="/pricing" className="text-muted-foreground hover:text-ninja-red transition-colors">Pricing</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4 text-foreground">Account</h4>
            <ul className="space-y-3">
              <li><Link href="/account" className="text-muted-foreground hover:text-ninja-red transition-colors">Manage Subscription</Link></li>
              <li><a href="#" className="text-muted-foreground hover:text-ninja-red transition-colors">Terms of Service</a></li>
              <li><a href="#" className="text-muted-foreground hover:text-ninja-red transition-colors">Privacy Policy</a></li>
            </ul>
          </div>
        </div>
        <div className="pt-8 border-t border-border/50 text-center md:text-left text-sm text-muted-foreground flex flex-col md:flex-row justify-between items-center">
          <p>&copy; {new Date().getFullYear()} Ninjamation. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
