import { Link, useLocation } from "wouter";
import { useGetSession, useLogout } from "@workspace/api-client-react";
import { 
  LayoutDashboard, 
  PenTool, 
  FolderKanban, 
  Palette, 
  Download, 
  Settings, 
  ShieldAlert,
  LogOut,
  Menu,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/builder", label: "Kit Builder", icon: PenTool },
  { href: "/templates", label: "Templates", icon: Sparkles },
  { href: "/kits", label: "Saved Kits", icon: FolderKanban },
  { href: "/brands", label: "Brand Profiles", icon: Palette },
  { href: "/exports", label: "Exports", icon: Download },
  { href: "/account", label: "Account", icon: Settings },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: session } = useGetSession();
  const logout = useLogout();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => setLocation("/login")
    });
  };

  const isAdmin = session?.user?.role === "admin";

  const NavLinks = ({ className = "" }: { className?: string }) => (
    <div className={`flex flex-col gap-2 ${className}`}>
      {NAV_ITEMS.map((item) => {
        const isActive = location === item.href || location.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={item.href}>
            <div className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}>
              <item.icon className="h-4 w-4" />
              {item.label}
            </div>
          </Link>
        );
      })}
      
      {isAdmin && (
        <>
          <div className="my-2 h-px bg-border" />
          <Link href="/admin">
            <div className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              location.startsWith("/admin") ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}>
              <ShieldAlert className="h-4 w-4" />
              Admin Panel
            </div>
          </Link>
        </>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-card">
        <div className="flex h-16 items-center px-6 border-b border-border">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold tracking-tight">
            NINJA<span className="text-primary">LAUNCHKIT</span>
          </Link>
        </div>
        <div className="flex-1 overflow-auto py-6 px-4">
          <NavLinks />
        </div>
        <div className="border-t border-border p-4">
          <Button variant="ghost" className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Mobile Nav */}
      <div className="flex flex-1 flex-col">
        <header className="md:hidden flex h-16 items-center justify-between border-b border-border bg-card px-4">
          <Link href="/dashboard" className="font-bold tracking-tight">
            NINJA<span className="text-primary">LK</span>
          </Link>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <div className="flex h-16 items-center px-6 border-b border-border">
                <span className="font-bold tracking-tight">
                  NINJA<span className="text-primary">LAUNCHKIT</span>
                </span>
              </div>
              <div className="py-6 px-4">
                <NavLinks />
              </div>
              <div className="absolute bottom-0 w-full border-t border-border p-4">
                <Button variant="ghost" className="w-full justify-start gap-3 text-muted-foreground" onClick={handleLogout}>
                  <LogOut className="h-4 w-4" />
                  Logout
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </header>

        {/* Demo Banner */}
        {session && !session.user && (
          <div className="bg-primary/20 border-b border-primary/30 px-4 py-2 text-center text-sm font-medium text-primary">
            Demo mode active. <Link href="/signup" className="underline underline-offset-4 hover:text-primary-foreground">Sign up</Link> to save your kits.
          </div>
        )}

        <main className="flex-1 p-4 md:p-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}