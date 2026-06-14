import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Wallet, TrendingUp, Receipt, BarChart3 } from "lucide-react";

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
    return <><PageHeader title="Financeiro" /><div className="grid md:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div></>;
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

  const stats = [
    { icon: Wallet, label: "Faturamento total", value: brl(faturamento) },
    { icon: TrendingUp, label: "Lucro total", value: brl(lucro) },
    { icon: Receipt, label: "Ticket médio", value: brl(ticket) },
    { icon: BarChart3, label: "A receber", value: brl(pendValor) },
  ];

  return (
    <>
      <PageHeader title="Financeiro" subtitle="Acompanhe faturamento, lucro e recebimentos" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {stats.map(s => (
          <Card key={s.label} className="glass border-0 rounded-2xl p-4">
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

      <Card className="glass border-0 rounded-2xl p-5 mt-6">
        <h3 className="font-display text-lg mb-4">Evolução financeira — 6 meses</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }} />
              <YAxis tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }} />
              <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12 }} formatter={(v) => brl(Number(v))} />
              <Bar dataKey="faturamento" fill="var(--color-chart-2)" radius={[8, 8, 0, 0]} />
              <Bar dataKey="lucro" fill="var(--color-primary)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="glass border-0 rounded-2xl p-5 mt-6">
        <h3 className="font-display text-lg mb-4">Contas a receber</h3>
        {pendentes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhum pagamento pendente 🎉</p>
        ) : (
          <ul className="divide-y divide-border">
            {pendentes.map(a => (
              <li key={a.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-sm">{a.clientes?.nome ?? "Cliente"}</p>
                  <p className="text-xs text-muted-foreground">{a.servicos?.nome} • {format(new Date(a.data_hora), "dd/MM/yyyy")}</p>
                </div>
                <div className="text-right">
                  <div className="font-display">{brl(Number(a.valor))}</div>
                  <Badge variant="outline" className="text-xs">{a.pagamento}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
