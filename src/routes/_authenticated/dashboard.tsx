import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, CalendarDays, Wallet, TrendingUp, CheckCircle2, Clock, Cake,
} from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from "recharts";
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay, subDays, isSameMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Menu Geral — Manicure Fácil" }] }),
  component: Dashboard,
});

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Dashboard() {
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
          {[1,2,3,4].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
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

  // birthdays this month
  const aniversariantes = clientes.filter(c => c.data_nascimento && isSameMonth(new Date(c.data_nascimento + "T00:00:00"), now));

  const stats = [
    { icon: Users, label: "Clientes", value: clientes.length.toString(), color: "from-pink-400 to-rose-500" },
    { icon: CalendarDays, label: "Agendamentos", value: ags.length.toString(), color: "from-amber-400 to-rose-400" },
    { icon: Wallet, label: "Faturamento total", value: brl(faturamento) },
    { icon: TrendingUp, label: "Lucro total", value: brl(lucroTotal) },
    { icon: TrendingUp, label: "Lucro do mês", value: brl(lucroMes) },
    { icon: TrendingUp, label: "Lucro do dia", value: brl(lucroDia) },
    { icon: CheckCircle2, label: "Concluídos", value: concl.length.toString() },
    { icon: Clock, label: "Pendentes", value: pend.length.toString() },
  ];

  return (
    <>
      <PageHeader title="Menu Geral" subtitle={`Olá! Hoje é ${format(now, "EEEE, dd 'de' MMMM", { locale: ptBR })}`} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="glass border-0 p-4 rounded-2xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
                <p className="font-display text-2xl mt-1.5">{s.value}</p>
              </div>
              <div className="size-9 rounded-xl gradient-primary grid place-items-center shadow-glow">
                <s.icon className="size-4 text-primary-foreground" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-4 mt-6">
        <Card className="glass border-0 rounded-2xl p-5 md:col-span-2">
          <h3 className="font-display text-lg mb-4">Faturamento — últimos 14 dias</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }} />
                <YAxis tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12 }} formatter={(v) => brl(Number(v))} />
                <Area type="monotone" dataKey="faturamento" stroke="var(--color-primary)" strokeWidth={2} fill="url(#g1)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="glass border-0 rounded-2xl p-5">
          <h3 className="font-display text-lg mb-2 flex items-center gap-2"><Cake className="size-5 text-primary" /> Aniversariantes</h3>
          <p className="text-xs text-muted-foreground mb-3">Clientes que fazem aniversário neste mês</p>
          {aniversariantes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhum aniversariante este mês</p>
          ) : (
            <ul className="space-y-2">
              {aniversariantes.map(c => (
                <li key={c.id} className="flex items-center justify-between p-2 rounded-xl bg-accent/40">
                  <span className="text-sm font-medium">{c.nome}</span>
                  <span className="text-xs text-muted-foreground">{format(new Date(c.data_nascimento! + "T00:00:00"), "dd/MM")}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="glass border-0 rounded-2xl p-5 mt-6">
        <h3 className="font-display text-lg mb-4">Status de agendamentos</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[
              { s: "Agendado", n: ags.filter(a => a.status === "agendado").length },
              { s: "Confirmado", n: ags.filter(a => a.status === "confirmado").length },
              { s: "Concluído", n: ags.filter(a => a.status === "concluido").length },
              { s: "Cancelado", n: ags.filter(a => a.status === "cancelado").length },
            ]}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="s" tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }} />
              <YAxis tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }} />
              <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12 }} />
              <Bar dataKey="n" fill="var(--color-primary)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </>
  );
}
