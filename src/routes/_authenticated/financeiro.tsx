import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { usePageTitle } from "@/hooks/use-page-title";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area, PieChart, Pie, Cell, Legend } from "recharts";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Wallet, TrendingUp, BarChart3, Plus, Pencil, Trash2, PiggyBank, ArrowDownToLine, Download, FileText, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { mensagemErroAmigavel } from "@/lib/user-errors";
import { useConfirm } from "@/components/ui/confirm-dialog";

export const Route = createFileRoute("/_authenticated/financeiro")({
  component: Financeiro,
});

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const CATEGORIAS_DESPESA = [
  { value: "aluguel", label: "Aluguel", color: "#EF4444" },
  { value: "energia", label: "Energia Elétrica", color: "#F59E0B" },
  { value: "agua", label: "Água", color: "#3B82F6" },
  { value: "internet", label: "Internet e Telefone", color: "#8B5CF6" },
  { value: "salario", label: "Salários", color: "#EC4899" },
  { value: "comissao", label: "Comissões", color: "#F97316" },
  { value: "produto", label: "Insumos e Produtos", color: "#14B8A6" },
  { value: "marketing", label: "Marketing e Publicidade", color: "#D946EF" },
  { value: "imposto", label: "Impostos e Taxas", color: "#6B7280" },
  { value: "manutencao", label: "Manutenção", color: "#84CC16" },
  { value: "prolabore", label: "Pró-labore", color: "#06B6D4" },
  { value: "seguro", label: "Seguros", color: "#A855F7" },
  { value: "outros", label: "Outras Despesas", color: "#9CA3AF" },
];

const CATEGORIA_COLORS: Record<string, string> = Object.fromEntries(
  CATEGORIAS_DESPESA.map(c => [c.value, c.color])
);

const PIE_COLORS = ["#D946EF", "#A855F7", "#6366F1", "#3B82F6", "#14B8A6", "#22C55E", "#84CC16", "#F59E0B", "#F97316", "#EF4444", "#EC4899", "#8B5CF6"];

type Despesa = {
  id: string; user_id: string; categoria: string; subcategoria: string | null;
  descricao: string; valor: number; data_vencimento: string; data_pagamento: string | null;
  pago: boolean; forma_pagamento: string; recorrente: boolean;
  recorrencia_tipo: string | null; observacoes: string | null;
  created_at: string;
};

const despesaSchema = z.object({
  categoria: z.string().min(1, "Selecione uma categoria"),
  descricao: z.string().min(2, "Descrição obrigatória").max(200),
  valor: z.number().positive("Valor deve ser positivo"),
  data_vencimento: z.string().min(1, "Data obrigatória"),
  pago: z.boolean(),
  forma_pagamento: z.string(),
  recorrente: z.boolean(),
  recorrencia_tipo: z.string().optional(),
  observacoes: z.string().max(500).optional().or(z.literal("")),
});

function Financeiro() {
  usePageTitle("Financeiro — Manicure Fácil");

  const qc = useQueryClient();
  const { confirm } = useConfirm();
  const [activeTab, setActiveTab] = useState("visao-geral");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [despesaDialogOpen, setDespesaDialogOpen] = useState(false);
  const [editingDespesa, setEditingDespesa] = useState<Despesa | null>(null);
  const [despesaForm, setDespesaForm] = useState({
    categoria: "outros", descricao: "", valor: 0, data_vencimento: format(new Date(), "yyyy-MM-dd"),
    pago: false, forma_pagamento: "pix", recorrente: false, recorrencia_tipo: "mensal", observacoes: "",
  });
  const [filtroMes, setFiltroMes] = useState(format(new Date(), "yyyy-MM"));
  const [filtroPago, setFiltroPago] = useState<"todos" | "pago" | "pendente">("todos");
  const [despesaErrors, setDespesaErrors] = useState<Record<string, string>>({});
  const ITEMS_PER_PAGE = 20;

  // ─── Queries ─────────────────────────────────────────────────
  const agsQuery = useQuery({
    queryKey: ["financeiro-ags"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agendamentos")
        .select("id, data_hora, valor, custo, status, pagamento, clientes(nome), servicos(nome)")
        .order("data_hora", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const despesasQuery = useQuery({
    queryKey: ["despesas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("despesas")
        .select("*")
        .order("data_vencimento", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Despesa[];
    },
  });

  const ags = agsQuery.data ?? [];
  const despesas = despesasQuery.data ?? [];
  const concl = ags.filter((a: any) => a.status === "concluido");
  const faturamento = concl.reduce((s: number, a: any) => s + Number(a.valor), 0);
  const custoTotal = concl.reduce((s: number, a: any) => s + Number(a.custo), 0);
  const lucroBrutoServicos = faturamento - custoTotal;
  const totalDespesas = despesas.filter(d => d.pago).reduce((s: number, d) => s + Number(d.valor), 0);
  const despesasPendentes = despesas.filter(d => !d.pago);
  const totalDespesasPendentes = despesasPendentes.reduce((s: number, d) => s + Number(d.valor), 0);
  const lucroLiquido = lucroBrutoServicos - totalDespesas;
  const margemLiquida = faturamento > 0 ? (lucroLiquido / faturamento) * 100 : 0;
  const ticketMedio = concl.length ? faturamento / concl.length : 0;
  const pendentes = ags.filter((a: any) => a.pagamento === "pendente" && a.status !== "cancelado");
  const pendValor = pendentes.reduce((s: number, a: any) => s + Number(a.valor), 0);

  // ─── Filtros ──────────────────────────────────────────────────
  const filteredDespesas = useMemo(() => {
    let result = despesas;
    if (filtroMes) {
      result = result.filter(d => d.data_vencimento.startsWith(filtroMes));
    }
    if (filtroPago === "pago") result = result.filter(d => d.pago);
    else if (filtroPago === "pendente") result = result.filter(d => !d.pago);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(d => d.descricao.toLowerCase().includes(q) || d.categoria.includes(q));
    }
    return result;
  }, [despesas, filtroMes, filtroPago, searchQuery]);

  const paginatedDespesas = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filteredDespesas.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredDespesas, page]);

  const totalPages = Math.ceil(filteredDespesas.length / ITEMS_PER_PAGE);

  // ─── Charts ────────────────────────────────────────────────────
  const months = Array.from({ length: 12 }, (_, i) => subMonths(new Date(), 11 - i));
  const chart6m = months.slice(-6);

  const evolucaoMensal = chart6m.map(m => {
    const ms = startOfMonth(m), me = endOfMonth(m);
    const receita = concl.filter((a: any) => { const d = new Date(a.data_hora); return d >= ms && d <= me; })
      .reduce((s: number, a: any) => s + Number(a.valor), 0);
    const custo = despesas.filter(d => d.pago && d.data_vencimento >= format(ms, "yyyy-MM-dd") && d.data_vencimento <= format(me, "yyyy-MM-dd"))
      .reduce((s: number, d) => s + Number(d.valor), 0);
    return {
      mes: format(m, "MMM/yy", { locale: ptBR }),
      receita: Number(receita.toFixed(2)),
      despesa: Number(custo.toFixed(2)),
      lucro: Number((receita - custo).toFixed(2)),
    };
  });

  const despesasPorCategoria = useMemo(() => {
    const map = new Map<string, number>();
    despesas.filter(d => d.pago).forEach(d => {
      map.set(d.categoria, (map.get(d.categoria) ?? 0) + Number(d.valor));
    });
    return Array.from(map.entries())
      .map(([cat, val]) => ({ name: CATEGORIAS_DESPESA.find(c => c.value === cat)?.label ?? cat, value: Number(val.toFixed(2)), color: CATEGORIA_COLORS[cat] ?? "#9CA3AF" }))
      .sort((a, b) => b.value - a.value);
  }, [despesas]);

  // ─── DRE ───────────────────────────────────────────────────────
  const dreData = useMemo(() => {
    return [
      { conta: "Receita Bruta de Serviços", valor: faturamento, tipo: "receita", cor: "#22C55E" },
      { conta: "(-) Custos dos Serviços", valor: -custoTotal, tipo: "deducao", cor: "#EF4444" },
      { conta: "= Lucro Bruto", valor: lucroBrutoServicos, tipo: "resultado", cor: "#22C55E" },
      { conta: "(-) Despesas Operacionais", valor: -totalDespesas, tipo: "deducao", cor: "#EF4444" },
      { conta: "= Resultado Líquido (DRE)", valor: lucroLiquido, tipo: "resultado_final", cor: lucroLiquido >= 0 ? "#22C55E" : "#EF4444" },
      { conta: "Margem Líquida", valor: margemLiquida, tipo: "margem", cor: margemLiquida >= 20 ? "#22C55E" : margemLiquida >= 10 ? "#F59E0B" : "#EF4444" },
      { conta: "Ticket Médio", valor: ticketMedio, tipo: "ticket", cor: "#A855F7" },
      { conta: "A Receber", valor: pendValor, tipo: "a_receber", cor: "#3B82F6" },
    ];
  }, [faturamento, custoTotal, lucroBrutoServicos, totalDespesas, lucroLiquido, margemLiquida, ticketMedio, pendValor]);

  // ─── Cash Flow ─────────────────────────────────────────────────
  const cashFlowData = useMemo(() => {
    const hoje = new Date();
    const dias = Array.from({ length: 15 }, (_, i) => {
      const d = new Date(hoje);
      d.setDate(d.getDate() + i);
      return d;
    });

    return dias.map(d => {
      const key = format(d, "yyyy-MM-dd");
      const receitas = ags.filter((a: any) => {
        const ad = new Date(a.data_hora);
        return format(ad, "yyyy-MM-dd") === key && a.status !== "cancelado";
      }).reduce((s: number, a: any) => s + Number(a.valor), 0);
      const saidas = despesas.filter(dp => dp.data_vencimento === key && !dp.pago)
        .reduce((s: number, dp) => s + Number(dp.valor), 0);
      return {
        dia: format(d, "dd/MM"),
        entradas: receitas,
        saidas: saidas,
        saldo: receitas - saidas,
      };
    });
  }, [ags, despesas]);

  // ─── Mutations ─────────────────────────────────────────────────
  const saveDespesaMut = useMutation({
    mutationFn: async () => {
      const parsed = despesaSchema.safeParse(despesaForm);
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      const u = (await supabase.auth.getUser()).data.user;
      if (!u) throw new Error("Usuário não autenticado");
      const payload = { ...parsed.data, user_id: u.id, recorrencia_tipo: parsed.data.recorrente ? parsed.data.recorrencia_tipo : null };
      if (editingDespesa) {
        const { error } = await supabase.from("despesas").update(payload).eq("id", editingDespesa.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("despesas").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingDespesa ? "Despesa atualizada" : "Despesa cadastrada");
      qc.invalidateQueries({ queryKey: ["despesas"] });
      setDespesaDialogOpen(false);
      resetForm();
    },
    onError: (e: Error) => toast.error(mensagemErroAmigavel(e.message)),
  });

  const deleteDespesaMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("despesas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Despesa excluída"); qc.invalidateQueries({ queryKey: ["despesas"] }); },
    onError: (e: Error) => toast.error(mensagemErroAmigavel(e.message)),
  });

  const togglePagoMut = useMutation({
    mutationFn: async ({ id, pago }: { id: string; pago: boolean }) => {
      const { error } = await supabase.from("despesas").update({
        pago,
        data_pagamento: pago ? format(new Date(), "yyyy-MM-dd") : null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["despesas"] }); toast.success("Status atualizado"); },
    onError: (e: Error) => toast.error(mensagemErroAmigavel(e.message)),
  });

  function resetForm() {
    setEditingDespesa(null);
    setDespesaForm({
      categoria: "outros", descricao: "", valor: 0, data_vencimento: format(new Date(), "yyyy-MM-dd"),
      pago: false, forma_pagamento: "pix", recorrente: false, recorrencia_tipo: "mensal", observacoes: "",
    });
  }

  function openEditDespesa(d: Despesa) {
    setEditingDespesa(d);
    setDespesaForm({
      categoria: d.categoria, descricao: d.descricao, valor: Number(d.valor),
      data_vencimento: d.data_vencimento, pago: d.pago, forma_pagamento: d.forma_pagamento,
      recorrente: d.recorrente, recorrencia_tipo: d.recorrencia_tipo ?? "mensal", observacoes: d.observacoes ?? "",
    });
    setDespesaDialogOpen(true);
  }

  // ─── Export CSV ────────────────────────────────────────────────
  function exportCSV() {
    const headers = "Categoria,Descrição,Valor,Vencimento,Pago\n";
    const rows = filteredDespesas.map(d =>
      `"${d.categoria}","${d.descricao.replace(/"/g, '""')}",${d.valor},${d.data_vencimento},${d.pago ? "Sim" : "Não"}`
    ).join("\n");
    const blob = new Blob(["\uFEFF" + headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `despesas_${format(new Date(), "yyyy-MM-dd")}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado com sucesso!");
  }

  // ─── Loading ───────────────────────────────────────────────────
  if (agsQuery.isLoading || despesasQuery.isLoading) {
    return (
      <>
        <PageHeader title="Financeiro" subtitle="Carregando dados financeiros..." />
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 rounded-2xl bg-muted" />)}
        </div>
        <Skeleton className="h-96 rounded-2xl bg-muted" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Financeiro"
        subtitle="Gestão financeira completa: receitas, despesas, DRE e fluxo de caixa"
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card className="bg-card border border-border p-5 rounded-[20px] shadow-card relative overflow-hidden">
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Faturamento</p>
            <p className="text-xl sm:text-[28px] font-semibold tracking-tight text-card-foreground break-words">{brl(faturamento)}</p>
            <p className="text-[10px] text-emerald-500">{concl.length} serviços realizados</p>
          </div>
          <div className="absolute top-4 right-4 size-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 grid place-items-center">
            <TrendingUp className="size-[18px] text-emerald-500" />
          </div>
        </Card>
        <Card className="bg-card border border-border p-5 rounded-[20px] shadow-card relative overflow-hidden">
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Lucro Líquido</p>
            <p className={`text-xl sm:text-[28px] font-semibold tracking-tight break-words ${lucroLiquido >= 0 ? "text-emerald-500" : "text-red-500"}`}>{brl(lucroLiquido)}</p>
            <p className="text-[10px] text-muted-foreground">Margem: {margemLiquida.toFixed(1)}%</p>
          </div>
          <div className="absolute top-4 right-4 size-10 rounded-xl bg-[#D946EF]/10 border border-[#D946EF]/20 grid place-items-center">
            <Wallet className="size-[18px] text-[#D946EF]" />
          </div>
        </Card>
        <Card className="bg-card border border-border p-5 rounded-[20px] shadow-card relative overflow-hidden">
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Despesas (Pagas)</p>
            <p className="text-xl sm:text-[28px] font-semibold tracking-tight text-red-500 break-words">{brl(totalDespesas)}</p>
            <p className="text-[10px] text-amber-500">{despesasPendentes.length} pendentes · {brl(totalDespesasPendentes)}</p>
          </div>
          <div className="absolute top-4 right-4 size-10 rounded-xl bg-red-500/10 border border-red-500/20 grid place-items-center">
            <ArrowDownToLine className="size-[18px] text-red-500" />
          </div>
        </Card>
        <Card className="bg-card border border-border p-5 rounded-[20px] shadow-card relative overflow-hidden">
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">A Receber</p>
            <p className="text-xl sm:text-[28px] font-semibold tracking-tight text-blue-500 break-words">{brl(pendValor)}</p>
            <p className="text-[10px] text-muted-foreground">{pendentes.length} cliente{pendentes.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="absolute top-4 right-4 size-10 rounded-xl bg-blue-500/10 border border-blue-500/20 grid place-items-center">
            <BarChart3 className="size-[18px] text-blue-500" />
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-white dark:bg-card border-0 p-1.5 rounded-2xl shadow-[0_2px_16px_rgba(91,30,140,0.04)] overflow-x-auto">
          <TabsTrigger value="visao-geral" className="rounded-xl data-[state=active]:bg-gradient-to-br data-[state=active]:from-[#D946EF] data-[state=active]:to-[#A855F7] data-[state=active]:text-white gap-1.5 text-xs"><BarChart3 className="size-3.5" /> Visão Geral</TabsTrigger>
          <TabsTrigger value="despesas" className="rounded-xl data-[state=active]:bg-gradient-to-br data-[state=active]:from-[#D946EF] data-[state=active]:to-[#A855F7] data-[state=active]:text-white gap-1.5 text-xs"><ArrowDownToLine className="size-3.5" /> Despesas</TabsTrigger>
          <TabsTrigger value="dre" className="rounded-xl data-[state=active]:bg-gradient-to-br data-[state=active]:from-[#D946EF] data-[state=active]:to-[#A855F7] data-[state=active]:text-white gap-1.5 text-xs"><FileText className="size-3.5" /> DRE</TabsTrigger>
          <TabsTrigger value="fluxo-caixa" className="rounded-xl data-[state=active]:bg-gradient-to-br data-[state=active]:from-[#D946EF] data-[state=active]:to-[#A855F7] data-[state=active]:text-white gap-1.5 text-xs"><PiggyBank className="size-3.5" /> Fluxo de Caixa</TabsTrigger>
        </TabsList>

        {/* ─── TAB 1: VISÃO GERAL ───────────────────────────── */}  
        <TabsContent value="visao-geral" className="space-y-6">
          {/* Evolução 6 meses */}
          <Card className="bg-card border border-border p-6 rounded-[20px] shadow-card">
            <h3 className="text-base font-semibold text-card-foreground mb-6">Evolução Financeira — 6 meses</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={evolucaoMensal}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, boxShadow: "var(--shadow-card)", padding: "12px 16px" }} formatter={(v) => brl(Number(v))} />
                  <Legend />
                  <Bar dataKey="receita" name="Receita" fill="#22C55E" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="despesa" name="Despesa" fill="#EF4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Despesas por Categoria */}
            <Card className="bg-card border border-border p-6 rounded-[20px] shadow-card">
              <h3 className="text-base font-semibold text-card-foreground mb-4">Despesas por Categoria</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={despesasPorCategoria} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {despesasPorCategoria.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => brl(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Lucro vs Despesa (Linha) */}
            <Card className="bg-card border border-border p-6 rounded-[20px] shadow-card">
              <h3 className="text-base font-semibold text-card-foreground mb-4">Lucro Líquido por Mês</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={evolucaoMensal}>
                    <defs><linearGradient id="lucroGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22C55E" stopOpacity={0.2} /><stop offset="100%" stopColor="#22C55E" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16 }} formatter={(v) => brl(Number(v))} />
                    <Area type="monotone" dataKey="lucro" stroke="#22C55E" strokeWidth={2} fill="url(#lucroGrad)" dot={{ r: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Contas a Receber */}
          <Card className="bg-card border border-border p-6 rounded-[20px] shadow-card">
            <h3 className="text-base font-semibold text-card-foreground mb-4">Contas a Receber</h3>
            {pendentes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhum pagamento pendente 🎉</p>
            ) : (
              <div className="space-y-2">
                {pendentes.slice(0, 8).map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/40">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-card-foreground truncate">{a.clientes?.nome ?? "Cliente"}</p>
                      <p className="text-xs text-muted-foreground truncate">{a.servicos?.nome} • {format(new Date(a.data_hora), "dd/MM/yyyy")}</p>
                    </div>
                    <span className="text-lg font-semibold text-card-foreground shrink-0 ml-3">{brl(Number(a.valor))}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ─── TAB 2: DESPESAS ──────────────────────────────── */}
        <TabsContent value="despesas" className="space-y-4">
          {/* Actions bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar despesa..."
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
                  className="pl-9 h-9 w-48 rounded-xl text-xs"
                />
              </div>
              <Select value={filtroMes} onValueChange={setFiltroMes}>
                <SelectTrigger className="h-9 w-36 rounded-xl text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => subMonths(new Date(), i)).map(d => (
                    <SelectItem key={format(d, "yyyy-MM")} value={format(d, "yyyy-MM")}>{format(d, "MMMM/yyyy", { locale: ptBR })}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filtroPago} onValueChange={(v) => { setFiltroPago(v as any); setPage(1); }}>
                <SelectTrigger className="h-9 w-32 rounded-xl text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="pago">Pagas</SelectItem>
                  <SelectItem value="pendente">Pendentes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="rounded-xl text-xs h-9" onClick={exportCSV} aria-label="Exportar despesas como CSV">
                <Download className="size-3.5 mr-1" aria-hidden="true" /> Exportar CSV
              </Button>
              <Dialog open={despesaDialogOpen} onOpenChange={(v) => { setDespesaDialogOpen(v); if (!v) resetForm(); }}>
                <DialogTrigger asChild>
                  <Button className="gradient-primary text-primary-foreground shadow-glow h-9 rounded-xl text-xs" aria-label="Nova despesa">
                    <Plus className="size-3.5 mr-1" aria-hidden="true" /> Nova Despesa
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
                  <DialogHeader><DialogTitle className="font-display text-xl">{editingDespesa ? "Editar Despesa" : "Nova Despesa"}</DialogTitle></DialogHeader>
                  <form onSubmit={(e) => { e.preventDefault();
                    const parsed = despesaSchema.safeParse(despesaForm);
                    if (!parsed.success) {
                      const errs: Record<string, string> = {};
                      parsed.error.issues.forEach(i => { const field = i.path[0] as string; errs[field] = i.message; });
                      setDespesaErrors(errs);
                      toast.error(errs[Object.keys(errs)[0]]);
                      return;
                    }
                    setDespesaErrors({});
                    saveDespesaMut.mutate();
                  }} className="space-y-4 py-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs" htmlFor="desp-categoria">Categoria</Label>
                        <Select value={despesaForm.categoria} onValueChange={v => { setDespesaForm({ ...despesaForm, categoria: v }); setDespesaErrors(e => { delete e.categoria; return {...e}; }); }}>
                          <SelectTrigger id="desp-categoria" className={`h-10 rounded-xl ${despesaErrors.categoria ? "ring-2 ring-destructive" : ""}`} aria-invalid={!!despesaErrors.categoria} aria-describedby={despesaErrors.categoria ? "error-desp-categoria" : undefined}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CATEGORIAS_DESPESA.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {despesaErrors.categoria && <span id="error-desp-categoria" className="sr-only" role="alert">{despesaErrors.categoria}</span>}
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs" htmlFor="desp-valor">Valor (R$)</Label>
                        <Input id="desp-valor" type="number" step="0.01" min="0.01" value={despesaForm.valor || ""} onChange={e => { setDespesaForm({ ...despesaForm, valor: Number(e.target.value) }); setDespesaErrors(e => { delete e.valor; return {...e}; }); }} className={`h-10 rounded-xl ${despesaErrors.valor ? "ring-2 ring-destructive" : ""}`} required aria-invalid={!!despesaErrors.valor} aria-describedby={despesaErrors.valor ? "error-desp-valor" : undefined} />
                        {despesaErrors.valor && <span id="error-desp-valor" className="sr-only" role="alert">{despesaErrors.valor}</span>}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs" htmlFor="desp-descricao">Descrição</Label>
                      <Input id="desp-descricao" value={despesaForm.descricao} onChange={e => { setDespesaForm({ ...despesaForm, descricao: e.target.value }); setDespesaErrors(e => { delete e.descricao; return {...e}; }); }} placeholder="Ex: Conta de luz do mês" className={`h-10 rounded-xl ${despesaErrors.descricao ? "ring-2 ring-destructive" : ""}`} required aria-invalid={!!despesaErrors.descricao} aria-describedby={despesaErrors.descricao ? "error-desp-descricao" : undefined} />
                      {despesaErrors.descricao && <span id="error-desp-descricao" className="sr-only" role="alert">{despesaErrors.descricao}</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs" htmlFor="desp-vencimento">Data de vencimento</Label>
                        <Input id="desp-vencimento" type="date" value={despesaForm.data_vencimento} onChange={e => setDespesaForm({ ...despesaForm, data_vencimento: e.target.value })} className="h-10 rounded-xl" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs" htmlFor="desp-forma">Forma de pagamento</Label>
                        <Select value={despesaForm.forma_pagamento} onValueChange={v => setDespesaForm({ ...despesaForm, forma_pagamento: v })}>
                          <SelectTrigger id="desp-forma" className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pix">PIX</SelectItem>
                            <SelectItem value="dinheiro">Dinheiro</SelectItem>
                            <SelectItem value="debito">Débito</SelectItem>
                            <SelectItem value="credito">Crédito</SelectItem>
                            <SelectItem value="boleto">Boleto</SelectItem>
                            <SelectItem value="transferencia">Transferência</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <Checkbox id="pago" checked={despesaForm.pago} onCheckedChange={(v) => setDespesaForm({ ...despesaForm, pago: v as boolean })} />
                        <Label htmlFor="pago" className="text-xs cursor-pointer">Já pago</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox id="recorrente" checked={despesaForm.recorrente} onCheckedChange={(v) => setDespesaForm({ ...despesaForm, recorrente: v as boolean })} />
                        <Label htmlFor="recorrente" className="text-xs cursor-pointer">Recorrente</Label>
                      </div>
                      {despesaForm.recorrente && (
                        <Select value={despesaForm.recorrencia_tipo} onValueChange={v => setDespesaForm({ ...despesaForm, recorrencia_tipo: v })}>
                          <SelectTrigger className="h-8 w-32 rounded-xl text-xs" aria-label="Tipo de recorrência"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="mensal">Mensal</SelectItem>
                            <SelectItem value="semanal">Semanal</SelectItem>
                            <SelectItem value="trimestral">Trimestral</SelectItem>
                            <SelectItem value="anual">Anual</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs" htmlFor="desp-obs">Observações</Label>
                      <Textarea id="desp-obs" rows={2} value={despesaForm.observacoes} onChange={e => setDespesaForm({ ...despesaForm, observacoes: e.target.value })} className="rounded-xl text-xs" />
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={saveDespesaMut.isPending} className="w-full gradient-primary text-primary-foreground shadow-glow rounded-xl">
                        {saveDespesaMut.isPending ? "Salvando..." : (editingDespesa ? "Atualizar" : "Cadastrar Despesa")}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Tabela de Despesas */}
          {filteredDespesas.length === 0 ? (
            <Card className="bg-card border border-border p-12 text-center rounded-[20px]">
              <div className="size-14 rounded-2xl bg-red-500/10 border border-red-500/20 grid place-items-center mx-auto mb-3">
                <ArrowDownToLine className="size-6 text-red-500" />
              </div>
              <p className="text-muted-foreground">Nenhuma despesa encontrada.</p>
            </Card>
          ) : (
            <>
              <div className="overflow-hidden border border-border/40 rounded-2xl">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[11px]">Categoria</TableHead>
                      <TableHead className="text-[11px]">Descrição</TableHead>
                      <TableHead className="text-[11px] text-right">Valor</TableHead>
                      <TableHead className="text-[11px]">Vencimento</TableHead>
                      <TableHead className="text-[11px]">Status</TableHead>
                      <TableHead className="text-[11px] text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedDespesas.map(d => (
                      <TableRow key={d.id} className="group">
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]" style={{ borderColor: `${CATEGORIA_COLORS[d.categoria] ?? "#9CA3AF"}40`, color: CATEGORIA_COLORS[d.categoria] ?? "#9CA3AF" }}>
                            {CATEGORIAS_DESPESA.find(c => c.value === d.categoria)?.label ?? d.categoria}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium text-sm max-w-[200px] truncate">{d.descricao}</TableCell>
                        <TableCell className="text-right font-semibold text-sm">{brl(Number(d.valor))}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{format(new Date(d.data_vencimento + "T00:00:00"), "dd/MM/yyyy")}</TableCell>
                        <TableCell>
                          <button onClick={() => togglePagoMut.mutate({ id: d.id, pago: !d.pago })} className="focus:outline-none" aria-label={`Marcar despesa ${d.descricao} como ${d.pago ? "pendente" : "paga"}`}>
                            <Badge variant="outline" className={`text-[10px] cursor-pointer transition-all ${d.pago ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-amber-500/10 text-amber-500 border-amber-500/20"}`}>
                              {d.pago ? "Pago" : "Pendente"}
                            </Badge>
                          </button>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                            <Button size="icon" variant="ghost" className="size-7" onClick={() => openEditDespesa(d)} aria-label={`Editar despesa ${d.descricao}`}><Pencil className="size-3.5 text-muted-foreground" aria-hidden="true" /></Button>
                            <Button size="icon" variant="ghost" className="size-7" aria-label={`Excluir despesa ${d.descricao}`} onClick={() => {
                              confirm({
                                title: "Excluir despesa?",
                                description: `Tem certeza que deseja excluir "${d.descricao}"?`,
                                confirmText: "Excluir", variant: "danger",
                                onConfirm: () => deleteDespesaMut.mutate(d.id),
                              });
                            }}><Trash2 className="size-3.5 text-destructive" aria-hidden="true" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Paginação */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-muted-foreground">{filteredDespesas.length} despesa{filteredDespesas.length !== 1 ? "s" : ""}</p>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="size-8" disabled={page === 1} onClick={() => setPage(p => p - 1)} aria-label="Página anterior"><ChevronLeft className="size-4" aria-hidden="true" /></Button>
                    <span className="text-xs text-muted-foreground px-2">{page} de {totalPages}</span>
                    <Button variant="ghost" size="icon" className="size-8" disabled={page === totalPages} onClick={() => setPage(p => p + 1)} aria-label="Próxima página"><ChevronRight className="size-4" aria-hidden="true" /></Button>
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ─── TAB 3: DRE ───────────────────────────────────── */}
        <TabsContent value="dre">
          <Card className="bg-card border border-border rounded-[20px] shadow-card overflow-hidden">
            <div className="p-6 border-b border-border/40">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 grid place-items-center">
                  <FileText className="size-5 text-white" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-semibold text-card-foreground">Demonstração de Resultados (DRE)</h3>
                  <p className="text-xs text-muted-foreground">Período: Total acumulado</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-1 max-w-lg mx-auto">
                {dreData.map((item, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between p-3 rounded-xl transition-all ${
                      item.tipo === "resultado_final" ? "bg-gradient-to-r from-emerald-500/10 to-transparent border border-emerald-500/20 text-lg font-bold" :
                      item.tipo === "margem" ? "bg-muted/30" :
                      item.tipo === "resultado" ? "font-semibold" : ""
                    }`}
                  >
                    <span className={`text-sm ${
                      item.tipo === "resultado_final" ? "text-card-foreground" :
                      item.tipo === "resultado" ? "text-emerald-500" :
                      item.tipo === "deducao" ? "text-red-500" : "text-muted-foreground"
                    }`}>
                      {item.tipo === "margem" || item.tipo === "ticket" || item.tipo === "a_receber" ? `📊 ${item.conta}` : item.conta}
                    </span>
                    <span className={`font-mono ${
                      item.tipo === "resultado_final" ? "text-2xl" : "text-sm"
                    }`} style={{ color: item.cor }}>
                      {item.tipo === "margem" ? `${item.valor.toFixed(1)}%` : brl(Number(item.valor))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* ─── TAB 4: FLUXO DE CAIXA ────────────────────────── */}
        <TabsContent value="fluxo-caixa">
          <Card className="bg-card border border-border p-6 rounded-[20px] shadow-card">
            <div className="flex items-center gap-3 mb-6">
              <div className="size-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 grid place-items-center">
                <PiggyBank className="size-5 text-white" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-card-foreground">Fluxo de Caixa Projetado — 15 dias</h3>
                <p className="text-xs text-muted-foreground">Entradas, saídas e saldo acumulado</p>
              </div>
            </div>

            {/* Mini cards */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <Card className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 text-center">
                <p className="text-[10px] text-emerald-500 uppercase tracking-wider">Total Entradas</p>
                <p className="text-lg font-bold text-emerald-500 mt-1">{brl(cashFlowData.reduce((s, d) => s + d.entradas, 0))}</p>
              </Card>
              <Card className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 text-center">
                <p className="text-[10px] text-red-500 uppercase tracking-wider">Total Saídas</p>
                <p className="text-lg font-bold text-red-500 mt-1">{brl(cashFlowData.reduce((s, d) => s + d.saidas, 0))}</p>
              </Card>
              <Card className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 text-center">
                <p className="text-[10px] text-blue-500 uppercase tracking-wider">Saldo Projetado</p>
                <p className={`text-lg font-bold mt-1 ${cashFlowData[cashFlowData.length - 1]?.saldo >= 0 ? "text-blue-500" : "text-red-500"}`}>
                  {brl(cashFlowData[cashFlowData.length - 1]?.saldo ?? 0)}
                </p>
              </Card>
            </div>

            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cashFlowData}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16 }} formatter={(v) => brl(Number(v))} />
                  <Legend />
                  <Bar dataKey="entradas" name="Entradas" fill="#22C55E" radius={[4,4,0,0]} />
                  <Bar dataKey="saidas" name="Saídas" fill="#EF4444" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Daily table */}
            <div className="mt-6 space-y-1">
              {cashFlowData.map((d, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg hover:bg-accent/20 transition-colors text-xs">
                  <span className="font-medium text-card-foreground w-11 sm:w-16">{d.dia}</span>
                  <span className="text-emerald-500 w-[64px] sm:w-24 text-right">{d.entradas > 0 ? brl(d.entradas) : "—"}</span>
                  <span className="text-red-500 w-[64px] sm:w-24 text-right">{d.saidas > 0 ? brl(d.saidas) : "—"}</span>
                  <span className={`font-semibold w-[64px] sm:w-24 text-right ${d.saldo >= 0 ? "text-emerald-500" : "text-red-500"}`}>{brl(d.saldo)}</span>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
