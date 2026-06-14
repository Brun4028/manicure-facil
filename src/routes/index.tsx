import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Sparkles, CalendarDays, Users, Wallet, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Manicure Fácil — Agenda, clientes e finanças em um só lugar" },
      { name: "description", content: "Sistema premium para manicures e pequenos salões. Gerencie sua agenda, clientes, serviços e financeiro." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="px-6 md:px-12 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="size-9 rounded-xl gradient-primary grid place-items-center shadow-glow">
            <Sparkles className="size-5 text-primary-foreground" />
          </div>
          <span className="font-display text-xl">Manicure Fácil</span>
        </div>
        <Link to="/auth" className="rounded-full gradient-primary text-primary-foreground px-5 py-2.5 text-sm font-medium shadow-glow">
          Entrar
        </Link>
      </header>

      <section className="px-6 md:px-12 max-w-6xl mx-auto pt-10 md:pt-20 pb-20 text-center">
        <span className="inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary" /> Novo • Sistema SaaS premium
        </span>
        <h1 className="font-display text-5xl md:text-7xl mt-6 leading-tight">
          Organize sua <span className="text-gradient">agenda</span>,<br />
          clientes e finanças
        </h1>
        <p className="text-lg text-muted-foreground mt-6 max-w-2xl mx-auto">
          Tudo em um só lugar. Elegante, simples e feito para você que ama o que faz.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link to="/auth" className="rounded-full gradient-primary text-primary-foreground px-7 py-3 text-sm font-medium shadow-glow">
            Começar grátis
          </Link>
        </div>

        <div className="mt-16 grid md:grid-cols-3 gap-4">
          {[
            { icon: CalendarDays, t: "Agenda inteligente", d: "Visualize seus horários e evite conflitos." },
            { icon: Users, t: "CRM de clientes", d: "Histórico, preferências e datas especiais." },
            { icon: Wallet, t: "Financeiro claro", d: "Faturamento, lucro e ticket médio em tempo real." },
          ].map((f) => (
            <div key={f.t} className="glass rounded-3xl p-6 text-left">
              <div className="size-10 rounded-xl gradient-primary grid place-items-center mb-4">
                <f.icon className="size-5 text-primary-foreground" />
              </div>
              <h3 className="font-display text-xl">{f.t}</h3>
              <p className="text-sm text-muted-foreground mt-1">{f.d}</p>
            </div>
          ))}
        </div>

        <ul className="mt-12 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          {["Dark mode", "100% responsivo", "Dados seguros", "Sem cartão"].map((x) => (
            <li key={x} className="inline-flex items-center gap-1.5"><Check className="size-4 text-primary" />{x}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
