import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useLogout, useGetBillingStatus } from "@workspace/api-client-react";
import { BookOpen, Calendar, Settings, Shield, LogOut, Menu, LayoutDashboard, Library } from "lucide-react";
import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, refresh, isLoading } = useAuth();
  const logout = useLogout();
  const { data: billingStatus } = useGetBillingStatus();

  useEffect(() => {
    if (!isLoading && !user) {
      window.location.href = "/login";
    }
  }, [isLoading, user]);

  if (!user) {
    return null;
  }

  const handleLogout = async () => {
    await logout.mutateAsync();
    refresh();
    window.location.href = "/";
  };

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/sets", label: "Study Sets", icon: Library },
    { href: "/exams", label: "Exams", icon: Calendar },
    { href: "/account", label: "Account", icon: Settings },
    ...(user.role === "admin" ? [{ href: "/admin", label: "Admin", icon: Shield }] : []),
  ];

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-card border-r border-border w-64 p-4">
      <div className="flex items-center gap-2 mb-8 px-2">
        <BookOpen className="h-6 w-6 text-primary" />
        <span className="text-xl font-bold">StudyForge</span>
      </div>
      <nav className="flex-1 space-y-2">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent hover:text-accent-foreground text-muted-foreground transition-colors">
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto pt-4 border-t border-border">
        <div className="flex items-center justify-between px-2 mb-4">
          <div className="text-sm font-medium">{user.name}</div>
          <div className="text-xs bg-primary/20 text-primary px-2 py-1 rounded-full uppercase">{user.plan}</div>
        </div>
        <Button variant="ghost" className="w-full justify-start text-muted-foreground" onClick={handleLogout}>
          <LogOut className="h-4 w-4 mr-2" />
          Logout
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile Sidebar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-card border-b border-border flex items-center px-4 z-50">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64">
            <SidebarContent />
          </SheetContent>
        </Sheet>
        <span className="ml-4 font-bold">StudyForge</span>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden md:block h-screen sticky top-0">
        <SidebarContent />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen pt-14 md:pt-0">
        {billingStatus?.demoMode && (
          <div className="bg-primary text-primary-foreground text-center py-2 text-sm">
            Demo Mode Active - Changes may not be saved permanently.
          </div>
        )}
        <main className="flex-1 p-4 md:p-8 max-w-6xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}