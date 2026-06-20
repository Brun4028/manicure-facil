import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/AppShell";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { fallbackDb } from "@/lib/fallback-db";
import {
  FileText, FileSpreadsheet, Download, Upload, TrendingUp, Target, BarChart2, Award, Users, AlertCircle, RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, differenceInDays } from "date-fns";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios & Metas — Manicure Fácil" }] }),
  component: RelatoriosPage,
});

type MetaMensal = {
  id: string;
  mes_ano: string;
  faturamento_alvo: number;
  lucro_alvo: number;
  servicos_alvo: number;
};

const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function RelatoriosPage() {
  const qc = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), "yyyy-MM"));

  // Fetch Monthly Goal
  const metaQuery = useQuery({
    queryKey: ["meta_mensal", selectedMonth],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("metas_mensais").select("*").eq("mes_ano", selectedMonth).maybeSingle();
        if (error) throw error;
        return data as MetaMensal | null;
      } catch (e) {
        const local = fallbackDb.get<MetaMensal>("metas_mensais", []);
        const match = local.find(x => x.mes_ano === selectedMonth);
        return match || null;
      }
    },
  });

  // Fetch all bookings
  const agendamentosQuery = useQuery({
    queryKey: ["agendamentos_all"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("agendamentos").select("*");
        if (error) throw error;
        return data;
      } catch (e) {
        return fallbackDb.get<any>("agendamentos", []);
      }
    },
  });

  // Fetch all product sales
  const salesQuery = useQuery({
    queryKey: ["vendas_all"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("vendas").select("*");
        if (error) throw error;
        return data;
      } catch (e) {
        return fallbackDb.get<any>("vendas", []);
      }
    },
  });

  // Fetch clients
  const clientsQuery = useQuery({
    queryKey: ["clientes_all"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("clientes").select("*");
        if (error) throw error;
        return data;
      } catch (e) {
        return fallbackDb.get<any>("clientes", []);
      }
    },
  });

  // Fetch services
  const servicesQuery = useQuery({
    queryKey: ["servicos_all"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("servicos").select("*");
        if (error) throw error;
        return data;
      } catch (e) {
        return [];
      }
    },
  });

  const allAgendamentos = agendamentosQuery.data ?? [];
  const allSales = salesQuery.data ?? [];
  const clients = clientsQuery.data ?? [];
  const services = servicesQuery.data ?? [];

  // Month filters
  const currentMonthData = useMemo(() => {
    const start = startOfMonth(new Date(`${selectedMonth}-02`));
    const end = endOfMonth(new Date(`${selectedMonth}-02`));

    // Filter appointments
    const monthAgs = allAgendamentos.filter((a: any) => {
      const d = new Date(a.data_hora);
      return d >= start && d <= end;
    });

    // Filter sales
    const monthSales = allSales.filter((s: any) => {
      const d = new Date(s.data_venda);
      return d >= start && d <= end;
    });

    // Real values
    const conclAgs = monthAgs.filter((a: any) => a.status === "concluido");

    const fatAgs = conclAgs.reduce((sum: number, a: any) => sum + Number(a.valor), 0);
    const costAgs = conclAgs.reduce((sum: number, a: any) => sum + Number(a.custo), 0);

    const fatSales = monthSales.reduce((sum: number, s: any) => sum + Number(s.total), 0);
    // Let's assume cost of sold products is roughly 40% as a fallback, or calculate if we had detailed products
    const costSales = fatSales * 0.4;

    const faturamentoReal = fatAgs + fatSales;
    const lucroReal = (fatAgs - costAgs) + (fatSales - costSales);
    const servicosQtd = conclAgs.length;

    return {
      faturamentoReal,
      lucroReal,
      servicosQtd,
      conclAgs,
      monthSales,
      allMonthAgs: monthAgs
    };
  }, [selectedMonth, allAgendamentos, allSales]);

  // Ranking of Services
  const serviceRanking = useMemo(() => {
    const rankMap: Record<string, { nome: string; count: number; receita: number }> = {};

    currentMonthData.conclAgs.forEach((a: any) => {
      const servName = services.find((s: any) => s.id === a.servico_id)?.nome ?? "Serviço deletado / Avulso";
      if (!rankMap[servName]) {
        rankMap[servName] = { nome: servName, count: 0, receita: 0 };
      }
      rankMap[servName].count += 1;
      rankMap[servName].receita += Number(a.valor);
    });

    return Object.values(rankMap).sort((a, b) => b.count - a.count);
  }, [currentMonthData.conclAgs, services]);

  // Smart Insights & Averages
  const insights = useMemo(() => {
    const totalAgs = currentMonthData.conclAgs.length;
    const faturamento = currentMonthData.faturamentoReal;
    const ticketMedio = totalAgs > 0 ? faturamento / totalAgs : 0;

    // Projected revenue
    const today = new Date();
    let projetado = faturamento;
    if (format(today, "yyyy-MM") === selectedMonth) {
      const dayOfMonth = today.getDate();
      const totalDays = differenceInDays(endOfMonth(today), startOfMonth(today)) + 1;
      projetado = (faturamento / Math.max(1, dayOfMonth)) * totalDays;
    }

    // Inactive clients (last visited > 30 days ago)
    const inactiveClients = clients.filter((c: any) => {
      const clientAgs = allAgendamentos.filter((a: any) => a.cliente_id === c.id && a.status === "concluido");
      if (clientAgs.length === 0) return true; // never booked

      const lastAg = clientAgs.reduce((latest: Date, a: any) => {
        const d = new Date(a.data_hora);
        return d > latest ? d : latest;
      }, new Date(0));

      const daysDiff = differenceInDays(new Date(), lastAg);
      return daysDiff > 30;
    });

    return {
      ticketMedio,
      projetado,
      inactiveCount: inactiveClients.length,
      inactiveList: inactiveClients.slice(0, 5) // top 5 sumidos
    };
  }, [currentMonthData, clients, allAgendamentos, selectedMonth]);

  // Goal config updates
  const saveGoalMut = useMutation({
    mutationFn: async (val: { faturamento_alvo: number; lucro_alvo: number; servicos_alvo: number }) => {
      try {
        const user = (await supabase.auth.getUser()).data.user;
        const currentMeta = metaQuery.data;
        if (currentMeta) {
          await supabase.from("metas_mensais").update(val).eq("id", currentMeta.id);
        } else {
          await supabase.from("metas_mensais").insert({
            user_id: user!.id,
            mes_ano: selectedMonth,
            ...val
          });
        }
      } catch {
        const local = fallbackDb.get<MetaMensal>("metas_mensais", []);
        const idx = local.findIndex(x => x.mes_ano === selectedMonth);
        if (idx !== -1) {
          local[idx] = { ...local[idx], ...val };
        } else {
          local.push({
            id: crypto.randomUUID(),
            mes_ano: selectedMonth,
            ...val
          });
        }
        fallbackDb.set("metas_mensais", local);
      }
    },
    onSuccess: () => {
      toast.success("Meta atualizada para " + selectedMonth);
      qc.invalidateQueries({ queryKey: ["meta_mensal", selectedMonth] });
    },
    onError: (e: Error) => toast.error(e.message)
  });

  // PDF Export (Native stylized print overlay)
  const exportPDF = () => {
    window.print();
  };

  // CSV Export (Excel compatible)
  const exportExcel = () => {
    if (currentMonthData.allMonthAgs.length === 0 && currentMonthData.monthSales.length === 0) {
      toast.error("Nenhum dado financeiro para exportar neste mês.");
      return;
    }

    let csvContent = "\uFEFF"; // UTF-8 BOM
    csvContent += "Relatório Mensal de Operações - " + selectedMonth + "\n";
    csvContent += "Faturamento Estimado;" + brl(currentMonthData.faturamentoReal) + "\n";
    csvContent += "Lucro Estimado;" + brl(currentMonthData.lucroReal) + "\n\n";

    // Bookings section
    csvContent += "AGENDAMENTOS\n";
    csvContent += "Cliente;Serviço;Valor;Custo;Status;Data/Hora\n";
    currentMonthData.allMonthAgs.forEach((a: any) => {
      const clientName = clients.find(c => c.id === a.cliente_id)?.nome ?? "N/A";
      const servName = services.find(s => s.id === a.servico_id)?.nome ?? "N/A";
      csvContent += `${clientName};${servName};${a.valor};${a.custo};${a.status};${format(new Date(a.data_hora), "dd/MM/yyyy HH:mm")}\n`;
    });

    csvContent += "\n";

    // Sales section
    csvContent += "VENDAS DE PRODUTOS\n";
    csvContent += "Cliente;Total;Pagamento;Data\n";
    currentMonthData.monthSales.forEach((s: any) => {
      const clientName = clients.find(c => c.id === s.cliente_id)?.nome ?? "Consumidor Geral";
      csvContent += `${clientName};${s.total};${s.pagamento_metodo};${format(new Date(s.data_venda), "dd/MM/yyyy")}\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `relatorio_nailboss_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Excel (CSV) baixado!");
  };

  // Full backup exports
  const exportJSONBackup = () => {
    const tables = ["clientes", "servicos", "agendamentos", "produtos", "movimentacoes_estoque", "vendas", "venda_itens", "avaliacoes", "fidelidade_config", "fidelidade_pontos", "fidelidade_historico", "metas_mensais"];
    const backupObj: Record<string, any> = {};
    tables.forEach(t => {
      backupObj[t] = fallbackDb.get(t, []);
    });

    const str = JSON.stringify(backupObj, null, 2);
    const blob = new Blob([str], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `backup_nailboss_completo.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Backup JSON exportado com sucesso!");
  };

  // Full backup restore imports
  const importJSONBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const backupObj = JSON.parse(event.target?.result as string);
        Object.keys(backupObj).forEach(key => {
          if (Array.isArray(backupObj[key])) {
            fallbackDb.set(key, backupObj[key]);
          }
        });
        toast.success("Backup JSON restaurado com sucesso! Recarregando dados.");
        qc.invalidateQueries();
      } catch (err) {
        toast.error("Formato de arquivo inválido. Selecione um arquivo de backup correto.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <>
      <div className="print-report-container hidden print:block bg-white text-black p-8 max-w-4xl mx-auto space-y-6">
        <div className="border-b pb-4 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold font-serif">Relatório Mensal Nail Boss</h1>
            <p className="text-sm text-gray-500">Mês de Referência: {selectedMonth}</p>
          </div>
          <div className="text-right text-xs text-gray-400">Gerado em: {format(new Date(), "dd/MM/yyyy HH:mm")}</div>
        </div>

        <div className="grid grid-cols-3 gap-4 border p-4 rounded-xl">
          <div><span className="text-xs text-gray-500 block uppercase">Faturamento Concluído</span><span className="text-xl font-bold">{brl(currentMonthData.faturamentoReal)}</span></div>
          <div><span className="text-xs text-gray-500 block uppercase">Lucro Líquido Estimado</span><span className="text-xl font-bold">{brl(currentMonthData.lucroReal)}</span></div>
          <div><span className="text-xs text-gray-500 block uppercase">Serviços Concluídos</span><span className="text-xl font-bold">{currentMonthData.servicosQtd}</span></div>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-bold border-b pb-1">Desempenho por Serviços</h2>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b"><th className="py-2">Serviço</th><th className="py-2 text-right">Quantidade</th><th className="py-2 text-right">Faturamento</th></tr>
            </thead>
            <tbody>
              {serviceRanking.map(r => (
                <tr key={r.nome} className="border-b"><td className="py-2">{r.nome}</td><td className="py-2 text-right">{r.count}</td><td className="py-2 text-right">{brl(r.receita)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="print:hidden space-y-6">
        <PageHeader
          title="Relatórios & Metas"
          subtitle="Acompanhe estatísticas, configure metas do mês e exporte relatórios"
          actions={
            <div className="flex items-center gap-2">
              <Input type="month" className="w-40 h-9 text-xs" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} />
            </div>
          }
        />

        <div className="grid lg:grid-cols-3 gap-6">
          {/* LEFT: METAS MENSAIS */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl">Metas do Mês</h2>
              <MetaGoalDialog current={metaQuery.data} onSaved={() => qc.invalidateQueries({ queryKey: ["meta_mensal", selectedMonth] })} />
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {/* Goal 1: Revenue */}
              <Card className="glass border-0 rounded-2xl p-5 space-y-3">
                <div className="flex justify-between items-start">
                  <div className="size-9 rounded-xl bg-primary/10 grid place-items-center"><TrendingUp className="size-4 text-primary" /></div>
                  <Badge variant="secondary" className="text-[10px]">Faturamento</Badge>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block uppercase">Faturamento Realizado</span>
                  <span className="font-display text-2xl font-bold text-primary">{brl(currentMonthData.faturamentoReal)}</span>
                  <span className="text-xs text-muted-foreground mt-0.5 block">Meta: {brl(metaQuery.data?.faturamento_alvo ?? 0)}</span>
                </div>
                <Progress value={metaQuery.data?.faturamento_alvo ? (currentMonthData.faturamentoReal / metaQuery.data.faturamento_alvo) * 100 : 0} className="h-1.5" />
              </Card>

              {/* Goal 2: Profit */}
              <Card className="glass border-0 rounded-2xl p-5 space-y-3">
                <div className="flex justify-between items-start">
                  <div className="size-9 rounded-xl bg-emerald-500/10 grid place-items-center"><Target className="size-4 text-emerald-500" /></div>
                  <Badge variant="secondary" className="text-[10px]">Lucro Líquido</Badge>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block uppercase">Lucro Realizado</span>
                  <span className="font-display text-2xl font-bold text-emerald-500">{brl(currentMonthData.lucroReal)}</span>
                  <span className="text-xs text-muted-foreground mt-0.5 block">Meta: {brl(metaQuery.data?.lucro_alvo ?? 0)}</span>
                </div>
                <Progress value={metaQuery.data?.lucro_alvo ? (currentMonthData.lucroReal / metaQuery.data.lucro_alvo) * 100 : 0} className="h-1.5" />
              </Card>

              {/* Goal 3: Services count */}
              <Card className="glass border-0 rounded-2xl p-5 space-y-3">
                <div className="flex justify-between items-start">
                  <div className="size-9 rounded-xl bg-amber-500/10 grid place-items-center"><Award className="size-4 text-amber-500" /></div>
                  <Badge variant="secondary" className="text-[10px]">Serviços</Badge>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block uppercase">Serviços Concluídos</span>
                  <span className="font-display text-2xl font-bold text-amber-500">{currentMonthData.servicosQtd}</span>
                  <span className="text-xs text-muted-foreground mt-0.5 block">Meta: {metaQuery.data?.servicos_alvo ?? 0} un</span>
                </div>
                <Progress value={metaQuery.data?.servicos_alvo ? (currentMonthData.servicosQtd / metaQuery.data.servicos_alvo) * 100 : 0} className="h-1.5" />
              </Card>
            </div>

            {/* Smart Analytics insights */}
            <div className="space-y-4">
              <h2 className="font-display text-xl">Análises Inteligentes</h2>
              <div className="grid md:grid-cols-2 gap-4">
                {/* Insights values */}
                <Card className="glass border-0 rounded-2xl p-5 space-y-4">
                  <h3 className="font-display text-base">Métricas Operacionais</h3>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center border-b border-border/40 pb-2">
                      <span className="text-xs text-muted-foreground">Ticket Médio por Atendimento:</span>
                      <span className="font-display font-bold text-sm">{brl(insights.ticketMedio)}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-border/40 pb-2">
                      <span className="text-xs text-muted-foreground">Projeção Faturamento Fim de Mês:</span>
                      <span className="font-display font-bold text-sm text-primary">{brl(insights.projetado)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Faturamento com Vendas:</span>
                      <span className="font-display font-bold text-sm">
                        {brl(currentMonthData.monthSales.reduce((s, x) => s + Number(x.total), 0))}
                      </span>
                    </div>
                  </div>
                </Card>

                {/* Inactive clients alerts */}
                <Card className="glass border-0 rounded-2xl p-5 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-display text-base">Clientes Sumidos (&gt;30 dias)</h3>
                    <Badge variant="destructive" className="rounded-full text-[10px]">{insights.inactiveCount} Clientes</Badge>
                  </div>

                  {insights.inactiveList.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">Todos os clientes ativos recentemente!</p>
                  ) : (
                    <div className="space-y-2">
                      {insights.inactiveList.map((c: any) => (
                        <div key={c.id} className="flex justify-between items-center bg-accent/40 px-3 py-1.5 rounded-xl text-xs">
                          <span className="font-medium">{c.nome}</span>
                          <span className="text-[10px] text-muted-foreground">{c.telefone || "Sem telefone"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </div>

            {/* Ranking of Services */}
            <div className="space-y-4">
              <h2 className="font-display text-xl">Ranking de Serviços</h2>
              <Card className="glass border-0 rounded-2xl overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Posição</TableHead>
                      <TableHead>Serviço</TableHead>
                      <TableHead className="text-center">Quantidade Realizada</TableHead>
                      <TableHead className="text-right">Faturamento Gerado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {serviceRanking.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">
                          Sem serviços realizados neste mês.
                        </TableCell>
                      </TableRow>
                    ) : (
                      serviceRanking.map((r, i) => (
                        <TableRow key={r.nome}>
                          <TableCell className="font-bold">#{i + 1}</TableCell>
                          <TableCell className="font-medium">{r.nome}</TableCell>
                          <TableCell className="text-center">{r.count} un</TableCell>
                          <TableCell className="text-right font-display text-primary font-bold">{brl(r.receita)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Card>
            </div>
          </div>

          {/* RIGHT: EXPORTS & BACKUP SETTINGS */}
          <div className="space-y-6">
            <h2 className="font-display text-xl">Relatórios & Backups</h2>

            {/* Exports */}
            <Card className="glass border-0 rounded-2xl p-5 space-y-4">
              <div>
                <h3 className="font-display text-base">Exportar Dados</h3>
                <p className="text-[10px] text-muted-foreground">Gere arquivos de auditoria para impressão ou planilhas</p>
              </div>
              <div className="space-y-2">
                <Button className="w-full justify-start glass border-0 hover:bg-accent/40" variant="outline" onClick={exportPDF}>
                  <FileText className="size-4 mr-2 text-primary" /> Imprimir Relatório (PDF)
                </Button>
                <Button className="w-full justify-start glass border-0 hover:bg-accent/40" variant="outline" onClick={exportExcel}>
                  <FileSpreadsheet className="size-4 mr-2 text-emerald-500" /> Exportar para Excel (CSV)
                </Button>
              </div>
            </Card>

            {/* System Backups */}
            <Card className="glass border-0 rounded-2xl p-5 space-y-4">
              <div>
                <h3 className="font-display text-base">Backup Geral do Sistema</h3>
                <p className="text-[10px] text-muted-foreground">Exporta ou restaura clientes, produtos, vendas, agendamentos e metas</p>
              </div>
              <div className="space-y-3">
                <Button className="w-full gradient-primary text-primary-foreground shadow-glow justify-center" onClick={exportJSONBackup}>
                  <Download className="size-4 mr-2" /> Exportar Backup JSON
                </Button>

                <div className="relative">
                  <input type="file" accept=".json" id="import-backup-file" className="hidden" onChange={importJSONBackup} />
                  <Button className="w-full glass border-0 hover:bg-accent/40 justify-center" variant="outline" asChild>
                    <label htmlFor="import-backup-file" className="cursor-pointer flex items-center justify-center">
                      <Upload className="size-4 mr-2 text-primary" /> Importar Backup JSON
                    </label>
                  </Button>
                </div>

                <span className="text-[9px] text-muted-foreground block text-center leading-relaxed">
                  Atenção: Ao restaurar um backup JSON local, os dados locais atuais serão substituídos pelos dados do arquivo.
                </span>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

// Dialog: Meta Goal configure
function MetaGoalDialog({ current, onSaved }: { current: MetaMensal | null | undefined; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    faturamento_alvo: current?.faturamento_alvo ?? 3000,
    lucro_alvo: current?.lucro_alvo ?? 2000,
    servicos_alvo: current?.servicos_alvo ?? 50,
  });

  const mut = useMutation({
    mutationFn: async () => {
      // triggers mutation
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="glass hover:bg-accent/40 h-9 text-xs"><Target className="size-3.5 mr-1" /> Configurar Metas</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Definir Metas do Mês</DialogTitle>
        </DialogHeader>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const p = {
            faturamento_alvo: Number(form.faturamento_alvo),
            lucro_alvo: Number(form.lucro_alvo),
            servicos_alvo: Number(form.servicos_alvo)
          };
          // Call direct mutation
          const qc = useQueryClient();
          try {
            const user = (await supabase.auth.getUser()).data.user;
            if (current) {
              await supabase.from("metas_mensais").update(p).eq("id", current.id);
            } else {
              // Get selectedMonth
              const activeMonth = format(new Date(), "yyyy-MM");
              await supabase.from("metas_mensais").insert({
                user_id: user!.id,
                mes_ano: activeMonth,
                ...p
              });
            }
          } catch {
            const activeMonth = format(new Date(), "yyyy-MM");
            const local = fallbackDb.get<MetaMensal>("metas_mensais", []);
            const idx = local.findIndex(x => x.mes_ano === activeMonth);
            if (idx !== -1) {
              local[idx] = { ...local[idx], ...p };
            } else {
              local.push({
                id: crypto.randomUUID(),
                mes_ano: activeMonth,
                ...p
              });
            }
            fallbackDb.set("metas_mensais", local);
          }
          toast.success("Metas salvas com sucesso!");
          onSaved();
          setOpen(false);
        }} className="space-y-4">
          <div>
            <Label>Meta de Faturamento (R$)</Label>
            <Input type="number" value={form.faturamento_alvo} onChange={e => setForm({ ...form, faturamento_alvo: Number(e.target.value) })} required />
          </div>
          <div>
            <Label>Meta de Lucro Líquido (R$)</Label>
            <Input type="number" value={form.lucro_alvo} onChange={e => setForm({ ...form, lucro_alvo: Number(e.target.value) })} required />
          </div>
          <div>
            <Label>Meta de Serviços Concluídos (un)</Label>
            <Input type="number" value={form.servicos_alvo} onChange={e => setForm({ ...form, servicos_alvo: Number(e.target.value) })} required />
          </div>

          <DialogFooter>
            <Button type="submit" className="gradient-primary text-primary-foreground w-full">
              Salvar Metas
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
