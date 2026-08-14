export function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border/50 sticky top-0 bg-background/80 backdrop-blur-md z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <img src="/images/snapproof-logo.png" alt="SnapProof OS" className="h-14 object-contain" />
          </a>
          <nav className="hidden md:flex items-center gap-8">
            <a href="/features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <a href="/use-cases" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Use Cases</a>
            <a href="/pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
          </nav>
          <div className="flex items-center gap-4">
            <a href="/login" className="text-sm font-medium hover:text-primary transition-colors">Log in</a>
            <a href="/register" className="text-sm font-medium bg-primary text-primary-foreground px-4 py-2 rounded shadow-sm hover:bg-primary/90 transition-colors">Get Started</a>
          </div>
        </div>
      </header>
      <main className="flex-1">
        {children}
      </main>
      <footer className="border-t border-border py-12 text-center text-muted-foreground text-sm">
        <p>&copy; {new Date().getFullYear()} Shotgun Ninjas Productions. All rights reserved.</p>
      </footer>
    </div>
  )
}
