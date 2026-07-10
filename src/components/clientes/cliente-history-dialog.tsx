import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Calendar, Clock, Banknote, CreditCard, MessageSquare,
  XCircle, CheckCircle, AlertCircle, TrendingUp, CalendarDays,
  Star, User, Hash, FileText,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Cliente = {
  id: string; nome: string; telefone: string | null; email: string | null;
  data_nascimento: string | null; observacoes: string | null; alergias: string | null; servico_favorito: string | null;
  created_at?: string;
};

type AgendamentoCompleto = {
  id: string;
  data_hora: string;
  valor: number;
  custo: number;
  status: "agendado" | "confirmado" | "concluido" | "cancelado";
  pagamento: "pix" | "dinheiro" | "debito" | "credito" | "pendente";
  observacoes: string | null;
  servicos: { nome: string } | null;
};

const statusLabels: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  agendado: { label: "Agendado", color: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30", icon: AlertCircle },
  confirmado: { label: "Confirmado", color: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30", icon: CheckCircle },
  concluido: { label: "Concluído", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30", icon: CheckCircle },
  cancelado: { label: "Cancelado", color: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30", icon: XCircle },
};

const pagamentoLabels: Record<string, string> = {
  pix: "PIX",
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
  pendente: "Pendente",
};

function StatCard({ icon: Icon, label, value, sub }: {
  icon: typeof Star; label: string; value: string | number; sub?: string;
}) {
  return (
    <Card className="bg-card border border-border rounded-2xl p-4 shadow-card hover:border-[#D946EF]/20 transition-all">
      <div className="flex items-start gap-3">
        <div className="size-9 rounded-xl bg-[#D946EF]/10 border border-[#D946EF]/20 grid place-items-center shrink-0">
          <Icon className="size-4 text-[#D946EF]" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-lg font-semibold text-card-foreground mt-0.5">{value}</p>
          {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </div>
    </Card>
  );
}

export function ClienteHistoryDialog({
  cliente, open, onOpenChange,
}: {
  cliente: Cliente;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: agendamentos, isLoading } = useQuery({
    queryKey: ["cliente-historico", cliente.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("*, servicos(nome)")
        .eq("cliente_id", cliente.id)
        .order("data_hora", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AgendamentoCompleto[];
    },
    enabled: open,
  });

  const stats = {
    total: agendamentos?.filter(a => a.status === "concluido").length ?? 0,
    totalCancelados: agendamentos?.filter(a => a.status === "cancelado").length ?? 0,
    totalGasto: agendamentos?.filter(a => a.status === "concluido").reduce((s, a) => s + Number(a.valor), 0) ?? 0,
    primeiraVisita: agendamentos?.length
      ? [...agendamentos].reverse().find(a => a.status === "concluido")?.data_hora ?? null
      : null,
    ultimaVisita: agendamentos?.find(a => a.status === "concluido")?.data_hora ?? null,
    servicoMaisRealizado: (() => {
      if (!agendamentos) return null;
      const servicosConcluidos = agendamentos.filter(a => a.status === "concluido" && a.servicos?.nome);
      if (!servicosConcluidos.length) return null;
      const freq: Record<string, number> = {};
      servicosConcluidos.forEach(a => {
        const nome = a.servicos!.nome;
        freq[nome] = (freq[nome] ?? 0) + 1;
      });
      return Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
    })(),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl flex items-center gap-3">
            <div className="size-10 rounded-xl bg-[#D946EF]/10 border border-[#D946EF]/20 grid place-items-center">
              <User className="size-5 text-[#D946EF]" />
            </div>
            <div className="min-w-0">
              <span className="truncate block">{cliente.nome}</span>
              <p className="text-xs font-normal text-muted-foreground">Histórico completo da cliente</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-24 rounded-2xl bg-muted" />)}
            </div>
            <Skeleton className="h-64 rounded-2xl bg-muted" />
          </div>
        ) : !agendamentos?.length ? (
          <div className="py-12 text-center">
            <div className="size-16 rounded-2xl bg-[#D946EF]/10 border border-[#D946EF]/20 grid place-items-center mx-auto mb-4">
              <CalendarDays className="size-7 text-[#D946EF]" />
            </div>
            <p className="text-muted-foreground">Nenhum agendamento encontrado para esta cliente.</p>
            <p className="text-xs text-muted-foreground mt-1">O histórico será preenchido automaticamente conforme novos atendimentos forem registrados.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-6 py-2">
            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard
                icon={Hash}
                label="Total de Atendimentos"
                value={stats.total}
                sub={stats.totalCancelados > 0 ? `${stats.totalCancelados} cancelamento${stats.totalCancelados > 1 ? "s" : ""}` : undefined}
              />
              <StatCard
                icon={TrendingUp}
                label="Valor Total Gasto"
                value={stats.totalGasto.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              />
              <StatCard
                icon={CalendarDays}
                label="Primeira Visita"
                value={stats.primeiraVisita
                  ? format(new Date(stats.primeiraVisita), "dd/MM/yyyy")
                  : "—"}
              />
              <StatCard
                icon={Calendar}
                label="Última Visita"
                value={stats.ultimaVisita
                  ? format(new Date(stats.ultimaVisita), "dd/MM/yyyy")
                  : "—"}
                sub={stats.ultimaVisita
                  ? format(new Date(stats.ultimaVisita), "HH:mm")
                  : undefined}
              />
              <StatCard
                icon={Star}
                label="Serviço Mais Realizado"
                value={stats.servicoMaisRealizado?.[0] ?? "—"}
                sub={stats.servicoMaisRealizado
                  ? `${stats.servicoMaisRealizado[1]} vez${stats.servicoMaisRealizado[1] > 1 ? "es" : ""}`
                  : undefined}
              />
              <StatCard
                icon={User}
                label="Cliente desde"
                value={cliente.created_at
                  ? format(new Date(cliente.created_at), "dd/MM/yyyy")
                  : "—"}
              />
            </div>

            {/* Timeline */}
            <div className="space-y-3">
              <h3 className="font-display text-lg font-semibold text-card-foreground flex items-center gap-2">
                <FileText className="size-4 text-[#D946EF]" />
                Todos os Atendimentos
                <Badge variant="outline" className="ml-auto text-[10px] bg-[#D946EF]/5 border-[#D946EF]/20 text-muted-foreground">
                  {agendamentos.length} registro{agendamentos.length !== 1 ? "s" : ""}
                </Badge>
              </h3>

              <div className="space-y-2">
                {agendamentos.map((ag, idx) => {
                  const st = statusLabels[ag.status];
                  const StatusIcon = st.icon;
                  const isConcluido = ag.status === "concluido";
                  const isCancelado = ag.status === "cancelado";

                  return (
                    <Card
                      key={ag.id}
                      className={`bg-card border border-border rounded-2xl p-4 shadow-card transition-all ${
                        isCancelado ? "opacity-70" : "hover:border-[#D946EF]/30"
                      } ${idx === 0 && isConcluido ? "ring-1 ring-[#D946EF]/20" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          {/* Date badge */}
                          <div className={`size-14 rounded-2xl grid place-items-center shrink-0 text-center leading-none border ${
                            isCancelado
                              ? "bg-rose-500/10 border-rose-500/20 text-rose-500"
                              : isConcluido
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                                : "bg-amber-500/10 border-amber-500/20 text-amber-500"
                          }`}>
                            <div>
                              <div className="text-[10px] font-medium opacity-70 uppercase">
                                {format(new Date(ag.data_hora), "MMM", { locale: ptBR })}
                              </div>
                              <div className="text-lg font-bold">
                                {format(new Date(ag.data_hora), "dd")}
                              </div>
                            </div>
                          </div>

                          <div className="min-w-0 space-y-1.5">
                            <div className="flex items-center flex-wrap gap-2">
                              <h4 className="font-medium text-sm text-card-foreground">
                                {ag.servicos?.nome ?? "Serviço"}
                              </h4>
                              <Badge variant="outline" className={`text-[10px] ${st.color}`}>
                                <StatusIcon className="size-3 mr-1" />
                                {st.label}
                              </Badge>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1.5">
                                <Calendar className="size-3.5" />
                                {format(new Date(ag.data_hora), "dd/MM/yyyy")}
                              </span>
                              <span className="flex items-center gap-1.5">
                                <Clock className="size-3.5" />
                                {format(new Date(ag.data_hora), "HH:mm")}
                              </span>
                              {isConcluido && ag.pagamento && (
                                <span className="flex items-center gap-1.5">
                                  <CreditCard className="size-3.5" />
                                  {pagamentoLabels[ag.pagamento] ?? ag.pagamento}
                                </span>
                              )}
                              {isConcluido && (
                                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                                  <Banknote className="size-3.5" />
                                  {Number(ag.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                </span>
                              )}
                            </div>

                            {ag.observacoes && (
                              <p className="flex items-start gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-lg p-2 mt-1">
                                <MessageSquare className="size-3.5 mt-0.5 shrink-0" />
                                <span>{ag.observacoes}</span>
                              </p>
                            )}

                            {isCancelado && (
                              <p className="flex items-center gap-1.5 text-xs text-rose-500 font-medium">
                                <XCircle className="size-3.5" />
                                Cliente não compareceu / Atendimento cancelado
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
