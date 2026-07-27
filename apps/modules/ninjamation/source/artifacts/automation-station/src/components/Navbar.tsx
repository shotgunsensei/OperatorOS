import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import { LogOut, User, Sparkles, Shield, Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const API_BASE = import.meta.env.BASE_URL.replace(/\/+$/, "");

type NavLinkItem = { kind: "link"; label: string; path: string };
type NavAnchorItem = { kind: "anchor"; label: string; sectionId: string };
type NavItem = NavLinkItem | NavAnchorItem;

export function Navbar() {
  const [location] = useLocation();
  const { user, isAuthenticated, login, logout, isLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      fetch(`${API_BASE}/api/admin/check`, { credentials: "include" })
        .then(r => r.json())
        .then(d => setIsAdmin(d.isAdmin))
        .catch(() => setIsAdmin(false));
    } else {
      setIsAdmin(false);
    }
  }, [isAuthenticated]);

  const isHome = location === "/";

  const handleSmoothScroll = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const navItems: NavItem[] = [
    { kind: "link", label: "Home", path: "/" },
    ...(isHome ? [
      { kind: "anchor" as const, label: "Features", sectionId: "features" },
      { kind: "anchor" as const, label: "Use Cases", sectionId: "use-cases" },
    ] : []),
    { kind: "link", label: "Pricing", path: "/pricing" },
    ...(isAuthenticated ? [
      { kind: "link" as const, label: "Script Library", path: "/library" },
      { kind: "link" as const, label: "AI Generator", path: "/generate" },
    ] : []),
    ...(isAdmin ? [
      { kind: "link" as const, label: "Admin", path: "/admin" },
    ] : []),
  ];

  function renderNavItem(item: NavItem, isMobile: boolean) {
    if (item.kind === "anchor") {
      return (
        <button
          key={`anchor-${item.sectionId}`}
          onClick={() => {
            handleSmoothScroll(item.sectionId);
            if (isMobile) setMobileOpen(false);
          }}
          className={`${isMobile ? "px-4 py-3 text-left" : "px-4 py-2"} rounded-lg text-sm font-medium transition-colors text-muted-foreground hover:text-foreground hover:bg-white/5`}
        >
          {item.label}
        </button>
      );
    }

    return (
      <Link
        key={item.path}
        href={item.path}
        onClick={isMobile ? () => setMobileOpen(false) : undefined}
        className={`${isMobile ? "px-4 py-3" : "px-4 py-2"} rounded-lg text-sm font-medium transition-colors relative ${
          location === item.path
            ? (isMobile ? "bg-white/5 text-foreground" : "text-foreground")
            : "text-muted-foreground hover:text-foreground hover:bg-white/5"
        }`}
      >
        {item.label === "Admin" && <Shield className="w-4 h-4 inline-block mr-2 text-yellow-400" />}
        {item.label === "AI Generator" && <Sparkles className="w-4 h-4 inline-block mr-2 text-primary" />}
        {item.label}
        {!isMobile && location === item.path && (
          <motion.div
            layoutId="navbar-indicator"
            className="absolute bottom-0 left-0 right-0 h-0.5 bg-ninja-red"
          />
        )}
      </Link>
    );
  }

  return (
    <>
      <motion.header
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        className="fixed top-0 inset-x-0 z-50 glass border-b border-border/50"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <img
              src="/images/ninja-head.png"
              alt="Ninjamation"
              className="w-10 h-10 object-contain drop-shadow-lg group-hover:drop-shadow-[0_0_8px_rgba(220,38,38,0.4)] transition-all duration-300"
            />
            <span className="font-display font-bold text-xl tracking-tight hidden sm:block">
              <span className="text-white">NINJA</span><span className="text-primary">MATION</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map(item => renderNavItem(item, false))}
          </nav>

          <div className="flex items-center gap-3">
            {!isLoading && (
              isAuthenticated ? (
                <div className="flex items-center gap-3">
                  <Link
                    href="/account"
                    className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 transition-colors overflow-hidden"
                  >
                    {user?.profileImageUrl ? (
                      <img src={user.profileImageUrl} alt={user.firstName || "User"} className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-5 h-5 text-muted-foreground" />
                    )}
                  </Link>
                  <button
                    onClick={logout}
                    className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    aria-label="Logout"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={login}
                  className="px-6 py-2.5 rounded-xl font-semibold bg-ninja-red text-white red-glow red-glow-hover transition-all duration-300 hover:-translate-y-0.5"
                >
                  Sign In
                </button>
              )
            )}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-white/5 text-muted-foreground"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </motion.header>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed inset-x-0 top-20 z-40 glass border-b border-border/50 md:hidden"
          >
            <nav className="flex flex-col p-4 gap-1">
              {navItems.map(item => renderNavItem(item, true))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
