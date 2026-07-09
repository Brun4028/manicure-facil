import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Sparkles, CalendarDays, Users, Wallet, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import logoIconWhite from "@/assets/logo-icon-white.png";

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
    <div className="min-h-screen relative overflow-hidden bg-[#0F0F14]">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 -left-48 w-[600px] h-[600px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(217,70,239,0.06),transparent)] blur-3xl" />
        <div className="absolute bottom-0 -right-48 w-[500px] h-[500px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(168,85,247,0.04),transparent)] blur-3xl" />
      </div>

      <header className="px-6 md:px-12 py-6 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2">
          <div className="size-9 rounded-xl bg-gradient-to-br from-[#D946EF] to-[#A855F7] grid place-items-center shadow-[0_4px_24px_rgba(217,70,239,0.15)]">
            <img src={logoIconWhite} alt="Manicure Fácil Logo" className="size-5 object-contain" />
          </div>
          <span className="text-xl font-semibold text-white">Manicure Fácil</span>
        </div>
        <Link to="/auth" className="rounded-full bg-gradient-to-r from-[#D946EF] to-[#A855F7] text-white px-6 py-2.5 text-sm font-medium shadow-[0_4px_24px_rgba(217,70,239,0.15)] hover:shadow-[0_8px_32px_rgba(217,70,239,0.25)] transition-all">
          Entrar
        </Link>
      </header>

      <section className="px-6 md:px-12 max-w-6xl mx-auto pt-10 md:pt-24 pb-20 text-center relative z-10">
        <span className="inline-flex items-center gap-2 bg-[#171923]/80 backdrop-blur-xl rounded-full px-5 py-2 text-xs text-[#A1A1AA] border border-[#252836] shadow-sm">
          <span className="size-1.5 rounded-full bg-[#D946EF]" />
          Novo • Sistema SaaS premium
        </span>
        
        <h1 className="text-5xl md:text-7xl mt-8 leading-tight font-semibold tracking-tight text-white">
          Organize sua <span className="bg-gradient-to-r from-[#D946EF] to-[#A855F7] bg-clip-text text-transparent">agenda</span>,<br />
          clientes e <span className="bg-gradient-to-r from-[#D946EF] to-[#A855F7] bg-clip-text text-transparent">finanças</span>
        </h1>
        
        <p className="text-lg md:text-xl text-[#A1A1AA] mt-6 max-w-2xl mx-auto leading-relaxed">
          Tudo em um só lugar. Elegante, simples e feito para você que ama o que faz.
        </p>
        
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link to="/auth" className="rounded-full bg-gradient-to-r from-[#D946EF] to-[#A855F7] text-white px-8 py-3.5 text-base font-medium shadow-[0_4px_24px_rgba(217,70,239,0.15)] hover:shadow-[0_8px_32px_rgba(217,70,239,0.25)] transition-all inline-flex items-center gap-2">
            Começar grátis <span className="text-lg">→</span>
          </Link>
        </div>

        <div className="mt-20 grid md:grid-cols-3 gap-6">
          {[
            { icon: CalendarDays, t: "Agenda inteligente", d: "Visualize seus horários e evite conflitos com nossa agenda visual." },
            { icon: Users, t: "CRM de clientes", d: "Histórico completo, preferências e datas especiais das suas clientes." },
            { icon: Wallet, t: "Financeiro claro", d: "Faturamento, lucro e ticket médio em tempo real para decisões certeiras." },
          ].map((f) => (
            <div key={f.t} className="group bg-[#171923]/80 backdrop-blur-xl rounded-3xl p-8 text-left border border-[#252836] hover:border-[#D946EF]/30 transition-all duration-300 hover:shadow-[0_8px_40px_rgba(217,70,239,0.06)] hover:-translate-y-1">
              <div className="size-12 rounded-2xl bg-[#D946EF]/10 border border-[#D946EF]/20 grid place-items-center mb-5">
                <f.icon className="size-6 text-[#D946EF]" />
              </div>
              <h3 className="text-2xl font-semibold text-white mb-2">{f.t}</h3>
              <p className="text-sm text-[#A1A1AA] leading-relaxed">{f.d}</p>
            </div>
          ))}
        </div>

        <ul className="mt-16 flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-[#A1A1AA]">
          {["Dark mode incluso", "100% responsivo", "Dados seguros", "Sem cartão de crédito"].map((x) => (
            <li key={x} className="inline-flex items-center gap-2">
              <span className="size-5 rounded-full bg-[#D946EF]/20 border border-[#D946EF]/30 grid place-items-center">
                <Check className="size-3 text-[#D946EF]" />
              </span>
              {x}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
