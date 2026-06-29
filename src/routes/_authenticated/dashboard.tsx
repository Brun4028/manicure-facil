import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import {
  Users, CalendarDays, Wallet, TrendingUp, CheckCircle2, Clock, Cake,
  Sparkles, AlertTriangle, Target, ArrowUp, ArrowDown, RotateCcw,
} from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell } from "recharts";
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay, subDays, subMonths, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Menu Geral — Manicure Fácil" }] }),
  component: Dashboard,
});

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/* ───── F1: Smart Assistant ───── */
function SmartAssistant() {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const prevMonthStart = startOfMonth(subMonths(now, 1));
  const prevMonthEnd = endOfMonth(subMonths(now, 1));

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-smart-assistant"],
    queryFn: async () => {
      const [agendamentosR, clientesR, produtosR, metasR, servicosR] = await Promise.all([
        supabase.from("agendamentos").select("id, data_hora, valor, custo, status, servico_id").order("data_hora", { ascending: true }),
        supabase.from("clientes").select("id, nome, data_nascimento"),
        supabase.from("produtos").select("id, nome, quantidade, quantidade_minima"),
        supabase.from("metas_mensais").select("*").eq("mes_ano", format(now, "yyyy-MM")).maybeSingle(),
        supabase.from("servicos").select("id, nome"),
      ]);
      return {
        agendamentos: agendamentosR.data ?? [],
        clientes: clientesR.data ?? [],
        produtos: produtosR.data ?? [],
        meta: metasR.data ?? null,
        servicos: servicosR.data ?? [],
      };
    },
  });

  if (isLoading || !data) return null;

  const ags = data.agendamentos;
  const clientes = data.clientes;
  const produtos = data.produtos;
  const meta = data.meta;
  const servicos = data.servicos;

  // Today's appointments
  const hojeAgs = ags.filter((a) => {
    const d = new Date(a.data_hora);
    return d >= todayStart && d <= todayEnd && a.status !== "cancelado";
  });

  // Next upcoming appointments
  const proximos = ags
    .filter((a) => {
      const d = new Date(a.data_hora);
      return d >= now && a.status !== "cancelado";
    })
    .slice(0, 3);

  // This month concluded
  const conclMes = ags.filter((a) => {
    const d = new Date(a.data_hora);
    return d >= monthStart && d <= monthEnd && a.status === "concluido";
  });
  const faturamentoMes = conclMes.reduce((s, a) => s + Number(a.valor), 0);

  // Previous month concluded
  const conclPrev = ags.filter((a) => {
    const d = new Date(a.data_hora);
    return d >= prevMonthStart && d <= prevMonthEnd && a.status === "concluido";
  });
  const faturamentoPrev = conclPrev.reduce((s, a) => s + Number(a.valor), 0);

  // Growth
  const growth = faturamentoPrev > 0 ? ((faturamentoMes - faturamentoPrev) / faturamentoPrev) * 100 : 0;

  // Meta remaining
  const metaVal = Number(meta?.faturamento_alvo ?? 0);
  const faltaMeta = metaVal > 0 ? Math.max(0, metaVal - faturamentoMes) : 0;

  // Low stock products
  const estoqueBaixo = produtos.filter((p) => p.quantidade <= p.quantidade_minima);

  // Most sold services this month
  const servicoCount: Record<string, number> = {};
  conclMes.forEach((a) => {
    if (a.servico_id) {
      servicoCount[a.servico_id] = (servicoCount[a.servico_id] ?? 0) + 1;
    }
  });
  const servicoRank = Object.entries(servicoCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([id, count]) => ({
      nome: servicos.find((s) => s.id === id)?.nome ?? "Avulso",
      count,
    }));

  // Birthday clients this month
  const aniversariantes = clientes.filter((c) => {
    if (!c.data_nascimento) return false;
    const birth = new Date(c.data_nascimento + "T00:00:00");
    return !isNaN(birth.getTime()) && birth.getMonth() === now.getMonth();
  });

  return (
    <Card className="bg-gradient-to-br from-[#D946EF]/5 via-[#A855F7]/5 to-transparent border border-[#D946EF]/10 rounded-[20px] p-6 shadow-card mb-8">
      <div className="flex items-start gap-3 mb-5">
        <div className="size-10 rounded-xl bg-gradient-to-br from-[#D946EF] to-[#A855F7] grid place-items-center shadow-[0_4px_24px_rgba(217,70,239,0.15)] shrink-0">
          <Sparkles className="size-5 text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-lg text-card-foreground">Resumo Inteligente</h3>
          <p className="text-xs text-muted-foreground">Informações rápidas do seu negócio</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Today's appointments */}
        <div className="bg-card/60 backdrop-blur-sm border border-border/60 rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <CalendarDays className="size-3.5 text-[#D946EF]" />
            Atendimentos hoje
          </div>
          <p className="text-2xl font-bold text-card-foreground">{hojeAgs.length}</p>
          {proximos.length > 0 && (
            <div className="mt-2 space-y-1">
              {proximos.slice(0, 2).map((a: any) => (
                <p key={a.id} className="text-[10px] text-muted-foreground truncate">
                  {format(new Date(a.data_hora), "HH:mm")} — {a.servico_id ? "Agendado" : "Serviço"}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Growth vs last month */}
        <div className="bg-card/60 backdrop-blur-sm border border-border/60 rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <TrendingUp className="size-3.5 text-emerald-500" />
            Crescimento vs mês anterior
          </div>
          <div className="flex items-center gap-2">
            <p className={`text-2xl font-bold ${growth >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {growth >= 0 ? "+" : ""}{growth.toFixed(1)}%
            </p>
            {growth >= 0 ? <ArrowUp className="size-5 text-emerald-500" /> : <ArrowDown className="size-5 text-red-500" />}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Faturamento: {brl(faturamentoMes)} este mês
          </p>
        </div>

        {/* Meta remaining */}
        <div className="bg-card/60 backdrop-blur-sm border border-border/60 rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <Target className="size-3.5 text-amber-500" />
            Meta mensal
          </div>
          {metaVal > 0 ? (
            <>
              <p className="text-2xl font-bold text-card-foreground">
                {faltaMeta > 0 ? `Faltam ${brl(faltaMeta)}` : "Meta atingida! 🎉"}
              </p>
              <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#D946EF] to-[#A855F7] rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (faturamentoMes / metaVal) * 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {((faturamentoMes / metaVal) * 100).toFixed(0)}% de {brl(metaVal)}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Configure metas em Relatórios</p>
          )}
        </div>

        {/* Low stock */}
        {estoqueBaixo.length > 0 && (
          <div className="bg-card/60 backdrop-blur-sm border border-red-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <AlertTriangle className="size-3.5 text-red-500" />
              Estoque crítico
            </div>
            <p className="text-2xl font-bold text-red-500">{estoqueBaixo.length} produto{estoqueBaixo.length > 1 ? "s" : ""}</p>
            <div className="mt-2 space-y-1">
              {estoqueBaixo.slice(0, 3).map((p: any) => (
                <p key={p.id} className="text-[10px] text-muted-foreground truncate">
                  {p.nome} — {p.quantidade} un
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Top services */}
        {servicoRank.length > 0 && (
          <div className="bg-card/60 backdrop-blur-sm border border-border/60 rounded-xl p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <TrendingUp className="size-3.5 text-[#A855F7]" />
              Serviços mais vendidos
            </div>
            <div className="space-y-1.5 mt-1">
              {servicoRank.map((s, i) => (
                <div key={s.nome} className="flex items-center justify-between text-xs">
                  <span className="text-card-foreground font-medium truncate mr-2">
                    {i + 1}. {s.nome}
                  </span>
                  <Badge variant="secondary" className="text-[10px] shrink-0">{s.count}x</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Birthday clients */}
        {aniversariantes.length > 0 && (
          <div className="bg-card/60 backdrop-blur-sm border border-border/60 rounded-xl p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <Cake className="size-3.5 text-pink-500" />
              Aniversariantes do mês
            </div>
            <p className="text-2xl font-bold text-card-foreground">{aniversariantes.length}</p>
            <div className="mt-2 space-y-1">
              {aniversariantes.slice(0, 3).map((c: any) => (
                <p key={c.id} className="text-[10px] text-muted-foreground truncate">
                  🎂 {c.nome}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ───── F2: Return Reminder ───── */
function ReturnReminder() {
  const now = new Date();
  const todayStart = startOfDay(now);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-return-reminder"],
    queryFn: async () => {
      const [clientesR, agendamentosR, servicosR] = await Promise.all([
        supabase.from("clientes").select("id, nome, telefone"),
        supabase.from("agendamentos").select("id, cliente_id, servico_id, data_hora, status").eq("status", "concluido").order("data_hora", { ascending: false }),
        supabase.from("servicos").select("id, nome, intervalo_recomendado, dias_manutencao"),
      ]);
      return {
        clientes: clientesR.data ?? [],
        agendamentos: agendamentosR.data ?? [],
        servicos: servicosR.data ?? [],
      };
    },
  });

  if (isLoading || !data) return null;

  const clientes = data.clientes;
  const agendamentos = data.agendamentos;
  const servicos = data.servicos;

  // Group: for each client, find their last concluded appointment per service
  const clientReturnMap: Record<string, { cliente: any; servico: any; ultimaData: Date; diasPassados: number; status: "atrasado" | "proximo" | "ok" }> = {};

  agendamentos.forEach((a) => {
    if (!a.cliente_id || !a.servico_id) return;
    const key = `${a.cliente_id}-${a.servico_id}`;
    if (clientReturnMap[key]) return; // first one is the most recent (ordered desc)
    
    const servico = servicos.find((s) => s.id === a.servico_id);
    if (!servico) return;

    const cliente = clientes.find((c) => c.id === a.cliente_id);
    if (!cliente) return;

    const ultimaData = new Date(a.data_hora);
    const diasPassados = differenceInDays(now, ultimaData);
    const intervalo = Number(servico.intervalo_recomendado ?? 15);
    const manutencao = Number(servico.dias_manutencao ?? 7);

    let status: "atrasado" | "proximo" | "ok" = "ok";
    if (diasPassados > intervalo) {
      status = "atrasado";
    } else if (diasPassados >= (intervalo - manutencao)) {
      status = "proximo";
    }

    if (status !== "ok") {
      clientReturnMap[key] = { cliente, servico, ultimaData, diasPassados, status };
    }
  });

  const atrasados = Object.values(clientReturnMap).filter(r => r.status === "atrasado");
  const proximos = Object.values(clientReturnMap).filter(r => r.status === "proximo");

  if (atrasados.length === 0 && proximos.length === 0) return null;

  return (
    <Card className="bg-card border border-border rounded-[20px] p-6 shadow-card mb-8">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="size-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 grid place-items-center">
          <RotateCcw className="size-[18px] text-white" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-card-foreground">Lembrete de Retorno</h3>
          <p className="text-xs text-muted-foreground">Clientes que precisam retornar</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {atrasados.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle className="size-3.5 text-red-500" />
              <span className="text-xs font-medium text-red-500">Atrasados ({atrasados.length})</span>
            </div>
            <div className="space-y-1.5">
              {atrasados.slice(0, 5).map((r, i) => (
                <div key={i} className="flex items-center justify-between bg-red-500/5 border border-red-500/10 rounded-lg px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-card-foreground truncate">{r.cliente.nome}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{r.servico.nome} • {r.diasPassados}d atrás</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-red-500 border-red-500/20 bg-red-500/10 shrink-0 ml-2">
                    +{r.diasPassados - Number(r.servico.intervalo_recomendado)}d
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {proximos.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Clock className="size-3.5 text-amber-500" />
              <span className="text-xs font-medium text-amber-500">Próximos ({proximos.length})</span>
            </div>
            <div className="space-y-1.5">
              {proximos.slice(0, 5).map((r, i) => (
                <div key={i} className="flex items-center justify-between bg-amber-500/5 border border-amber-500/10 rounded-lg px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-card-foreground truncate">{r.cliente.nome}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{r.servico.nome} • {r.diasPassados}d atrás</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/20 bg-amber-500/10 shrink-0 ml-2">
                    em {Number(r.servico.intervalo_recomendado) - r.diasPassados}d
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ───── Dashboard Main ───── */
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
        <div className="mb-6 animate-fade-up">
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

      {/* F1: Smart Assistant */}
      <SmartAssistant />

      {/* F2: Return Reminder */}
      <ReturnReminder />

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
