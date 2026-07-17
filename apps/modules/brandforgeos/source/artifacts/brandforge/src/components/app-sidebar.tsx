import { Link, useLocation } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import { useTenant } from "@/lib/tenant-context";
import { useListTenants } from "@workspace/api-client-react";
import {
  LayoutDashboard,
  Palette,
  Megaphone,
  PenTool,
  Calendar,
  BarChart3,
  Settings,
  Lightbulb,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Bell,
  Search,
  Zap,
  ChevronsUpDown,
  Moon,
  Sun,
  Workflow,
  Plug,
  Package,
  Shield,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";

const navSections = [
  {
    label: "Main",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/brands", label: "Brand HQ", icon: Palette },
      { href: "/campaigns", label: "Campaigns", icon: Megaphone },
    ],
  },
  {
    label: "Create",
    items: [
      { href: "/copy-studio", label: "Copy Studio", icon: PenTool },
      { href: "/calendar", label: "Calendar", icon: Calendar },
      { href: "/ai-workflows", label: "AI Workflows", icon: Workflow },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/strategy", label: "Strategy", icon: Lightbulb },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/reports", label: "Reports", icon: FileText },
    ],
  },
  {
    label: "Marketplace",
    items: [
      { href: "/templates", label: "Templates", icon: Package },
      { href: "/integrations", label: "Integrations", icon: Plug },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/admin", label: "Admin Console", icon: Shield },
    ],
  },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { logout, user } = useAuth();
  const { tenantId, setTenantId } = useTenant();
  const { data: tenants } = useListTenants({ query: { queryKey: ["tenants"] } });
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("bf-theme");
    if (saved === "light") return false;
    return true;
  });
  const [showSwitcher, setShowSwitcher] = useState(false);

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("bf-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("bf-theme", "light");
    }
  }, [dark]);

  const currentTenant = tenants?.find((t: any) => t.id === tenantId);

  return (
    <aside className={`${collapsed ? "w-[68px]" : "w-64"} border-r bg-sidebar text-sidebar-foreground flex flex-col transition-all duration-200 shrink-0`}>
      <div className="p-3 border-b">
        <div className="flex items-center justify-between">
          {!collapsed ? (
            <Link href="/dashboard" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg gradient-brand flex items-center justify-center text-white font-bold text-sm shadow-sm">B</div>
              <span className="font-bold text-base tracking-tight">BrandForge</span>
            </Link>
          ) : (
            <Link href="/dashboard" className="mx-auto">
              <div className="w-8 h-8 rounded-lg gradient-brand flex items-center justify-center text-white font-bold text-sm shadow-sm">B</div>
            </Link>
          )}
          {!collapsed && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setCollapsed(true)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {!collapsed && tenants && tenants.length > 0 && (
        <div className="px-3 py-2 border-b">
          <button
            onClick={() => setShowSwitcher(!showSwitcher)}
            className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg bg-muted/50 hover:bg-muted text-sm transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                {(currentTenant?.name || "W")[0]}
              </div>
              <span className="font-medium truncate">{currentTenant?.name || "Workspace"}</span>
            </div>
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </button>
          {showSwitcher && tenants.length > 1 && (
            <div className="mt-1 py-1 bg-popover border rounded-lg shadow-lg">
              {tenants.map((t: any) => (
                <button
                  key={t.id}
                  onClick={() => { setTenantId(t.id); setShowSwitcher(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors ${t.id === tenantId ? "bg-accent font-medium" : ""}`}
                >
                  <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">{t.name[0]}</div>
                  <span className="truncate">{t.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <nav className="flex-1 py-2 overflow-y-auto">
        {navSections.map((section) => (
          <div key={section.label} className="mb-1">
            {!collapsed && (
              <div className="px-4 py-1.5 text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider">{section.label}</div>
            )}
            {section.items.map((item) => {
              const isActive = location === item.href || (item.href !== "/dashboard" && location.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 px-3 py-2 mx-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                    isActive
                      ? "bg-primary/10 text-primary shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : ""}`} />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t p-2 space-y-1">
        {!collapsed && (
          <div className="flex items-center gap-1 px-1 mb-1">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setDark(!dark)}>
              {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </Button>
            <Link href="/settings">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <Settings className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        )}
        {collapsed && (
          <Button variant="ghost" size="icon" className="w-full h-8 text-muted-foreground hover:text-foreground" onClick={() => setCollapsed(false)}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        )}
        <button
          onClick={logout}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground w-full transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Log out</span>}
        </button>
      </div>
    </aside>
  );
}
