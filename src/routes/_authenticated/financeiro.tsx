import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Wallet, TrendingUp, Receipt, BarChart3, Calculator } from "lucide-react";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro — Manicure Fácil" }] }),
  component: Financeiro,
});

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Financeiro() {
  const q = useQuery({
    queryKey: ["financeiro"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agendamentos")
        .select("id, data_hora, valor, custo, status, pagamento, clientes(nome), servicos(nome)")
        .order("data_hora", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (q.isLoading) {
    return <><PageHeader title="Financeiro" subtitle="Acompanhe faturamento, lucro e recebimentos" /><div className="grid md:grid-cols-4 gap-4">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div></>;
  }

  const ags = (q.data ?? []) as any[];
  const concl = ags.filter(a => a.status === "concluido");
  const faturamento = concl.reduce((s, a) => s + Number(a.valor), 0);
  const lucro = concl.reduce((s, a) => s + Number(a.valor) - Number(a.custo), 0);
  const ticket = concl.length ? faturamento / concl.length : 0;
  const pendentes = ags.filter(a => a.pagamento === "pendente" && a.status !== "cancelado");
  const pendValor = pendentes.reduce((s, a) => s + Number(a.valor), 0);

  // últimos 6 meses
  const months = Array.from({ length: 6 }, (_, i) => subMonths(new Date(), 5 - i));
  const chart = months.map(m => {
    const ms = startOfMonth(m), me = endOfMonth(m);
    const inM = concl.filter(a => { const d = new Date(a.data_hora); return d >= ms && d <= me; });
    return {
      mes: format(m, "MMM/yy", { locale: ptBR }),
      faturamento: Number(inM.reduce((s, a) => s + Number(a.valor), 0).toFixed(2)),
      lucro: Number(inM.reduce((s, a) => s + Number(a.valor) - Number(a.custo), 0).toFixed(2)),
    };
  });

  // F6: Profit calculator per service
  const profitByService = useMemo(() => {
    const serviceMap = new Map<string, { nome: string; qtd: number; receita: number; custo: number; totalMin: number }>();
    ags.forEach((a: any) => {
      const servName = a.servicos?.nome ?? "Avulso";
      const existing = serviceMap.get(servName) ?? { nome: servName, qtd: 0, receita: 0, custo: 0, totalMin: 0 };
      existing.qtd++;
      existing.receita += Number(a.valor);
      existing.custo += a.status === "concluido" ? Number(a.custo) : 0;
      existing.totalMin += Number(a.duracao_min ?? 60);
      serviceMap.set(servName, existing);
    });
    return Array.from(serviceMap.values())
      .map(s => ({
        ...s,
        lucroBruto: s.receita - s.custo,
        margemPorcentagem: s.receita > 0 ? ((s.receita - s.custo) / s.receita * 100) : 0,
        lucroPorHora: s.totalMin > 0 ? ((s.receita - s.custo) / (s.totalMin / 60)) : 0,
      }))
      .sort((a, b) => b.lucroBruto - a.lucroBruto);
  }, [ags]);

  // Overall margin
  const margemGeral = faturamento > 0 ? ((faturamento - concl.reduce((s, a) => s + Number(a.custo), 0)) / faturamento * 100) : 0;

  const stats = [
    { icon: Wallet, label: "Faturamento total", value: brl(faturamento) },
    { icon: TrendingUp, label: "Lucro total", value: brl(lucro) },
    { icon: Receipt, label: "Ticket médio", value: brl(ticket) },
    { icon: BarChart3, label: "A receber", value: brl(pendValor) },
  ];

  return (
    <>
      <PageHeader title="Financeiro" subtitle="Acompanhe faturamento, lucro e recebimentos" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(s => (
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

      {/* F6: Profit Calculator */}
      {profitByService.length > 0 && (
        <Card className="bg-card border border-border p-6 rounded-[20px] mt-8 shadow-card">
          <div className="flex items-center gap-3 mb-6">
            <div className="size-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 grid place-items-center">
              <Calculator className="size-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-card-foreground">Calculadora de Lucro por Serviço</h3>
              <p className="text-xs text-muted-foreground">Detalhamento real com margem e lucro por hora</p>
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-4 mb-6">
            <Card className="bg-muted/50 rounded-xl p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase">Margem Média</p>
              <p className={`text-lg font-bold mt-1 ${margemGeral >= 50 ? "text-emerald-500" : margemGeral >= 30 ? "text-amber-500" : "text-red-500"}`}>
                {margemGeral.toFixed(1)}%
              </p>
            </Card>
            <Card className="bg-muted/50 rounded-xl p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase">Lucro Total</p>
              <p className="text-lg font-bold mt-1 text-card-foreground">{brl(lucro)}</p>
            </Card>
            <Card className="bg-muted/50 rounded-xl p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase">Custo Total</p>
              <p className="text-lg font-bold mt-1 text-card-foreground">{brl(concl.reduce((s, a) => s + Number(a.custo), 0))}</p>
            </Card>
            <Card className="bg-muted/50 rounded-xl p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase">Lucro/Hora Médio</p>
              <p className="text-lg font-bold mt-1 text-card-foreground">{brl(profitByService[0]?.lucroPorHora ?? 0)}</p>
            </Card>
          </div>

          <div className="overflow-hidden border border-border/40 rounded-xl">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px]">Serviço</TableHead>
                  <TableHead className="text-[11px] text-right">Qtd</TableHead>
                  <TableHead className="text-[11px] text-right">Receita</TableHead>
                  <TableHead className="text-[11px] text-right">Custo</TableHead>
                  <TableHead className="text-[11px] text-right">Lucro Bruto</TableHead>
                  <TableHead className="text-[11px] text-right">Margem</TableHead>
                  <TableHead className="text-[11px] text-right">Lucro/h</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profitByService.map(s => (
                  <TableRow key={s.nome}>
                    <TableCell className="font-medium text-sm">{s.nome}</TableCell>
                    <TableCell className="text-right">{s.qtd}x</TableCell>
                    <TableCell className="text-right">{brl(s.receita)}</TableCell>
                    <TableCell className="text-right text-red-500">{brl(s.custo)}</TableCell>
                    <TableCell className="text-right font-semibold text-emerald-500">{brl(s.lucroBruto)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary" className={`text-[10px] ${s.margemPorcentagem >= 50 ? "bg-emerald-500/10 text-emerald-500" : s.margemPorcentagem >= 30 ? "bg-amber-500/10 text-amber-500" : "bg-red-500/10 text-red-500"}`}>
                        {s.margemPorcentagem.toFixed(0)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{brl(s.lucroPorHora)}/h</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <Card className="bg-card border border-border p-6 rounded-[20px] mt-8 shadow-card">
        <h3 className="text-base font-semibold text-card-foreground mb-6">Evolução financeira — 6 meses</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, boxShadow: "var(--shadow-card)", padding: "12px 16px" }} formatter={(v) => brl(Number(v))} />
              <Bar dataKey="faturamento" fill="#D946EF" radius={[8, 8, 0, 0]} />
              <Bar dataKey="lucro" fill="#A855F7" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="bg-card border border-border p-6 rounded-[20px] mt-8 shadow-card">
        <h3 className="text-base font-semibold text-card-foreground mb-6">Contas a receber</h3>
        {pendentes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum pagamento pendente 🎉</p>
        ) : (
          <ul className="divide-y divide-border">
            {pendentes.map(a => (
              <li key={a.id} className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
                <div>
                  <p className="font-medium text-sm text-card-foreground">{a.clientes?.nome ?? "Cliente"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.servicos?.nome} <span className="mx-1.5 text-muted-foreground">•</span> {format(new Date(a.data_hora), "dd/MM/yyyy")}</p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-card-foreground">{brl(Number(a.valor))}</div>
                  <Badge variant="outline" className="text-[10px] mt-0.5 bg-[#D946EF]/10 text-[#D946EF] border-[#D946EF]/20">{a.pagamento}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
