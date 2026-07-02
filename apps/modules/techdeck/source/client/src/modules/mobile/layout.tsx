import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  TicketIcon,
  Clock,
  CalendarDays,
  Monitor,
  LogOut,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const tabs = [
  { label: "Tickets", path: "/m/tickets", icon: TicketIcon },
  { label: "Time", path: "/m/time", icon: Clock },
  { label: "Calendar", path: "/m/calendar", icon: CalendarDays },
];

export function MobileLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const initials = user
    ? `${(user.firstName || "")[0] || ""}${(user.lastName || "")[0] || ""}`
    : "?";

  return (
    <div className="flex flex-col h-[100dvh] bg-background" data-testid="mobile-layout">
      <header className="flex items-center justify-between gap-2 px-4 py-2.5 border-b bg-background/95 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-sm tracking-tight truncate">Tech Deck</span>
          <span className="text-xs text-muted-foreground hidden xs:inline">Field</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8" data-testid="button-desktop-view">
            <Link href="/">
              <Monitor className="w-4 h-4" />
            </Link>
          </Button>
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-mobile-user-menu">
                <Avatar className="w-7 h-7">
                  <AvatarImage src={user?.profileImageUrl || undefined} />
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem disabled className="text-xs opacity-70">
                {user?.firstName} {user?.lastName}
              </DropdownMenuItem>
              <DropdownMenuItem
                data-testid="button-mobile-logout"
                onClick={() => logout()}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="flex-1 overflow-auto pb-[env(safe-area-inset-bottom)]">
        {children}
      </main>

      <nav className="border-t bg-background/95 backdrop-blur-md sticky bottom-0 z-50 pb-[env(safe-area-inset-bottom)]" data-testid="mobile-bottom-nav">
        <div className="flex items-stretch">
          {tabs.map((tab) => {
            const isActive =
              tab.path === "/m/tickets"
                ? location === "/m" || location === "/m/" || location.startsWith("/m/tickets")
                : location.startsWith(tab.path);

            return (
              <Link
                key={tab.path}
                href={tab.path}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`nav-mobile-${tab.label.toLowerCase()}`}
              >
                <tab.icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : ""}`} />
                <span className="text-[11px] font-medium">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
