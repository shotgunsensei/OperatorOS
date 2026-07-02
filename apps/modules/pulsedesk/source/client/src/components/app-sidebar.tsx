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
  LayoutDashboard,
  Ticket,
  PlusCircle,
  Building2,
  Cpu,
  Package,
  Wrench,
  Users2,
  BarChart3,
  Settings,
  LogOut,
  ChevronDown,
  Shield,
  Inbox,
  ExternalLink,
} from "lucide-react";
import pulsedeskLogo from "@assets/pulsedesklogo_1775753913991.png";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { canSubmitIssues, canViewAnalytics, isReadOnly, canManageSettings } from "@/lib/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EcosystemFooter } from "@/components/ecosystem-footer";
import { HelpDrawer } from "@/components/help-drawer";
import { ROLE_LABELS } from "@/lib/permissions";
import { PulseLine } from "@/components/pulse-line";
import { NotificationCenter } from "@/components/notification-center";

const OPERATOROS_COMMAND_CENTER_URL = "https://app.operatoros.net/app";

export function AppSidebar() {
  const [location] = useLocation();
  const { user, org, orgs, membership, logout, switchOrg } = useAuth();
  const role = membership?.role;

  const isActive = (url: string) => {
    if (url === "/") return location === "/";
    return location.startsWith(url);
  };

  const renderNavItem = (item: { title: string; url: string; icon: any }) => (
    <SidebarMenuItem key={item.title}>
      <SidebarMenuButton
        asChild
        data-active={isActive(item.url)}
        className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:shadow-sm data-[active=true]:font-semibold"
      >
        <Link
          href={item.url}
          aria-current={isActive(item.url) ? "page" : undefined}
          data-testid={`nav-${item.title.toLowerCase().replace(/\s/g, "-")}`}
        >
          <item.icon className="h-4 w-4" />
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return (
    <Sidebar>
      <SidebarHeader className="p-4 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg flex items-center justify-center overflow-hidden">
            <img src={pulsedeskLogo} alt="PulseDesk" className="h-8 w-8 object-contain" />
          </div>
          <div className="flex flex-col flex-1">
            <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">PulseDesk</span>
            <span className="text-[10px] text-sidebar-foreground/50 tracking-wide">
              OperatorOS Module
            </span>
          </div>
          <div className="hidden lg:block">
            <NotificationCenter />
          </div>
        </div>
        {org && orgs.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                data-testid="button-org-switcher"
                aria-label="Switch organization"
                className="mt-3 flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/50 px-3 py-2 text-left text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent"
              >
                <Building2 className="h-3.5 w-3.5 text-sidebar-foreground/50" />
                <span className="flex-1 truncate text-xs">{org.name}</span>
                <ChevronDown className="h-3 w-3 text-sidebar-foreground/40" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {orgs.map((o) => (
                <DropdownMenuItem
                  key={o.id}
                  data-testid={`menu-org-${o.id}`}
                  onClick={() => switchOrg(o.id)}
                  className={o.id === org.id ? "bg-accent/10" : ""}
                >
                  <Building2 className="mr-2 h-3.5 w-3.5" />
                  {o.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <a
          href={OPERATOROS_COMMAND_CENTER_URL}
          data-testid="link-return-operatoros"
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/60 px-3 py-2 text-xs font-medium text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent"
        >
          OperatorOS Command Center
          <ExternalLink className="h-3.5 w-3.5 text-sidebar-foreground/50" />
        </a>
      </SidebarHeader>
      <div className="px-4 -mt-1 mb-1">
        <PulseLine variant="divider" width="100%" height={8} color="hsl(var(--accent))" animate={false} className="opacity-25" />
      </div>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Command Center</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {renderNavItem({ title: "Dashboard", url: "/", icon: LayoutDashboard })}
              {(canViewAnalytics(role) || role === "admin") && renderNavItem({ title: "Analytics", url: "/analytics", icon: BarChart3 })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Work Queues</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {renderNavItem({ title: "Tickets", url: "/tickets", icon: Ticket })}
              {canSubmitIssues(role) && renderNavItem({ title: "Report", url: "/submit", icon: PlusCircle })}
              {!isReadOnly(role) && (
                <>
                {renderNavItem({ title: "Supplies", url: "/supply-requests", icon: Package })}
                {renderNavItem({ title: "Facilities", url: "/facility-requests", icon: Wrench })}
                </>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Facility Data</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {renderNavItem({ title: "Departments", url: "/departments", icon: Building2 })}
              {renderNavItem({ title: "Equipment", url: "/assets", icon: Cpu })}
              {renderNavItem({ title: "Vendors", url: "/vendors", icon: Users2 })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Admin Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {canManageSettings(role) && renderNavItem({ title: "Inboxes", url: "/email-settings", icon: Inbox })}
              {!isReadOnly(role) && renderNavItem({ title: "Settings", url: "/settings", icon: Settings })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {user?.isSuperAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>System Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {renderNavItem({ title: "System Admin", url: "/admin", icon: Shield })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="p-4">
        {user && (
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-sidebar-accent text-sidebar-foreground/80 text-xs font-medium">
                {(user.fullName || user.username).slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-sidebar-foreground/90">{user.fullName || user.username}</p>
              <p className="text-[10px] text-sidebar-foreground/45 truncate">
                {org?.name ? `${org.name} · ` : ""}{role ? ROLE_LABELS[role] || role : `@${user.username}`}
              </p>
            </div>
            <button
              data-testid="button-logout"
              onClick={logout}
              className="text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
        <HelpDrawer />
        <EcosystemFooter variant="sidebar" />
      </SidebarFooter>
    </Sidebar>
  );
}
