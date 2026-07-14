import { Link, useLocation } from "wouter";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary/30 overflow-x-hidden">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 max-w-screen-2xl items-center gap-2 px-4 md:px-8">
          <Link href="/" className="flex items-center min-w-0">
            <span className="font-bold text-base sm:text-xl tracking-tight truncate">
              NINJA<span className="text-primary">LAUNCHKIT</span>
            </span>
          </Link>
          <nav className="hidden md:flex flex-1 items-center space-x-6 ml-6 text-sm font-medium">
            <Link href="/pricing" className="transition-colors hover:text-foreground/80 text-foreground/60">Pricing</Link>
            <Link href="/contact" className="transition-colors hover:text-foreground/80 text-foreground/60">Contact</Link>
          </nav>
          <div className="flex flex-1 md:flex-none items-center justify-end gap-2 sm:gap-4">
            <Link href="/pricing" className="md:hidden text-sm font-medium text-foreground/60 hover:text-foreground/80">Pricing</Link>
            <Link href="/login" className="text-sm font-medium transition-colors hover:text-foreground/80">Login</Link>
            <Link href="/signup" className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring whitespace-nowrap">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {children}
      </main>

      <footer className="border-t border-border/40 py-6 md:py-0">
        <div className="container flex flex-col items-center justify-between gap-4 md:h-24 md:flex-row max-w-screen-2xl px-4 md:px-8">
          <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
            Built by <span className="font-medium">Shotgun Ninjas Productions</span>. All rights reserved.
          </p>
          <div className="flex items-center space-x-4 text-sm text-muted-foreground">
            <Link href="/terms" className="hover:underline">Terms</Link>
            <Link href="/privacy" className="hover:underline">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
