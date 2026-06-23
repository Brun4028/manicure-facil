import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import {
  Users, CalendarDays, Wallet, TrendingUp, CheckCircle2, Clock, Cake,
} from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell } from "recharts";
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Menu Geral — Manicure Fácil" }] }),
  component: Dashboard,
});

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Dashboard() {
  const { user } = useAuth();
  const nome = user?.user_metadata?.nome || user?.user_metadata?.full_name || user?.user_metadata?.name || "";

  // Determine greeting based on time of day
  const hour = new Date().getHours();
  let greeting: string;
  let greetingSubtitle: string;
  if (hour < 12) {
    greeting = "Bom dia";
    greetingSubtitle = "Bem-vinda ao Manicure Fácil.";
  } else if (hour < 18) {
    greeting = "Boa tarde";
    greetingSubtitle = "Tenha um excelente dia de trabalho.";
  } else {
    greeting = "Boa noite";
    greetingSubtitle = "Acompanhe seus resultados e agendamentos.";
  }

  const q = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [clientes, agendamentos] = await Promise.all([
        supabase.from("clientes").select("id, nome, data_nascimento"),
        supabase.from("agendamentos").select("id, data_hora, valor, custo, status").order("data_hora", { ascending: false }),
      ]);
      if (clientes.error) throw clientes.error;
      if (agendamentos.error) throw agendamentos.error;
      return { clientes: clientes.data ?? [], agendamentos: agendamentos.data ?? [] };
    },
  });

  if (q.isLoading) {
    return (
      <>
        <PageHeader title="Menu Geral" subtitle="Visão geral do seu negócio" />
        <div className="grid md:grid-cols-4 gap-4">
          {[1,2,3,4].map((i) => <Skeleton key={i} className="h-32 rounded-2xl bg-muted" />)}
        </div>
      </>
    );
  }

  const ags = q.data?.agendamentos ?? [];
  const clientes = q.data?.clientes ?? [];
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);

  const concl = ags.filter(a => a.status === "concluido");
  const pend = ags.filter(a => a.status === "agendado" || a.status === "confirmado");

  const faturamento = concl.reduce((s, a) => s + Number(a.valor), 0);
  const lucroTotal = concl.reduce((s, a) => s + (Number(a.valor) - Number(a.custo)), 0);
  const lucroMes = concl.filter(a => { const d = new Date(a.data_hora); return d >= monthStart && d <= monthEnd; }).reduce((s, a) => s + (Number(a.valor) - Number(a.custo)), 0);
  const lucroDia = concl.filter(a => { const d = new Date(a.data_hora); return d >= dayStart && d <= dayEnd; }).reduce((s, a) => s + (Number(a.valor) - Number(a.custo)), 0);

  // last 14 days chart
  const days = Array.from({ length: 14 }, (_, i) => subDays(now, 13 - i));
  const chartData = days.map((d) => {
    const dStart = startOfDay(d), dEnd = endOfDay(d);
    const fat = ags.filter(a => a.status === "concluido" && new Date(a.data_hora) >= dStart && new Date(a.data_hora) <= dEnd).reduce((s, a) => s + Number(a.valor), 0);
    return { dia: format(d, "dd/MM"), faturamento: Number(fat.toFixed(2)) };
  });

  // birthdays this month (compare only month, ignore year)
  const aniversariantes = clientes.filter(c => {
    if (!c.data_nascimento) return false;
    const birth = new Date(c.data_nascimento + "T00:00:00");
    return !isNaN(birth.getTime()) && birth.getMonth() === now.getMonth();
  });

  const stats = [
    { icon: Users, label: "Clientes", value: clientes.length.toString() },
    { icon: CalendarDays, label: "Agendamentos", value: ags.length.toString() },
    { icon: Wallet, label: "Faturamento total", value: brl(faturamento) },
    { icon: TrendingUp, label: "Lucro total", value: brl(lucroTotal) },
    { icon: TrendingUp, label: "Lucro do mês", value: brl(lucroMes) },
    { icon: TrendingUp, label: "Lucro do dia", value: brl(lucroDia) },
    { icon: CheckCircle2, label: "Concluídos", value: concl.length.toString() },
    { icon: Clock, label: "Pendentes", value: pend.length.toString() },
  ];

  return (
    <>
      <PageHeader title="Menu Geral" subtitle={format(now, "EEEE, dd 'de' MMMM", { locale: ptBR })} />

      {/* Welcome greeting */}
      {nome && (
        <div className="mb-10 animate-fade-up">
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
              {greeting}, {nome}
            </h2>
            <span className="text-2xl md:text-3xl">✨</span>
          </div>
          <p className="text-muted-foreground mt-1.5 text-base">{greetingSubtitle}</p>
          {(pend.length > 0 || aniversariantes.length > 0) && (
            <p className="text-sm text-muted-foreground/70 mt-3">
              {pend.length > 0 && aniversariantes.length > 0
                ? `Você possui ${pend.length} agendamento${pend.length > 1 ? 's' : ''} pendente${pend.length > 1 ? 's' : ''} e ${aniversariantes.length} aniversariante${aniversariantes.length > 1 ? 's' : ''} neste mês.`
                : pend.length > 0
                  ? `Você possui ${pend.length} agendamento${pend.length > 1 ? 's' : ''} pendente${pend.length > 1 ? 's' : ''}.`
                  : `Você possui ${aniversariantes.length} aniversariante${aniversariantes.length > 1 ? 's' : ''} neste mês.`
              }
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="group bg-card border border-border p-5 rounded-[20px] shadow-card hover:border-[#D946EF]/30 transition-all duration-300 relative">
            <div className="space-y-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">{s.label}</p>
              <p className="text-[28px] font-semibold tracking-tight text-card-foreground">{s.value}</p>
            </div>
            <div className="absolute top-4 right-4 size-10 rounded-xl bg-[#D946EF]/10 border border-[#D946EF]/20 grid place-items-center group-hover:bg-[#D946EF]/20 transition-all duration-300">
              <s.icon className="size-[18px] text-[#D946EF]" />
            </div>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-6 mt-8">
        <Card className="bg-card border border-border p-6 rounded-[20px] md:col-span-2 shadow-card">
          <h3 className="text-base font-semibold text-card-foreground mb-6">Faturamento — últimos 14 dias</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#D946EF" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#D946EF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ 
                    background: "var(--card)", 
                    border: "1px solid var(--border)", 
                    borderRadius: 16,
                    boxShadow: "var(--shadow-card)",
                    padding: "12px 16px"
                  }} 
                  formatter={(v) => brl(Number(v))} 
                />
                <Area 
                  type="monotone" 
                  dataKey="faturamento" 
                  stroke="#D946EF" 
                  strokeWidth={2} 
                  fill="url(#g1)" 
                  dot={false}
                  activeDot={{ r: 4, fill: "#D946EF", strokeWidth: 2, stroke: "var(--card)" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="bg-card border border-border p-6 rounded-[20px] shadow-card">
          <h3 className="text-base font-semibold text-card-foreground mb-2">Aniversariantes</h3>
          <p className="text-xs text-muted-foreground mb-4">Clientes que fazem aniversário neste mês</p>
          {aniversariantes.length === 0 ? (
            <p className="text-sm text-[#A1A1AA] py-8 text-center">Nenhum aniversariante este mês</p>
          ) : (
            <ul className="space-y-2">
              {aniversariantes.map(c => (
                <li key={c.id} className="flex items-center justify-between p-2.5 rounded-xl bg-muted border border-border">
                  <span className="text-sm font-medium text-card-foreground">{c.nome}</span>
                  <span className="text-xs text-muted-foreground bg-card px-2.5 py-1 rounded-lg">
                    🎂 {format(new Date(c.data_nascimento! + "T00:00:00"), "dd/MM")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="bg-card border border-border p-6 rounded-[20px] mt-8 shadow-card">
        <h3 className="text-base font-semibold text-card-foreground mb-6">Status de agendamentos</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[
              { s: "Agendado", n: ags.filter(a => a.status === "agendado").length },
              { s: "Confirmado", n: ags.filter(a => a.status === "confirmado").length },
              { s: "Concluído", n: ags.filter(a => a.status === "concluido").length },
              { s: "Cancelado", n: ags.filter(a => a.status === "cancelado").length },
            ]}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="s" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
              <Tooltip 
                contentStyle={{ 
                  background: "var(--card)", 
                  border: "1px solid var(--border)", 
                  borderRadius: 16,
                  boxShadow: "var(--shadow-card)",
                  padding: "12px 16px"
                }} 
              />
              <Bar dataKey="n" radius={[8, 8, 0, 0]} maxBarSize={50}>
                {["#D946EF", "#A855F7", "#22C55E", "#EF4444"].map((color, i) => (
                  <Cell key={`cell-${i}`} fill={color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </>
  );
}
