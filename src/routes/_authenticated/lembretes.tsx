import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { usePageTitle } from "@/hooks/use-page-title";

import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import { toast } from "sonner";
import { mensagemErroAmigavel } from "@/lib/user-errors";
import { abrirWhatsApp } from "@/lib/whatsapp";
import {
  adiarLembrete,
  gerarLembretes,
  listarLembretes,
  marcarResolvido,
  reabrirLembrete,
  telefoneValido,
  diaDoLembrete,
  ROTULOS_TIPO,
  type Lembrete,
  type StatusLembrete,
  type TipoLembrete,
} from "@/lib/lembretes";
import {
  MessageCircle,
  CalendarClock,
  CalendarCheck2,
  Cake,
  UserX,
  RefreshCw,
  Check,
  Clock,
  Eye,
  PhoneOff,
  RotateCcw,
  Sparkles,
  Info,
} from "lucide-react";
import { format, isSameDay, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/lembretes")({
  component: LembretesPage,
});

type FiltroTipo = "todos" | TipoLembrete;
type FiltroStatus = "pendentes" | StatusLembrete | "todos";
type FiltroPeriodo = "todos" | "hoje" | "semana";

const CONFIG_TIPO: Record<
  TipoLembrete,
  { icon: typeof MessageCircle; color: string; bg: string; border: string }
> = {
  agendamento_proximo: {
    icon: CalendarClock,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
  agendamento_confirmado: {
    icon: CalendarCheck2,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
  aniversario: {
    icon: Cake,
    color: "text-pink-500",
    bg: "bg-pink-500/10",
    border: "border-pink-500/20",
  },
  inatividade: {
    icon: UserX,
    color: "text-[#A855F7]",
    bg: "bg-[#A855F7]/10",
    border: "border-[#A855F7]/20",
  },
};

function statusDoLembrete(l: Lembrete): StatusLembrete {
  if (l.status === "adiado" && l.adiado_ate && new Date(l.adiado_ate).getTime() <= Date.now()) {
    return "pendente";
  }
  return l.status;
}

function LembretesPage() {
  usePageTitle("Lembretes WhatsApp — Manicure Fácil");

  const qc = useQueryClient();
  const navigate = useNavigate();

  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>("todos");
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("pendentes");
  const [filtroPeriodo, setFiltroPeriodo] = useState<FiltroPeriodo>("todos");
  const [busca, setBusca] = useState("");
  const [mensagemAberta, setMensagemAberta] = useState<string | null>(null);

  // Gera (com throttle) e lista os lembretes. O botão "Atualizar" força a
  // geração sem throttle para incorporar mudanças recentes da agenda.
  const {
    data: lembretes = [],
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ["lembretes"],
    queryFn: async () => {
      await gerarLembretes();
      return listarLembretes();
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["lembretes"] });
    qc.invalidateQueries({ queryKey: ["lembretes-pendentes"] });
  };

  const atualizarMut = useMutation({
    mutationFn: async () => {
      await gerarLembretes(true);
      return listarLembretes();
    },
    onSuccess: () => {
      toast.success("Lembretes atualizados!");
      invalidate();
    },
    onError: (e: Error) => toast.error(mensagemErroAmigavel(e.message)),
  });

  const resolverMut = useMutation({
    mutationFn: (id: string) => marcarResolvido(id),
    onSuccess: () => {
      toast.success("Lembrete marcado como resolvido");
      invalidate();
    },
    onError: (e: Error) => toast.error(mensagemErroAmigavel(e.message)),
  });

  const reabrirMut = useMutation({
    mutationFn: (id: string) => reabrirLembrete(id),
    onSuccess: () => {
      toast.success("Lembrete reaberto");
      invalidate();
    },
    onError: (e: Error) => toast.error(mensagemErroAmigavel(e.message)),
  });

  const adiarMut = useMutation({
    mutationFn: ({ id, ate }: { id: string; ate: Date }) => adiarLembrete(id, ate),
    onSuccess: () => {
      toast.success("Lembrete adiado");
      invalidate();
    },
    onError: (e: Error) => toast.error(mensagemErroAmigavel(e.message)),
  });

  const resumo = useMemo(() => {
    const pendentes = lembretes.filter((l) => statusDoLembrete(l) === "pendente");
    return {
      total: pendentes.length,
      agendamento: pendentes.filter((l) => l.tipo === "agendamento_proximo").length,
      confirmado: pendentes.filter((l) => l.tipo === "agendamento_confirmado").length,
      aniversario: pendentes.filter((l) => l.tipo === "aniversario").length,
      inatividade: pendentes.filter((l) => l.tipo === "inatividade").length,
      semTelefone: pendentes.filter((l) => !telefoneValido(l.telefone)).length,
    };
  }, [lembretes]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lembretes.filter((l) => {
      const st = statusDoLembrete(l);
      if (filtroStatus === "pendentes") {
        if (st !== "pendente") return false;
      } else if (filtroStatus !== "todos" && st !== filtroStatus) {
        return false;
      }
      if (filtroTipo !== "todos" && l.tipo !== filtroTipo) return false;
      if (filtroPeriodo !== "todos") {
        const base = new Date(l.data_referencia ?? l.created_at);
        if (filtroPeriodo === "hoje" && !isSameDay(base, new Date())) return false;
        if (filtroPeriodo === "semana") {
          const diff = base.getTime() - Date.now();
          if (diff > 7 * 24 * 60 * 60 * 1000 || diff < -7 * 24 * 60 * 60 * 1000) return false;
        }
      }
      if (q && !`${l.cliente_nome} ${l.telefone ?? ""} ${l.motivo}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [lembretes, filtroStatus, filtroTipo, filtroPeriodo, busca]);

  const agrupados = useMemo(() => {
    const mapa = new Map<string, Lembrete[]>();
    for (const l of filtrados) {
      const key = diaDoLembrete(l);
      if (!mapa.has(key)) mapa.set(key, []);
      mapa.get(key)!.push(l);
    }
    return Array.from(mapa.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtrados]);

  return (
    <>
      <PageHeader
        title="Lembretes WhatsApp"
        subtitle="Central de contatos do salão — confira a mensagem e envie você mesma"
        actions={
          <Button
            variant="outline"
            className="glass rounded-xl"
            onClick={() => atualizarMut.mutate()}
            disabled={atualizarMut.isPending}
          >
            <RefreshCw className={`size-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        }
      />

      <div className="bg-[#D946EF]/5 border border-[#D946EF]/15 rounded-2xl p-3.5 mb-6 flex items-start gap-2.5 text-xs text-muted-foreground">
        <Info className="size-4 shrink-0 text-[#D946EF] mt-0.5" />
        <p className="leading-relaxed">
          O aplicativo organiza e prepara as mensagens, mas{" "}
          <strong className="text-foreground">não envia nada sozinho</strong>. Clique em{" "}
          <strong className="text-foreground">Abrir WhatsApp</strong> para revisar e enviar você
          mesma.
        </p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <ResumoCard rotulo="Pendentes" valor={resumo.total} destaque />
        <ResumoCard rotulo="A confirmar" valor={resumo.agendamento} />
        <ResumoCard rotulo="Confirmados" valor={resumo.confirmado} />
        <ResumoCard rotulo="Aniversários" valor={resumo.aniversario} />
        <ResumoCard rotulo="Inativas" valor={resumo.inatividade} />
      </div>

      {resumo.semTelefone > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3.5 mb-6 flex items-center gap-2.5 text-xs text-amber-700 dark:text-amber-300">
          <PhoneOff className="size-4 shrink-0" />
          <span>
            {resumo.semTelefone} lembrete{resumo.semTelefone > 1 ? "s" : ""} sem telefone válido.
            Cadastre o número da cliente para conseguir abrir a conversa.
          </span>
        </div>
      )}

      {/* Filtros */}
      <Card className="bg-card border border-border rounded-2xl p-4 mb-6 shadow-card">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs mb-1 block">Buscar cliente</Label>
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome, telefone ou motivo..."
              className="h-10 rounded-xl"
            />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Tipo</Label>
            <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as FiltroTipo)}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                <SelectItem value="agendamento_proximo">Agendamentos próximos</SelectItem>
                <SelectItem value="agendamento_confirmado">Agendamentos confirmados</SelectItem>
                <SelectItem value="aniversario">Aniversariantes</SelectItem>
                <SelectItem value="inatividade">Clientes inativas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs mb-1 block">Situação</Label>
            <Select value={filtroStatus} onValueChange={(v) => setFiltroStatus(v as FiltroStatus)}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pendentes">Pendentes</SelectItem>
                <SelectItem value="resolvido">Resolvidos</SelectItem>
                <SelectItem value="adiado">Adiados</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs mb-1 block">Período</Label>
            <Select
              value={filtroPeriodo}
              onValueChange={(v) => setFiltroPeriodo(v as FiltroPeriodo)}
            >
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Qualquer data</SelectItem>
                <SelectItem value="hoje">Hoje</SelectItem>
                <SelectItem value="semana">Próximos 7 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-2xl bg-muted" />
          ))}
        </div>
      ) : agrupados.length === 0 ? (
        <Card className="bg-card border border-border rounded-2xl p-12 text-center shadow-card">
          <div className="size-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 grid place-items-center mx-auto mb-4">
            <Sparkles className="size-7 text-emerald-500" />
          </div>
          <p className="text-muted-foreground">Nenhum lembrete por aqui. Tudo em dia! 💜</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {agrupados.map(([dia, itens]) => {
            const d = new Date(`${dia}T00:00:00`);
            return (
              <div key={dia}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <h3 className="text-sm font-semibold text-foreground">
                    {isToday(d) ? "Hoje" : format(d, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                  </h3>
                  <Badge variant="secondary" className="rounded-full text-[10px]">
                    {itens.length}
                  </Badge>
                </div>
                <div className="space-y-3">
                  {itens.map((l) => (
                    <LembreteCard
                      key={l.id}
                      lembrete={l}
                      mensagemAberta={mensagemAberta === l.id}
                      onToggleMensagem={() =>
                        setMensagemAberta((cur) => (cur === l.id ? null : l.id))
                      }
                      onResolver={() => resolverMut.mutate(l.id)}
                      onReabrir={() => reabrirMut.mutate(l.id)}
                      onAdiar={(ate) => adiarMut.mutate({ id: l.id, ate })}
                      onVer={() =>
                        navigate({
                          to: l.agendamento_id ? "/agendamentos" : "/clientes",
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function ResumoCard({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: number;
  destaque?: boolean;
}) {
  return (
    <Card
      className={`border rounded-2xl p-4 shadow-card ${
        destaque
          ? "bg-gradient-to-br from-[#D946EF]/10 to-[#A855F7]/10 border-[#D946EF]/20"
          : "bg-card border-border"
      }`}
    >
      <div
        className={`font-display text-2xl font-bold ${destaque ? "text-[#D946EF]" : "text-foreground"}`}
      >
        {valor}
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{rotulo}</div>
    </Card>
  );
}

function LembreteCard({
  lembrete: l,
  mensagemAberta,
  onToggleMensagem,
  onResolver,
  onReabrir,
  onAdiar,
  onVer,
}: {
  lembrete: Lembrete;
  mensagemAberta: boolean;
  onToggleMensagem: () => void;
  onResolver: () => void;
  onReabrir: () => void;
  onAdiar: (ate: Date) => void;
  onVer: () => void;
}) {
  const cfg = CONFIG_TIPO[l.tipo];
  const Icon = cfg.icon;
  const status = statusDoLembrete(l);
  const temTelefone = telefoneValido(l.telefone);

  return (
    <Card className="bg-card border border-border rounded-2xl p-4 shadow-card hover:border-[#D946EF]/30 transition-all">
      <div className="flex flex-col md:flex-row md:items-start gap-4">
        <div
          className={`size-11 rounded-xl ${cfg.bg} ${cfg.border} border grid place-items-center shrink-0`}
        >
          <Icon className={`size-5 ${cfg.color}`} />
        </div>

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-sm text-card-foreground">{l.cliente_nome}</h3>
            <Badge variant="outline" className={`text-[10px] ${cfg.color} ${cfg.border}`}>
              {ROTULOS_TIPO[l.tipo]}
            </Badge>
            {status === "resolvido" && (
              <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 border-0">
                Resolvido
              </Badge>
            )}
            {status === "adiado" && (
              <Badge className="text-[10px] bg-amber-500/10 text-amber-600 border-0">
                Adiado{myFormatAdiado(l.adiado_ate)}
              </Badge>
            )}
          </div>

          <p className="text-xs text-muted-foreground">{l.motivo}</p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <MessageCircle className="size-3.5" />
              {temTelefone ? (
                l.telefone
              ) : (
                <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                  <PhoneOff className="size-3" /> Sem telefone cadastrado
                </span>
              )}
            </span>
            {l.data_referencia && (
              <span className="flex items-center gap-1.5">
                <Clock className="size-3.5" />
                {format(new Date(l.data_referencia), "dd/MM 'às' HH'h'mm", { locale: ptBR })}
              </span>
            )}
          </div>

          {mensagemAberta && (
            <div className="mt-2 bg-muted/40 border border-border/60 rounded-xl p-3 text-xs text-foreground whitespace-pre-wrap">
              {l.mensagem}
            </div>
          )}
        </div>

        <div className="flex flex-wrap md:flex-col gap-2 shrink-0">
          <Button
            size="sm"
            className="h-9 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-white"
            disabled={!temTelefone}
            onClick={() => {
              if (!abrirWhatsApp(l.telefone, l.mensagem)) {
                toast.error("Número de WhatsApp inválido. Atualize o cadastro da cliente.");
              }
            }}
          >
            <MessageCircle className="size-3.5 mr-1.5" /> Abrir WhatsApp
          </Button>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-9 rounded-xl"
              onClick={onToggleMensagem}
            >
              <Eye className="size-3.5 mr-1.5" />
              {mensagemAberta ? "Ocultar" : "Mensagem"}
            </Button>
            <Button size="sm" variant="outline" className="h-9 rounded-xl" onClick={onVer}>
              Ver cadastro
            </Button>
          </div>
          <div className="flex gap-2">
            {status === "resolvido" ? (
              <Button size="sm" variant="ghost" className="h-9 rounded-xl" onClick={onReabrir}>
                <RotateCcw className="size-3.5 mr-1.5" /> Reabrir
              </Button>
            ) : (
              <Button size="sm" variant="ghost" className="h-9 rounded-xl" onClick={onResolver}>
                <Check className="size-3.5 mr-1.5" /> Resolvido
              </Button>
            )}
            <AdiarDialog onAdiar={onAdiar} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function myFormatAdiado(adiadoAte: string | null): string {
  if (!adiadoAte) return "";
  return ` até ${format(new Date(adiadoAte), "dd/MM HH:mm")}`;
}

function AdiarDialog({ onAdiar }: { onAdiar: (ate: Date) => void }) {
  const [open, setOpen] = useState(false);

  const opcoes: { rotulo: string; horas: number }[] = [
    { rotulo: "1 hora", horas: 1 },
    { rotulo: "3 horas", horas: 3 },
    { rotulo: "Amanhã", horas: 24 },
    { rotulo: "3 dias", horas: 72 },
    { rotulo: "1 semana", horas: 168 },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-9 rounded-xl">
          <Clock className="size-3.5 mr-1.5" /> Adiar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Adiar lembrete</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <p className="text-xs text-muted-foreground">
            Escolha quando este lembrete deve voltar a aparecer.
          </p>
          {opcoes.map((o) => (
            <Button
              key={o.rotulo}
              variant="outline"
              className="w-full justify-start rounded-xl"
              onClick={() => {
                const ate = new Date(Date.now() + o.horas * 60 * 60 * 1000);
                onAdiar(ate);
                setOpen(false);
              }}
            >
              <Clock className="size-4 mr-2 text-[#D946EF]" /> {o.rotulo}
            </Button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" className="w-full" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
