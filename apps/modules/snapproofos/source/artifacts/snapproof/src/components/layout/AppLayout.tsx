import { Link, useLocation } from "wouter";
import { useLogout } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { 
  Briefcase, 
  Users, 
  Settings, 
  LogOut, 
  LayoutDashboard,
  FileText,
  User,
  Activity,
  CreditCard
} from "lucide-react";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { mutate: logout } = useLogout();
  const [location, setLocation] = useLocation();

  const handleLogout = () => {
    logout(undefined, {
      onSuccess: () => {
        setLocation("/login");
      }
    });
  };

  const navItems = [
    { icon: LayoutDashboard, label: "Console", href: "/dashboard" },
    { icon: Briefcase, label: "Jobs", href: "/jobs" },
    { icon: Users, label: "Customers", href: "/customers" },
    { icon: FileText, label: "Templates", href: "/templates" },
  ];

  const bottomNavItems = [
    { icon: Activity, label: "Activity", href: "/activity" },
    { icon: User, label: "Profile", href: "/profile" },
    { icon: CreditCard, label: "Billing", href: "/billing" },
    { icon: Settings, label: "Settings", href: "/settings" },
  ];

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden border-b border-border bg-card p-4 flex items-center justify-between sticky top-0 z-50">
        <img src="/images/snapproof-logo.png" alt="SnapProof OS" className="h-10 object-contain" />
        <Button variant="ghost" size="icon" onClick={handleLogout}>
          <LogOut className="h-5 w-5" />
        </Button>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-card sticky top-0 h-screen">
        <div className="p-6">
          <img src="/images/snapproof-logo.png" alt="SnapProof OS" className="h-12 object-contain" />
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2 mt-4">Field Ops</div>
          {navItems.map((item) => {
            const isActive = location.startsWith(item.href);
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}

          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2 mt-8">System</div>
          {bottomNavItems.map((item) => {
            const isActive = location.startsWith(item.href);
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive 
                    ? "bg-secondary text-foreground" 
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 w-full transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Log Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 relative">
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-card/95 backdrop-blur-sm z-50 flex justify-around p-2 pb-safe">
        {navItems.map((item) => {
          const isActive = location.startsWith(item.href);
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={`flex flex-col items-center p-2 rounded-md transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <item.icon className="h-5 w-5 mb-1" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}