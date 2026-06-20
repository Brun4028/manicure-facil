import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { type ReactNode } from "react";
import {
  LayoutDashboard, Users, CalendarDays, Scissors, Wallet,
  Moon, Sun, LogOut, ChevronLeft, Plus, Sparkles,
  Package, Percent, Image as ImageIcon, FileSpreadsheet, Link as LinkIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
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
  dashboard: "Dashboard", clientes: "Clientes", agendamentos: "Agendamentos",
  servicos: "Serviços", financeiro: "Financeiro", estoque: "Estoque & Vendas",
  marketing: "Marketing", portfolio: "Galeria & Feedbacks", relatorios: "Relatórios & Backup",
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const { signOut, user } = useAuth();
  const segments = pathname.split("/").filter(Boolean);

  return (
    <div className="min-h-screen flex w-full">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 flex-col glass border-r border-sidebar-border/60 sticky top-0 h-screen">
        <div className="px-6 py-6 flex items-center gap-2">
          <div className="size-9 rounded-xl gradient-primary grid place-items-center shadow-glow">
            <Sparkles className="size-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-display text-lg leading-none">Manicure Fácil</div>
            <div className="text-[10px] text-muted-foreground mt-1">Premium SaaS</div>
          </div>
        </div>
        <nav className="px-3 flex-1 space-y-1">
          {nav.map((n) => {
            const active = pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
                  active
                    ? "gradient-primary text-primary-foreground shadow-glow"
                    : "text-sidebar-foreground hover:bg-sidebar-accent"
                }`}
              >
                <n.icon className="size-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-sidebar-border/60 space-y-2">
          {user && (
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start glass border-0 hover:bg-accent/40 text-[10px] text-muted-foreground truncate"
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/agendar/${user.id}`);
                toast.success("Link de agendamento copiado com sucesso!");
              }}
            >
              <LinkIcon className="size-3.5 mr-2 shrink-0 text-primary" /> Copiar Link Público
            </Button>
          )}
          <div className="text-[10px] text-muted-foreground truncate">{user?.email}</div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={async () => { await signOut(); toast.success("Sessão encerrada"); navigate({ to: "/auth" }); }}
          >
            <LogOut className="size-4 mr-2" /> Sair
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 glass border-b border-border/60">
          <div className="flex items-center gap-3 px-4 md:px-8 h-16">
            <Button
              variant="ghost" size="icon"
              onClick={() => window.history.length > 1 ? window.history.back() : navigate({ to: "/dashboard" })}
              aria-label="Voltar"
            >
              <ChevronLeft className="size-5" />
            </Button>
            <nav className="flex items-center gap-1.5 text-sm text-muted-foreground overflow-x-auto">
              <Link to="/dashboard" className="hover:text-foreground">Início</Link>
              {segments.map((s, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <span className="opacity-50">/</span>
                  <span className={i === segments.length - 1 ? "text-foreground font-medium" : ""}>
                    {labels[s] ?? s}
                  </span>
                </span>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={toggle} aria-label="Alternar tema">
                {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 md:px-8 py-6 md:py-8 max-w-[1400px] w-full mx-auto">
          {children}
        </main>

        {/* FAB - novo agendamento */}
        <button
          onClick={() => navigate({ to: "/agendamentos", search: { new: 1 } as never })}
          className="fixed bottom-6 right-6 z-40 size-14 rounded-full gradient-primary text-primary-foreground shadow-glow grid place-items-center hover:scale-105 transition-transform"
          aria-label="Novo agendamento"
        >
          <Plus className="size-6" />
        </button>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-6">
      <div>
        <h1 className="font-display text-3xl md:text-4xl">{title}</h1>
        {subtitle && <p className="text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
