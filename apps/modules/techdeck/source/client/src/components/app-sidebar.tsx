import {
  Activity,
  BookOpen,
  Building2,
  CalendarDays,
  Clock,
  Code,
  CreditCard,
  LayoutDashboard,
  FileText,
  Home,
  Key,
  KeyRound,
  Lock,
  LogOut,
  MapPin,
  Receipt,
  Repeat,
  Server,
  Settings,
  Shield,
  ShieldCheck,
  Smartphone,
  Terminal,
  TicketIcon,
  Upload,
  Users,
  Webhook,
  ChevronUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import logoImage from "@assets/ShotgunNinjaVaulticon_1770412982737.png";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { MemberRole } from "@shared/schema";
import { PlanBadge } from "@/components/plan-badge";
import { Badge } from "@/components/ui/badge";
import {
  getSidebarSections,
  routeMatches,
  type NavIconKey,
} from "@/lib/route-manifest";

interface AppSidebarProps {
  role: MemberRole;
  isSystemAdmin?: boolean;
  isPaused?: boolean;
}

const iconMap: Record<NavIconKey, LucideIcon> = {
  activity: Activity,
  book: BookOpen,
  building: Building2,
  calendar: CalendarDays,
  clock: Clock,
  code: Code,
  creditCard: CreditCard,
  dashboard: LayoutDashboard,
  file: FileText,
  home: Home,
  key: Key,
  keyRound: KeyRound,
  mapPin: MapPin,
  receipt: Receipt,
  repeat: Repeat,
  server: Server,
  shield: Shield,
  shieldCheck: ShieldCheck,
  smartphone: Smartphone,
  terminal: Terminal,
  ticket: TicketIcon,
  upload: Upload,
  users: Users,
  webhook: Webhook,
  wrench: Settings,
};

interface EntitlementsResponse {
  snapshot: {
    features?: string[];
    enabled?: boolean;
    subscriptionStatus?: string;
  } | null;
}

function navTestId(title: string) {
  return `nav-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

export function AppSidebar({ role, isSystemAdmin = false, isPaused = false }: AppSidebarProps) {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();

  const isAdminOrOwner = role === "OWNER" || role === "ADMIN";
  const { data: entitlements } = useQuery<EntitlementsResponse>({
    queryKey: ["/api/me/entitlements"],
    staleTime: 60_000,
  });

  const sections = getSidebarSections({
    role: role as "OWNER" | "ADMIN" | "TECH" | "CLIENT",
    isSystemAdmin,
    isPaused,
    features: entitlements?.snapshot?.features,
  });

  const initials = user
    ? `${(user.firstName || "")[0] || ""}${(user.lastName || "")[0] || ""}`
    : "?";

  return (
    <Sidebar className="border-sidebar-border bg-sidebar/95">
      <SidebarHeader className="p-4 border-b border-sidebar-border/70">
        <div className="flex items-center justify-between gap-2">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <img
                src={logoImage}
                alt="Tech Deck"
                className="w-8 h-8 rounded-md object-cover"
              />
              <div>
                <h2 className="text-sm font-semibold tracking-tight leading-none">
                  Tech Deck
                </h2>
                <p className="text-xs text-muted-foreground leading-none mt-0.5">
                  MSP Ops Console
                </p>
              </div>
            </div>
          </Link>
          <PlanBadge canManage={isAdminOrOwner} />
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-sidebar-border/70 bg-sidebar-accent/30 px-2 py-1.5">
          <span className="text-[11px] uppercase tracking-[0.12em] text-sidebar-foreground/60">
            OperatorOS
          </span>
          <Badge variant={isPaused ? "destructive" : "outline"} className="text-[10px]">
            {isPaused ? "Action needed" : "Managed"}
          </Badge>
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-1 py-2">
        {sections.map((section) => (
          <SidebarGroup key={section.id} className="py-1.5">
            <SidebarGroupLabel className="h-6 text-[11px] uppercase tracking-[0.12em] text-sidebar-foreground/50">
              {section.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const Icon = iconMap[item.icon];
                  const active = routeMatches(location, item.href, item.exact);

                  return (
                    <SidebarMenuItem key={`${section.id}-${item.title}`}>
                      {item.locked ? (
                        <SidebarMenuButton
                          disabled
                          isActive={false}
                          className="text-sidebar-foreground/45"
                          title={`${item.title} is managed by OperatorOS`}
                          data-testid={`${navTestId(item.title)}-locked`}
                        >
                          <Icon className="w-4 h-4" />
                          <span>{item.title}</span>
                          <Lock className="ml-auto w-3 h-3" aria-label="Locked by OperatorOS" />
                        </SidebarMenuButton>
                      ) : (
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={item.title}
                          className={active ? "bg-sidebar-accent/90" : ""}
                        >
                          <Link href={item.href} data-testid={navTestId(item.title)}>
                            <Icon className="w-4 h-4" />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="p-2 border-t border-sidebar-border/70">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 px-2 hover:bg-sidebar-accent"
              data-testid="button-user-menu"
            >
              <Avatar className="w-7 h-7">
                <AvatarImage src={user?.profileImageUrl || undefined} />
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start text-left flex-1 min-w-0">
                <span className="text-sm font-medium truncate w-full">
                  {user?.firstName} {user?.lastName}
                </span>
                <span className="text-xs text-muted-foreground truncate w-full">
                  {user?.email}
                </span>
              </div>
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuItem
              data-testid="button-account-security"
              onClick={() => setLocation("/account-security")}
            >
              <ShieldCheck className="w-4 h-4 mr-2" />
              Account Security
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid="button-logout"
              onClick={() => logout()}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
