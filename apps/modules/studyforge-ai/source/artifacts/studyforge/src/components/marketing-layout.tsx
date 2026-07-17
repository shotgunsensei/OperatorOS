import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { BookOpen } from "lucide-react";

export function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="container mx-auto px-4 h-16 flex items-center justify-between border-b border-border/40">
        <Link href="/" className="flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold">StudyForge</span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-4">
          <Link href="/pricing" className="text-sm font-medium hover:text-primary transition-colors px-2">Pricing</Link>
          <Link href="/login" className="text-sm font-medium hover:text-primary transition-colors px-2 hidden sm:inline">Login</Link>
          <Link href="/signup">
            <Button size="sm">Sign Up</Button>
          </Link>
        </nav>
      </header>
      <main className="flex-1 flex flex-col">
        {children}
      </main>
      <footer className="border-t border-border/40 py-12 mt-auto bg-card/30">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div className="col-span-2 md:col-span-1">
              <Link href="/" className="flex items-center gap-2 mb-3">
                <BookOpen className="h-5 w-5 text-primary" />
                <span className="font-bold">StudyForge</span>
              </Link>
              <p className="text-sm text-muted-foreground">
                Notes in. Study weapons out.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/" className="hover:text-primary transition-colors">Home</Link></li>
                <li><Link href="/pricing" className="hover:text-primary transition-colors">Pricing</Link></li>
                <li><Link href="/signup" className="hover:text-primary transition-colors">Sign up</Link></li>
                <li><Link href="/login" className="hover:text-primary transition-colors">Log in</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/contact" className="hover:text-primary transition-colors">Contact</Link></li>
                <li><Link href="/pricing" className="hover:text-primary transition-colors">FAQ</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/terms" className="hover:text-primary transition-colors">Terms of Service</Link></li>
                <li><Link href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border/40 pt-6 text-center text-xs text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} StudyForge AI. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
