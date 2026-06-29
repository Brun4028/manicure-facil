import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useState, useEffect } from "react";
import {
  LayoutDashboard, Users, CalendarDays, Scissors, Wallet,
  Moon, Sun, LogOut, Plus, Sparkles, Menu, X,
  Package, Percent, Image as ImageIcon, FileSpreadsheet, Link as LinkIcon,
  ChevronLeft, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetClose } from "@/components/ui/sheet";
import { ProfileDialog } from "@/components/profile/profile-dialog";

const nav = [
  { to: "/dashboard", label: "Menu Geral", icon: LayoutDashboard },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/agendamentos", label: "Agendamentos", icon: CalendarDays },
  { to: "/servicos", label: "Serviços", icon: Scissors },
  { to: "/financeiro", label: "Financeiro", icon: Wallet },
  { to: "/estoque", label: "Estoque & Vendas", icon: Package },
  { to: "/marketing", label: "Marketing", icon: Percent },
  { to: "/portfolio", label: "Galeria & Feedbacks", icon: ImageIcon },
  { to: "/relatorios", label: "Relatórios & Backup", icon: FileSpreadsheet },
] as const;

const labels: Record<string, string> = {
  dashboard: "Menu Geral", clientes: "Clientes", agendamentos: "Agendamentos",
  servicos: "Serviços", financeiro: "Financeiro", estoque: "Estoque & Vendas",
  marketing: "Marketing", portfolio: "Galeria & Feedbacks", relatorios: "Relatórios & Backup",
};

function SidebarNavItem({
  item,
  pathname,
  collapsed,
}: {
  item: (typeof nav)[number];
  pathname: string;
  collapsed: boolean;
}) {
  const active = pathname.startsWith(item.to);
  const link = (
    <Link
      to={item.to}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 whitespace-nowrap ${
        active
          ? "bg-gradient-to-r from-[#D946EF] to-[#A855F7] text-white shadow-[0_4px_24px_rgba(217,70,239,0.15)]"
          : "text-[#A1A1AA] hover:text-white hover:bg-[#1F2128]"
      } ${collapsed ? "justify-center px-2" : ""}`}
    >
      <item.icon className={`size-[18px] shrink-0 ${active ? "text-white" : "text-[#A1A1AA] group-hover:text-white"}`} />
      {!collapsed && item.label}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={12} className="bg-[#171923] text-white border border-[#252836]">
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return link;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const { signOut, user } = useAuth();
  const isMobile = useIsMobile();
  const segments = pathname.split("/").filter(Boolean);

  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <TooltipProvider delayDuration={0}>
      <div className="min-h-screen flex w-full">
        {/* ── Desktop Sidebar ── */}
        <aside
          className={`hidden md:flex flex-col bg-[#111118]/90 backdrop-blur-xl border-r border-[#252836] sticky top-0 h-screen transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden ${
            desktopCollapsed ? "w-[68px]" : "w-64"
          }`}
        >
          {/* Logo */}
          <div className={`flex items-center gap-3 px-5 py-6 ${desktopCollapsed ? "justify-center px-0" : ""}`}>
            <div className="size-9 min-w-9 rounded-xl bg-gradient-to-br from-[#D946EF] to-[#A855F7] grid place-items-center shadow-[0_4px_24px_rgba(217,70,239,0.15)]">
              <Sparkles className="size-[18px] text-white" />
            </div>
            <div
              className={`overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                desktopCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
              }`}
            >
              <div className="text-sm font-semibold leading-none whitespace-nowrap text-white">Manicure Fácil</div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="px-3 flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden">
            {nav.map((n) => (
              <SidebarNavItem key={n.to} item={n} pathname={pathname} collapsed={desktopCollapsed} />
            ))}
          </nav>

          {/* Bottom area */}
          <div className={`border-t border-[#252836] space-y-2 p-4 ${desktopCollapsed ? "px-2.5" : ""}`}>
            {user && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size={desktopCollapsed ? "icon" : "sm"}
                    className={`glass border-0 hover:bg-accent/40 text-[10px] text-muted-foreground truncate ${
                      desktopCollapsed ? "w-full aspect-square" : "w-full justify-start"
                    }`}
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/agendar/${user.id}`);
                      toast.success("Link de agendamento copiado com sucesso!");
                    }}
                  >
                    <LinkIcon className={`shrink-0 text-primary ${desktopCollapsed ? "size-4" : "size-3.5 mr-2"}`} />
                    {!desktopCollapsed && "Copiar Link Público"}
                  </Button>
                </TooltipTrigger>
                {desktopCollapsed && (
                  <TooltipContent side="right" sideOffset={12}>
                    Copiar Link Público
                  </TooltipContent>
                )}
              </Tooltip>
            )}
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className={`text-left w-full text-[10px] text-muted-foreground hover:text-foreground truncate transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden hover:underline underline-offset-2 ${
                desktopCollapsed ? "max-h-0 opacity-0" : "max-h-8 opacity-100"
              }`}
            >
              {user?.email}
            </button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size={desktopCollapsed ? "icon" : "sm"}
                  className={`${
                    desktopCollapsed ? "w-full aspect-square" : "w-full justify-start"
                  } text-sidebar-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent`}
                  onClick={() => setProfileOpen(true)}
                >
                  <User className={`shrink-0 ${desktopCollapsed ? "size-4" : "size-4 mr-2"}`} />
                  {!desktopCollapsed && "Meu Perfil"}
                </Button>
              </TooltipTrigger>
              {desktopCollapsed && (
                <TooltipContent side="right" sideOffset={12}>
                  Meu Perfil
                </TooltipContent>
              )}
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size={desktopCollapsed ? "icon" : "sm"}
                  className={`${
                    desktopCollapsed ? "w-full aspect-square" : "w-full justify-start"
                  } text-sidebar-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent`}
                  onClick={async () => {
                    await signOut();
                    toast.success("Sessão encerrada");
                    navigate({ to: "/auth" });
                  }}
                >
                  <LogOut className={`shrink-0 ${desktopCollapsed ? "size-4" : "size-4 mr-2"}`} />
                  {!desktopCollapsed && "Sair"}
                </Button>
              </TooltipTrigger>
              {desktopCollapsed && (
                <TooltipContent side="right" sideOffset={12}>
                  Sair
                </TooltipContent>
              )}
            </Tooltip>
          </div>

          {/* Collapse toggle */}
          <button
            onClick={() => setDesktopCollapsed(!desktopCollapsed)}
            className="flex items-center justify-center p-2.5 border-t border-[#252836] text-[#A1A1AA]/40 hover:text-[#A1A1AA] hover:bg-[#1F2128] transition-colors text-xs"
            aria-label={desktopCollapsed ? "Expandir menu" : "Recolher menu"}
          >
            <ChevronLeft
              className={`size-3.5 transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                desktopCollapsed ? "rotate-180" : ""
              }`}
            />
          </button>
        </aside>

        {/* ── Mobile Sidebar (Sheet) ── */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="p-0 w-[280px] sm:w-[320px]">
            <div className="flex flex-col h-full bg-[#111118]/95 backdrop-blur-xl">
              {/* Header */}
              <div className="px-6 py-6 flex items-center justify-between border-b border-[#252836]">
                <div className="flex items-center gap-2">
                  <div className="size-9 rounded-xl bg-gradient-to-br from-[#D946EF] to-[#A855F7] grid place-items-center shadow-[0_4px_24px_rgba(217,70,239,0.15)]">
                    <Sparkles className="size-5 text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white leading-none">Manicure Fácil</div>
                  </div>
                </div>
                <SheetClose asChild>
                  <Button variant="ghost" size="icon" className="-mr-2 text-[#A1A1AA]/60 hover:text-[#A1A1AA]">
                    <X className="size-5" />
                  </Button>
                </SheetClose>
              </div>

              {/* Nav links */}
              <nav className="px-3 py-4 flex-1 space-y-1 overflow-y-auto">
                {nav.map((n) => {
                  const active = pathname.startsWith(n.to);
                  return (
                    <SheetClose asChild key={n.to}>
                      <Link
                        to={n.to}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                          active
                            ? "bg-gradient-to-r from-[#D946EF] to-[#A855F7] text-white shadow-[0_4px_24px_rgba(217,70,239,0.15)]"
                            : "text-[#A1A1AA] hover:text-white hover:bg-[#1F2128]"
                        }`}
                      >
                        <n.icon className="size-[18px] shrink-0" />
                        {n.label}
                      </Link>
                    </SheetClose>
                  );
                })}
              </nav>

              {/* Bottom */}
              <div className="p-4 border-t border-[#252836] space-y-2">
                {user && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start bg-[#1F2128] border border-[#252836] text-[#A1A1AA] hover:bg-[#D946EF]/10 hover:border-[#D946EF]/30 text-[10px] truncate transition-all"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/agendar/${user.id}`);
                      toast.success("Link de agendamento copiado com sucesso!");
                    }}
                  >
                    <LinkIcon className="size-3.5 mr-2 shrink-0 text-[#D946EF]" />
                    Copiar Link Público
                  </Button>
                )}
                <div className="text-[10px] text-[#A1A1AA] truncate">{user?.email}</div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-[#A1A1AA] hover:text-white hover:bg-[#1F2128]"
                  onClick={() => { setMobileOpen(false); setProfileOpen(true); }}
                >
                  <User className="size-4 mr-2" />
                  Meu Perfil
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-[#A1A1AA] hover:text-white hover:bg-[#1F2128]"
                  onClick={async () => {
                    await signOut();
                    toast.success("Sessão encerrada");
                    navigate({ to: "/auth" });
                  }}
                >
                  <LogOut className="size-4 mr-2" />
                  Sair
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* ── Main Content Area ── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <header className="sticky top-0 z-30 glass border-b border-border/60">
            <div className="flex items-center gap-2 px-4 md:px-6 h-16">
              {/* Hamburger button — mobile opens sheet, desktop toggles collapse */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (isMobile) setMobileOpen(true);
                  else setDesktopCollapsed(!desktopCollapsed);
                }}
                aria-label="Abrir menu"
                className="shrink-0"
              >
                <Menu className="size-5" />
              </Button>

              {/* Back */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  window.history.length > 1
                    ? window.history.back()
                    : navigate({ to: "/dashboard" })
                }
                aria-label="Voltar"
                className="shrink-0"
              >
                <ChevronLeft className="size-5" />
              </Button>

              {/* Breadcrumbs */}
              <nav className="flex items-center gap-1.5 text-sm text-muted-foreground overflow-x-auto min-w-0">
                <Link
                  to="/dashboard"
                  className="hover:text-foreground whitespace-nowrap shrink-0"
                >
                  Início
                </Link>
                {segments.map((s, i) => (
                  <span key={i} className="flex items-center gap-1.5 min-w-0">
                    <span className="opacity-50 shrink-0">/</span>
                    <span
                      className={`truncate ${
                        i === segments.length - 1 ? "text-foreground font-medium" : ""
                      }`}
                    >
                      {labels[s] ?? s}
                    </span>
                  </span>
                ))}
              </nav>

              {/* Right actions */}
              <div className="ml-auto flex items-center gap-2 shrink-0">
                <Button variant="ghost" size="icon" onClick={toggle} aria-label="Alternar tema">
                  {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
                </Button>
              </div>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 px-4 md:px-8 py-6 md:py-8 max-w-[1400px] w-full mx-auto">
            {children}
          </main>

          {/* FAB - novo agendamento */}
          <button
            onClick={() => navigate({ to: "/agendamentos", search: { new: 1 } as never })}
            className="fixed bottom-6 right-6 z-40 size-14 rounded-full bg-gradient-to-r from-[#D946EF] to-[#A855F7] text-white shadow-[0_4px_24px_rgba(217,70,239,0.15)] grid place-items-center hover:scale-105 active:scale-95 transition-transform"
            aria-label="Novo agendamento"
          >
            <Plus className="size-6" />
          </button>
        </div>
      </div>

      {/* Profile Dialog */}
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </TooltipProvider>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2 mb-8">
      <div className="space-y-1">
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
