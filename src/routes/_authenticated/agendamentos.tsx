import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useMemo } from "react";
import { usePageTitle } from "@/hooks/use-page-title";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Pencil,
  Trash2,
  Calendar,
  Clock,
  CalendarDays,
  ArrowRight,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Gift,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { mensagemErroAmigavel } from "@/lib/user-errors";
import { abrirWhatsApp, mensagens, type DadosMensagem } from "@/lib/whatsapp";
import {
  melhorCupom,
  melhorDesconto,
  descontoAniversario,
  validarCupom,
  paraCupom,
  brl,
  COLUNAS_CUPOM,
} from "@/lib/cupons-logica";
import { consumirCupomInterno } from "@/lib/cupons.functions";
import {
  gerarSlots,
  avaliarHorario,
  dataLocalKey,
  type HorarioTrabalho,
  type IntervaloExpediente,
  type BloqueioAgenda,
  type AgendamentoOcupado,
} from "@/lib/expediente-logica";
import { z } from "zod";
import {
  format,
  addDays,
  subMonths,
  addMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { BloqueioHorariosDialog } from "@/components/agenda/bloqueio-horarios-dialog";

export const Route = createFileRoute("/_authenticated/agendamentos")({
  validateSearch: (s: Record<string, unknown>) => ({ new: s.new ? 1 : undefined }),
  component: AgendamentosPage,
});

type Status = "agendado" | "confirmado" | "concluido" | "cancelado";
type Pagamento = "pix" | "dinheiro" | "debito" | "credito" | "pendente";

type Ag = {
  id: string;
  cliente_id: string | null;
  servico_id: string | null;
  data_hora: string;
  duracao_min: number;
  valor: number;
  custo: number;
  status: Status;
  pagamento: Pagamento;
  observacoes: string | null;
};

const statusColor: Record<Status, string> = {
  agendado: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  confirmado: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  concluido: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  cancelado: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
};

// Rótulos legíveis dos status (evita exibir "concluido" sem acento para a usuária)
const statusLabel: Record<Status, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

const schema = z.object({
  cliente_id: z.string().uuid("Selecione uma cliente"),
  servico_id: z.string().uuid("Selecione um serviço"),
  data: z.string().min(1, "Informe a data"),
  hora: z.string().min(1, "Informe a hora"),
  valor: z.number().min(0),
  custo: z.number().min(0),
  duracao_min: z.number().min(15).max(600),
  status: z.enum(["agendado", "confirmado", "concluido", "cancelado"]),
  pagamento: z.enum(["pix", "dinheiro", "debito", "credito", "pendente"]),
  observacoes: z.string().max(500).optional().or(z.literal("")),
});

function AgendamentosPage() {
  usePageTitle("Agendamentos — Manicure Fácil");

  const qc = useQueryClient();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [openNew, setOpenNew] = useState(false);
  const [viewMode, setViewMode] = useState<"lista" | "calendario">("calendario");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [keyboardDragId, setKeyboardDragId] = useState<string | null>(null);
  const [keyboardDragSource, setKeyboardDragSource] = useState<string | null>(null);

  // Drag & Drop mutation
  const moveAgMut = useMutation({
    mutationFn: async ({ id, newDate }: { id: string; newDate: string }) => {
      const { error } = await supabase
        .from("agendamentos")
        .update({ data_hora: newDate })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agendamentos"] });
      toast.success("Agendamento movido!");
    },
    onError: (e: Error) => toast.error(mensagemErroAmigavel(e.message)),
  });

  useEffect(() => {
    if (search.new) {
      setOpenNew(true);
      navigate({ to: "/agendamentos", search: {} as never, replace: true });
    }
  }, [search.new, navigate]);

  const { data: ags, isLoading } = useQuery({
    queryKey: ["agendamentos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("*, clientes(nome, telefone), servicos(nome)")
        .order("data_hora", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Calendar helpers
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  // Today's appointments for quick view
  const hoje = ags?.filter((a) => isSameDay(new Date(a.data_hora), new Date())) ?? [];

  // Agendamentos por dia (para calendário)
  const agsByDay = useMemo(() => {
    const map = new Map<string, NonNullable<typeof ags>[number][]>();
    (ags ?? []).forEach((a) => {
      const key = format(new Date(a.data_hora), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    });
    return map;
  }, [ags]);

  // Drag & Drop handlers
  function handleDragStart(e: React.DragEvent, agId: string, agDate: string) {
    e.dataTransfer.setData("text/plain", JSON.stringify({ id: agId, data_hora: agDate }));
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, dayKey: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDay(dayKey);
  }

  function handleDrop(e: React.DragEvent, targetDay: string) {
    e.preventDefault();
    setDragOverDay(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData("text/plain"));
      if (data.id && data.data_hora) {
        const oldDate = new Date(data.data_hora);
        const newDate = new Date(targetDay + "T" + format(oldDate, "HH:mm:ss"));
        if (newDate.getTime() !== oldDate.getTime()) {
          moveAgMut.mutate({ id: data.id, newDate: newDate.toISOString() });
        }
      }
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <PageHeader
        title="Agendamentos"
        subtitle="Sua agenda visual"
        actions={
          <div className="flex items-center gap-2">
            <div className="flex bg-muted/50 rounded-xl p-0.5 border border-border/50">
              <button
                onClick={() => setViewMode("calendario")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${viewMode === "calendario" ? "bg-gradient-to-r from-[#D946EF] to-[#A855F7] text-white shadow-glow" : "text-muted-foreground hover:text-foreground"}`}
              >
                <CalendarDays className="size-3.5 inline mr-1" />
                Calendário
              </button>
              <button
                onClick={() => setViewMode("lista")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${viewMode === "lista" ? "bg-gradient-to-r from-[#D946EF] to-[#A855F7] text-white shadow-glow" : "text-muted-foreground hover:text-foreground"}`}
              >
                Lista
              </button>
            </div>
            <BloqueioHorariosDialog />
            <AgendamentoDialog
              open={openNew}
              setOpen={setOpenNew}
              onSaved={() => qc.invalidateQueries({ queryKey: ["agendamentos"] })}
            />
          </div>
        }
      />

      {/* Today's quick agenda */}
      {hoje.length > 0 && (
        <div className="bg-gradient-to-br from-[#D946EF]/5 via-[#A855F7]/5 to-transparent border border-[#D946EF]/10 rounded-[20px] p-4 mb-6">
          <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
            <CalendarDays className="size-3.5 text-[#D946EF]" />
            Hoje • {hoje.length} agendamento{hoje.length > 1 ? "s" : ""}
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {" "}
            {hoje.slice(0, 5).map((a) => (
              <div
                key={a.id}
                className="shrink-0 bg-card/80 backdrop-blur-sm border border-border/60 rounded-xl p-3 min-w-[180px]"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-card-foreground">
                    {format(new Date(a.data_hora), "HH:mm")}
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[9px] ${statusColor[a.status as Status]}`}
                  >
                    {statusLabel[a.status as Status] ?? a.status}
                  </Badge>
                </div>
                <p className="text-xs font-medium truncate text-card-foreground">
                  {a.clientes?.nome ?? "Cliente"}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {a.servicos?.nome ?? "Serviço"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {viewMode === "calendario" ? (
        <Card className="bg-card border border-border rounded-[20px] shadow-card overflow-hidden">
          {/* Calendar Header */}
          <div className="flex items-center justify-between p-4 border-b border-border/40">
            <button
              onClick={() => setCurrentDate(subMonths(currentDate, 1))}
              className="p-2 rounded-xl hover:bg-accent/40 transition-colors"
              aria-label="Mês anterior"
            >
              <ChevronLeft className="size-4" />
            </button>
            <h3 className="font-display text-base font-semibold">
              {format(currentDate, "MMMM 'de' yyyy", { locale: ptBR })}
            </h3>
            <button
              onClick={() => setCurrentDate(addMonths(currentDate, 1))}
              className="p-2 rounded-xl hover:bg-accent/40 transition-colors"
              aria-label="Próximo mês"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          {/* Calendar Grid */}
          <div className="p-4">
            <div className="grid grid-cols-7 gap-px">
              {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
                <div
                  key={d}
                  className="text-center text-[10px] text-muted-foreground uppercase tracking-wider font-medium py-2"
                >
                  {d}
                </div>
              ))}
              {days.map((day, i) => {
                const dayKey = format(day, "yyyy-MM-dd");
                const dayAgs = agsByDay.get(dayKey) ?? [];
                const isCurrentMonth = isSameMonth(day, currentDate);
                const isDayToday = isToday(day);
                const isDragOver = dragOverDay === dayKey;

                return (
                  <div
                    key={i}
                    role="gridcell"
                    aria-label={`${format(day, "dd 'de' MMMM")}${dayAgs.length > 0 ? `, ${dayAgs.length} agendamento${dayAgs.length > 1 ? "s" : ""}` : ""}${keyboardDragId ? ". Pressione Enter para soltar agendamento aqui." : ""}`}
                    tabIndex={isCurrentMonth ? 0 : -1}
                    onKeyDown={(e) => {
                      if (keyboardDragId && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        // Drop the appointment on this day
                        const oldDate = new Date(keyboardDragSource + "T00:00:00");
                        const newDate = new Date(dayKey + "T" + format(oldDate, "HH:mm:ss"));
                        if (newDate.getTime() !== oldDate.getTime()) {
                          moveAgMut.mutate({ id: keyboardDragId, newDate: newDate.toISOString() });
                        }
                        setKeyboardDragId(null);
                        setKeyboardDragSource(null);
                        return;
                      }
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        // Focus first appointment or open new dialog for this day
                        const firstAg = dayAgs[0];
                        if (firstAg) {
                          const el = document.getElementById(`ag-${firstAg.id}`);
                          el?.focus();
                        }
                      }
                      if (e.key === "Escape" && keyboardDragId) {
                        setKeyboardDragId(null);
                        setKeyboardDragSource(null);
                        toast.info("Movimento cancelado");
                      }
                    }}
                    onDragOver={(e) => handleDragOver(e, dayKey)}
                    onDrop={(e) => handleDrop(e, dayKey)}
                    onDragLeave={() => setDragOverDay(null)}
                    className={`min-h-[80px] border border-border/30 rounded-lg p-1.5 transition-all ${
                      !isCurrentMonth
                        ? "opacity-30"
                        : "hover:bg-accent/20 focus-visible:ring-2 focus-visible:ring-[#D946EF] focus-visible:outline-none"
                    } ${isDayToday ? "ring-1 ring-[#D946EF]/30 bg-[#D946EF]/5" : ""} ${isDragOver ? "ring-2 ring-[#D946EF] bg-[#D946EF]/10" : ""}`}
                  >
                    <div
                      className={`text-[10px] font-medium mb-1 ${isDayToday ? "text-[#D946EF]" : "text-muted-foreground"}`}
                    >
                      {format(day, "dd")}
                    </div>
                    <div className="space-y-0.5">
                      {dayAgs.slice(0, 3).map((a) => (
                        <div
                          key={a.id}
                          id={`ag-${a.id}`}
                          draggable
                          tabIndex={0}
                          role="button"
                          aria-label={`${format(new Date(a.data_hora), "HH:mm")} - ${a.clientes?.nome ?? "Cliente"} - ${statusLabel[a.status as Status] ?? a.status}`}
                          onDragStart={(e) => handleDragStart(e, a.id, a.data_hora)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              if (keyboardDragId === a.id) {
                                // Drop on same day — cancel
                                setKeyboardDragId(null);
                                setKeyboardDragSource(null);
                                toast.info("Movimento cancelado");
                              } else if (keyboardDragId) {
                                // We're in a different day cell — this shouldn't happen via this handler
                                // But if it does, drop on current cell's day
                                setKeyboardDragId(null);
                                setKeyboardDragSource(null);
                                toast.info("Movimento cancelado");
                              } else {
                                // Pick up this appointment
                                toast.info(
                                  `Agendamento selecionado: ${a.clientes?.nome ?? "Cliente"}. Use Tab para navegar até o dia desejado e pressione Enter para soltar.`,
                                );
                                setKeyboardDragId(a.id);
                                setKeyboardDragSource(format(new Date(a.data_hora), "yyyy-MM-dd"));
                              }
                            }
                            if (e.key === "Escape" && keyboardDragId) {
                              setKeyboardDragId(null);
                              setKeyboardDragSource(null);
                              toast.info("Movimento cancelado");
                            }
                          }}
                          className={`text-[8px] leading-tight px-1 py-0.5 rounded truncate cursor-grab active:cursor-grabbing transition-colors focus-visible:ring-2 focus-visible:ring-[#D946EF] focus-visible:outline-none ${keyboardDragId === a.id ? "ring-2 ring-amber-500 bg-amber-500/20" : ""} ${
                            a.status === "cancelado"
                              ? "bg-rose-500/15 text-rose-500 line-through"
                              : a.status === "concluido"
                                ? "bg-emerald-500/15 text-emerald-500"
                                : a.status === "confirmado"
                                  ? "bg-blue-500/15 text-blue-400"
                                  : "bg-[#D946EF]/10 text-[#D946EF]"
                          }`}
                        >
                          {format(new Date(a.data_hora), "HH:mm")} {a.clientes?.nome ?? ""}
                        </div>
                      ))}
                      {dayAgs.length > 3 && (
                        <div className="text-[8px] text-muted-foreground px-1">
                          +{dayAgs.length - 3} mais
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      ) : (
        /* View: List */
        <div className="space-y-3">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-28 rounded-[20px] bg-muted" />
              ))}
            </div>
          ) : !ags?.length ? (
            <Card className="bg-card border border-border rounded-[20px] p-12 text-center shadow-card">
              <div className="size-16 rounded-2xl bg-[#D946EF]/10 border border-[#D946EF]/20 grid place-items-center mx-auto mb-4">
                <CalendarDays className="size-7 text-[#D946EF]" />
              </div>
              <p className="text-muted-foreground">
                Nenhum agendamento ainda. Clique em <strong className="text-[#D946EF]">Novo</strong>{" "}
                para começar.
              </p>
            </Card>
          ) : (
            ags.map((a) => (
              <Card
                key={a.id}
                className="group bg-card border border-border p-5 rounded-[20px] shadow-card hover:border-[#D946EF]/30 transition-all duration-300"
              >
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="size-14 rounded-2xl bg-[#D946EF]/10 border border-[#D946EF]/20 text-[#D946EF] grid place-items-center shrink-0 text-center leading-none">
                      <div>
                        <div className="text-[10px] font-medium opacity-70">
                          {format(new Date(a.data_hora), "MMM", { locale: ptBR }).toUpperCase()}
                        </div>
                        <div className="text-xl font-bold">
                          {format(new Date(a.data_hora), "dd")}
                        </div>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-medium truncate text-base text-card-foreground">
                        {a.clientes?.nome ?? "Cliente"}
                      </h3>
                      <p className="text-sm text-muted-foreground truncate">
                        {a.servicos?.nome ?? "Serviço"}
                      </p>
                      <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="size-3.5" />
                          {format(new Date(a.data_hora), "dd/MM/yyyy")}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="size-3.5" />
                          {format(new Date(a.data_hora), "HH:mm")}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-xl font-semibold text-card-foreground">
                        {Number(a.valor).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </div>
                      <Badge
                        variant="outline"
                        className={statusColor[a.status as Status] + " mt-1"}
                      >
                        {statusLabel[a.status as Status] ?? a.status}
                      </Badge>
                    </div>
                    <WhatsAg a={a} />
                    <AgendamentoDialog
                      ag={a}
                      onSaved={() => qc.invalidateQueries({ queryKey: ["agendamentos"] })}
                      trigger={
                        <Button
                          size="icon"
                          variant="ghost"
                          className="hover:bg-[#D946EF]/10 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
                        >
                          <Pencil className="size-4 text-[#D946EF]" />
                        </Button>
                      }
                    />
                    <DeleteAg
                      id={a.id}
                      onDone={() => qc.invalidateQueries({ queryKey: ["agendamentos"] })}
                    />
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </>
  );
}

function DeleteAg({ id, onDone }: { id: string; onDone: () => void }) {
  const { confirm } = useConfirm();
  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("agendamentos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agendamento removido");
      onDone();
    },
    onError: (e: Error) => toast.error(mensagemErroAmigavel(e.message)),
  });
  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={() => {
        confirm({
          title: "Excluir agendamento?",
          description:
            "Esta ação não pode ser desfeita. O horário será liberado para novos agendamentos.",
          confirmText: "Sim, excluir",
          cancelText: "Cancelar",
          variant: "danger",
          onConfirm: () => mut.mutate(),
        });
      }}
    >
      <Trash2 className="size-4 text-destructive" />
    </Button>
  );
}

type AgComRelacoes = {
  data_hora: string;
  valor: number;
  status: Status;
  clientes: { nome: string | null; telefone: string | null } | null;
  servicos: { nome: string | null } | null;
};

/**
 * WhatsApp do atendimento: escolhe a mensagem conforme o status
 * (lembrete, confirmação, agradecimento ou convite de reagendamento).
 */
function WhatsAg({ a }: { a: AgComRelacoes }) {
  const telefone = a.clientes?.telefone;
  if (!telefone) return null;

  const tipo =
    a.status === "concluido"
      ? "agradecimento"
      : a.status === "cancelado"
        ? "reagendamento"
        : a.status === "confirmado"
          ? "confirmacao"
          : "lembrete";

  const rotulo = {
    lembrete: "Enviar lembrete no WhatsApp",
    confirmacao: "Confirmar horário no WhatsApp",
    agradecimento: "Agradecer pelo atendimento",
    reagendamento: "Convidar para reagendar",
  }[tipo];

  const dados: DadosMensagem = {
    cliente: a.clientes?.nome ?? "cliente",
    dataHora: a.data_hora,
    servico: a.servicos?.nome ?? null,
    valor: a.valor,
  };

  return (
    <Button
      size="icon"
      variant="ghost"
      className="hover:bg-[#25D366]/15 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
      aria-label={rotulo}
      title={rotulo}
      onClick={() => {
        if (!abrirWhatsApp(telefone, mensagens[tipo](dados))) {
          toast.error("Número de WhatsApp inválido. Edite o telefone desta cliente.");
        }
      }}
    >
      <MessageCircle className="size-4 text-[#25D366]" aria-hidden="true" />
    </Button>
  );
}

function AgendamentoDialog({
  ag,
  onSaved,
  trigger,
  open: openProp,
  setOpen: setOpenProp,
}: {
  ag?: Ag;
  onSaved: () => void;
  trigger?: React.ReactNode;
  open?: boolean;
  setOpen?: (o: boolean) => void;
}) {
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp ?? openInternal;
  const setOpen = setOpenProp ?? setOpenInternal;

  const [recorrente, setRecorrente] = useState(false);
  const [frequencia, setFrequencia] = useState<string>("semanal");
  const [aplicarDesconto, setAplicarDesconto] = useState(true);
  const [overrideExpediente, setOverrideExpediente] = useState(false);
  const [dataFim, setDataFim] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    return format(d, "yyyy-MM-dd");
  });

  const [form, setForm] = useState(() => {
    const d = ag ? new Date(ag.data_hora) : new Date();
    return {
      cliente_id: ag?.cliente_id ?? "",
      servico_id: ag?.servico_id ?? "",
      data: format(d, "yyyy-MM-dd"),
      hora: ag ? format(d, "HH:mm") : "09:00",
      valor: Number(ag?.valor ?? 0),
      custo: Number(ag?.custo ?? 0),
      duracao_min: ag?.duracao_min ?? 60,
      status: (ag?.status ?? "agendado") as Status,
      pagamento: (ag?.pagamento ?? "pendente") as Pagamento,
      observacoes: ag?.observacoes ?? "",
    };
  });

  const { data: clientes } = useQuery({
    queryKey: ["clientes-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id,nome,data_nascimento")
        .order("nome");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const { data: servicos } = useQuery({
    queryKey: ["servicos-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("servicos")
        .select("id,nome,valor,custo,duracao_min")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // F3: Find nearby available slots
  const { data: allBookingsData } = useQuery({
    queryKey: ["agendamentos-all"],
    queryFn: async () => {
      const u = (await supabase.auth.getUser()).data.user;
      if (!u) return [];
      const { data } = await supabase
        .from("agendamentos")
        .select("id, data_hora, duracao_min, status")
        .neq("status", "cancelado");
      return data ?? [];
    },
    enabled: open,
  });

  // ── Expediente configurável (horários, pausas e bloqueios) ─────────────
  const { data: expediente } = useQuery({
    queryKey: ["horarios-trabalho"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("horarios_trabalho")
        .select("dia_semana,hora_inicio,hora_fim,ativo");
      if (error) throw error;
      return (data ?? []).map((h) => ({
        dia_semana: Number(h.dia_semana),
        hora_inicio: h.hora_inicio,
        hora_fim: h.hora_fim,
        ativo: h.ativo,
      })) as HorarioTrabalho[];
    },
    enabled: open,
  });

  const { data: intervalos } = useQuery({
    queryKey: ["expediente-intervalos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expediente_intervalos")
        .select("dia_semana,nome,hora_inicio,hora_fim");
      if (error) return [] as IntervaloExpediente[];
      return (data ?? []).map((i) => ({
        dia_semana: Number(i.dia_semana),
        nome: i.nome,
        hora_inicio: i.hora_inicio,
        hora_fim: i.hora_fim,
      })) as IntervaloExpediente[];
    },
    enabled: open,
  });

  const { data: bloqueios } = useQuery({
    queryKey: ["bloqueios-agenda"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bloqueios_agenda")
        .select("data_inicio,data_fim,horario_inicio,horario_fim");
      if (error) throw error;
      return (data ?? []).map((b) => ({
        data_inicio: b.data_inicio,
        data_fim: b.data_fim,
        hora_inicio: b.horario_inicio,
        hora_fim: b.horario_fim,
      })) as BloqueioAgenda[];
    },
    enabled: open,
  });

  const { data: config } = useQuery({
    queryKey: ["configuracoes-expediente"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracoes")
        .select("permite_fora_expediente")
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: open,
  });
  const permiteForaExpediente = !!config?.permite_fora_expediente;

  // ── Cupons + aniversário (mesma lógica pura usada no servidor) ─────────
  const { data: promocoes } = useQuery({
    queryKey: ["promocoes-cupom"],
    queryFn: async () => {
      const { data, error } = await supabase.from("promocoes").select(COLUNAS_CUPOM);
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const { data: fid } = useQuery({
    queryKey: ["fidelidade-niver"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fidelidade_config")
        .select("niver_promo_ativa,niver_desconto_porcentagem")
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: open,
  });

  const baseValor = Number(form.valor) || 0;

  const cupons = useMemo(
    () => (promocoes ?? []).filter((p) => p.ativo).map(paraCupom),
    [promocoes],
  );

  const melhor = useMemo(
    () => melhorCupom(cupons, { base: baseValor, servicoId: form.servico_id || null }),
    [cupons, baseValor, form.servico_id],
  );

  const cuponsRejeitados = useMemo(
    () =>
      cupons
        .map((c) => ({
          nome: c.nome,
          r: validarCupom(c, { base: baseValor, servicoId: form.servico_id || null }),
        }))
        .filter((x) => !x.r.elegivel || x.r.motivo)
        .map((x) => ({ nome: x.nome, motivo: x.r.motivo ?? "Não elegível" })),
    [cupons, baseValor, form.servico_id],
  );

  const pctAniversario =
    fid?.niver_promo_ativa === true ? Number(fid.niver_desconto_porcentagem ?? 0) : 0;
  const clienteSel = (clientes ?? []).find((c) => c.id === form.cliente_id);
  const descontoAniv = descontoAniversario(
    baseValor,
    clienteSel?.data_nascimento ?? null,
    pctAniversario > 0,
    pctAniversario,
  );

  const fonte = melhorDesconto(melhor, descontoAniv, pctAniversario);
  const podeDescontar = !ag && !recorrente;
  const descontoAplicado = podeDescontar && aplicarDesconto ? (fonte?.desconto ?? 0) : 0;
  const valorFinal = Math.max(0, Math.round((baseValor - descontoAplicado) * 100) / 100);

  // ── Ocupados (ignora o próprio agendamento ao editar) ──────────────────
  type OcupadoComId = AgendamentoOcupado & { id: string };
  const ocupados = useMemo<OcupadoComId[]>(
    () =>
      (allBookingsData ?? [])
        .filter((x) => !(ag && x.id === ag.id))
        .map((x) => ({
          id: x.id,
          data_hora: x.data_hora,
          duracao_min: x.duracao_min || 60,
        })),
    [allBookingsData, ag],
  );

  const avaliacao = useMemo(
    () =>
      avaliarHorario({
        data: new Date(`${form.data}T00:00:00`),
        hora: form.hora,
        duracaoMin: form.duracao_min,
        expediente: expediente ?? [],
        intervalos: intervalos ?? [],
        bloqueios: bloqueios ?? [],
        ocupados,
        ignorarAgendamentoId: ag?.id,
      }),
    [form.data, form.hora, form.duracao_min, expediente, intervalos, bloqueios, ocupados, ag?.id],
  );

  const bloqueioSalvar = !avaliacao.permitido && !permiteForaExpediente && !overrideExpediente;

  // Slots segundo o expediente/intervalos/bloqueios configurados.
  const slots = useMemo(() => {
    if (!form.data) return [];
    const dataObj = new Date(`${form.data}T00:00:00`);
    if (Number.isNaN(dataObj.getTime())) return [];
    const hoje = new Date();
    const isToday = dataLocalKey(dataObj) === dataLocalKey(hoje);
    const agora = `${String(hoje.getHours()).padStart(2, "0")}:${String(hoje.getMinutes()).padStart(2, "0")}`;
    return gerarSlots({
      data: dataObj,
      duracaoMin: form.duracao_min,
      expediente: expediente ?? [],
      intervalos: intervalos ?? [],
      bloqueios: bloqueios ?? [],
      ocupados,
      passoMin: 30,
      ignoraAntesDe: isToday ? agora : undefined,
    });
  }, [form.data, form.duracao_min, expediente, intervalos, bloqueios, ocupados]);

  // Se o horário escolhido não estiver disponível, sugerir os 3 mais próximos.
  const nearbySlots = useMemo(() => {
    if (!form.hora) return [];
    const livres = slots.filter((s) => s.disponivel).map((s) => s.hora);
    if (livres.includes(form.hora)) return [];
    const alvo = Number(form.hora.replace(":", ""));
    return livres
      .map((h) => ({ h, diff: Math.abs(Number(h.replace(":", "")) - alvo) }))
      .sort((a, b) => a.diff - b.diff)
      .slice(0, 3)
      .map((x) => x.h);
  }, [slots, form.hora]);

  const mut = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse(form);
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);

      if (!avaliacao.permitido && !permiteForaExpediente && !overrideExpediente) {
        throw new Error(avaliacao.motivo ?? "Horário indisponível no expediente.");
      }

      const data_hora = new Date(`${parsed.data.data}T${parsed.data.hora}:00`).toISOString();

      // Conflict check - also check overlapping times based on duration
      const { data: u } = await supabase.auth.getUser();
      const { data: allSlots } = await supabase
        .from("agendamentos")
        .select("id, data_hora, duracao_min")
        .eq("user_id", u.user!.id)
        .neq("status", "cancelado");

      const requestedStart = new Date(data_hora).getTime();
      const requestedEnd = requestedStart + parsed.data.duracao_min * 60 * 1000;

      const hasConflict = (allSlots ?? []).some((slot) => {
        if (ag && slot.id === ag.id) return false;
        const slotStart = new Date(slot.data_hora).getTime();
        const slotEnd = slotStart + (slot.duracao_min || 60) * 60 * 1000;
        return requestedStart < slotEnd && slotStart < requestedEnd;
      });

      if (hasConflict && !permiteForaExpediente && !overrideExpediente)
        throw new Error("Conflito de horário! Já existe um agendamento neste período.");

      const payload = {
        cliente_id: parsed.data.cliente_id,
        servico_id: parsed.data.servico_id,
        data_hora,
        duracao_min: parsed.data.duracao_min,
        valor: valorFinal,
        custo: parsed.data.custo,
        status: parsed.data.status,
        pagamento: parsed.data.pagamento,
        observacoes: parsed.data.observacoes || null,
      };

      let agendamentoId: string | null = null;

      // Recurrence: save + create recorrencia
      if (!ag && recorrente) {
        const { error: insertErr } = await supabase
          .from("agendamentos")
          .insert({ ...payload, user_id: u.user!.id });
        if (insertErr) throw insertErr;

        const horaTime = `${String(new Date(data_hora).getHours()).padStart(2, "0")}:${String(new Date(data_hora).getMinutes()).padStart(2, "0")}`;
        const { error: recErr } = await supabase.from("recorrencias").insert({
          user_id: u.user!.id,
          cliente_id: parsed.data.cliente_id,
          servico_id: parsed.data.servico_id,
          frequencia,
          hora: horaTime,
          duracao_min: parsed.data.duracao_min,
          valor: parsed.data.valor,
          custo: parsed.data.custo,
          observacoes: parsed.data.observacoes || null,
          data_inicio: parsed.data.data,
          data_fim: dataFim || null,
          proxima_geracao: format(
            addDays(
              new Date(parsed.data.data),
              frequencia === "semanal" ? 7 : frequencia === "quinzenal" ? 14 : 30,
            ),
            "yyyy-MM-dd",
          ),
        });
        if (recErr) throw recErr;
      } else if (ag) {
        const { error } = await supabase.from("agendamentos").update(payload).eq("id", ag.id);
        if (error) throw error;
      } else {
        const { data: created, error } = await supabase
          .from("agendamentos")
          .insert({ ...payload, user_id: u.user!.id })
          .select("id")
          .single();
        if (error) throw error;
        agendamentoId = created?.id ?? null;
      }

      // Consome o cupom (limite de usos) quando ele foi o desconto aplicado.
      if (agendamentoId && fonte?.origem === "cupom" && descontoAplicado > 0) {
        const res = await consumirCupomInterno({
          data: {
            cupomId: fonte.cupom.id,
            base: baseValor,
            clienteId: parsed.data.cliente_id,
            origem: "agendamento",
            entidadeId: agendamentoId,
          },
        });
        if (!res.ok) {
          toast.warning(`Agendamento salvo, mas o cupom não foi consumido: ${res.error}`);
        }
      }
    },
    onSuccess: () => {
      toast.success(ag ? "Agendamento atualizado" : "Agendamento criado");
      onSaved();
      setOpen(false);
    },
    onError: (e: Error) => toast.error(mensagemErroAmigavel(e.message)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="gradient-primary text-primary-foreground shadow-glow">
            <Plus className="size-4 mr-1" /> Novo
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {ag ? "Editar agendamento" : "Novo agendamento"}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
          className="space-y-3"
        >
          <div>
            <Label>Cliente *</Label>
            <Select
              value={form.cliente_id}
              onValueChange={(v) => setForm({ ...form, cliente_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar..." />
              </SelectTrigger>
              <SelectContent>
                {clientes?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Serviço *</Label>
            <Select
              value={form.servico_id}
              onValueChange={(v) => {
                const s = servicos?.find((x) => x.id === v);
                setForm({
                  ...form,
                  servico_id: v,
                  valor: s ? Number(s.valor) : form.valor,
                  custo: s ? Number(s.custo) : form.custo,
                  duracao_min: s ? s.duracao_min : form.duracao_min,
                });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar..." />
              </SelectTrigger>
              <SelectContent>
                {servicos?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Data</Label>
              <Input
                type="date"
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
              />
            </div>
            <div>
              <Label>Hora</Label>
              <Input
                type="time"
                value={form.hora}
                onChange={(e) => setForm({ ...form, hora: e.target.value })}
              />
            </div>
            <div>
              <Label>Duração (min)</Label>
              <Input
                type="number"
                value={form.duracao_min}
                onChange={(e) => setForm({ ...form, duracao_min: Number(e.target.value) })}
              />
            </div>
          </div>

          {/* F3: Nearby slot suggestions */}
          {nearbySlots.length > 0 && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
                <Sparkles className="size-3.5" />
                Horário solicitado indisponível. Sugestões próximas:
              </div>
              <div className="flex flex-wrap gap-2">
                {nearbySlots.map((time) => (
                  <button
                    key={time}
                    type="button"
                    onClick={() => setForm({ ...form, hora: time })}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-xs font-medium text-card-foreground transition-all flex items-center gap-1"
                  >
                    <ArrowRight className="size-3" />
                    {time}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Aviso de expediente/intervalo/bloqueio + autorização da profissional */}
          {!avaliacao.permitido && !permiteForaExpediente && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 space-y-2">
              <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400 font-medium">
                <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                <span>{avaliacao.motivo}</span>
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={overrideExpediente}
                  onChange={(e) => setOverrideExpediente(e.target.checked)}
                  className="size-3.5 accent-[#D946EF]"
                />
                <span>Salvar mesmo assim (autorizar este horário)</span>
              </label>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Custo (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.custo}
                onChange={(e) => setForm({ ...form, custo: Number(e.target.value) })}
              />
            </div>
          </div>

          {/* Descontos: cupom automático e/ou aniversário (não cumulativos) */}
          {!ag && !recorrente && (fonte || cuponsRejeitados.length > 0) && (
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 space-y-2 text-xs">
              {fonte ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                      <Gift className="size-3.5" />
                      {fonte.origem === "cupom"
                        ? `Cupom ${fonte.cupom.nome}`
                        : `Aniversário (${fonte.percentual}%)`}
                    </span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      -{brl(fonte.desconto)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Valor final</span>
                    <span className="font-semibold text-card-foreground">{brl(valorFinal)}</span>
                  </div>
                  <label className="flex items-center gap-2 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={aplicarDesconto}
                      onChange={(e) => setAplicarDesconto(e.target.checked)}
                      className="size-3.5 accent-[#D946EF]"
                    />
                    <span>Aplicar este desconto no agendamento</span>
                  </label>
                </>
              ) : (
                cuponsRejeitados.slice(0, 2).map((r) => (
                  <div key={r.nome} className="text-muted-foreground">
                    Cupom <b>{r.nome}</b> não aplicável: {r.motivo}.
                  </div>
                ))
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as Status })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agendado">Agendado</SelectItem>
                  <SelectItem value="confirmado">Confirmado</SelectItem>
                  <SelectItem value="concluido">Concluído</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Pagamento</Label>
              <Select
                value={form.pagamento}
                onValueChange={(v) => setForm({ ...form, pagamento: v as Pagamento })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="debito">Débito</SelectItem>
                  <SelectItem value="credito">Crédito</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* Recorrência */}
          {!ag && (
            <div className="border border-border/40 rounded-xl p-3 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="recorrente"
                  checked={recorrente}
                  onChange={(e) => setRecorrente(e.target.checked)}
                  className="size-4 accent-[#D946EF]"
                  aria-label="Repetir este agendamento"
                />
                <Label htmlFor="recorrente" className="text-sm font-medium cursor-pointer">
                  Repetir agendamento
                </Label>
              </div>
              {recorrente && (
                <div className="grid grid-cols-2 gap-3 ml-6">
                  <div>
                    <Label className="text-xs">Frequência</Label>
                    <Select value={frequencia} onValueChange={setFrequencia}>
                      <SelectTrigger
                        className="h-9 rounded-xl text-xs"
                        aria-label="Frequência da recorrência"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="semanal">Semanal</SelectItem>
                        <SelectItem value="quinzenal">Quinzenal</SelectItem>
                        <SelectItem value="mensal">Mensal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Até</Label>
                    <Input
                      type="date"
                      value={dataFim}
                      onChange={(e) => setDataFim(e.target.value)}
                      className="h-9 rounded-xl text-xs"
                      aria-label="Data final da recorrência"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          <div>
            <Label>Observações</Label>
            <Textarea
              rows={2}
              value={form.observacoes ?? ""}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
            />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={mut.isPending || bloqueioSalvar}
              className="gradient-primary text-primary-foreground shadow-glow w-full"
            >
              {mut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
