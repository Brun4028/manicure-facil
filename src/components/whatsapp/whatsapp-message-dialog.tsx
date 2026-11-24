import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import {
  MessageCircle,
  Copy,
  Check,
  Send,
  Pencil,
  AlertTriangle,
  Sparkles,
  User,
  Calendar,
  Clock,
  ExternalLink,
  Phone,
} from "lucide-react";
import { toast } from "sonner";
import {
  abrirWhatsApp,
  mensagens,
  numeroWhatsApp,
  formatarDataHora,
  type TipoMensagem,
  type DadosMensagem,
} from "@/lib/whatsapp";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export type WhatsAppModalTipo = TipoMensagem | "personalizada";

export interface WhatsAppMessageDialogProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  cliente: {
    id?: string;
    nome: string;
    telefone?: string | null;
  };
  agendamento?: {
    id?: string;
    data_hora?: string;
    servico?: string;
    valor?: number;
    status?: string;
  } | null;
  tipoPadrao?: WhatsAppModalTipo;
  onEnviado?: () => void;
}

const TEMPLATES: { id: WhatsAppModalTipo; label: string; desc: string }[] = [
  { id: "lembrete", label: "Lembrete", desc: "Avisar cliente sobre horário próximo" },
  { id: "confirmacao", label: "Confirmação", desc: "Confirmar agendamento marcado" },
  { id: "agradecimento", label: "Agradecimento", desc: "Agradecer após atendimento" },
  { id: "reagendamento", label: "Reagendar", desc: "Convidar para remarcar horário cancelado" },
  { id: "linkAgendamento", label: "Enviar Link", desc: "Compartilhar link de agendamento online" },
  { id: "aniversario", label: "Aniversário", desc: "Parabenizar cliente aniversariante" },
  { id: "reativacao", label: "Reativação", desc: "Convidar cliente que não volta há tempo" },
  { id: "personalizada", label: "Personalizada", desc: "Escrever mensagem livre" },
];

export function WhatsAppMessageDialog({
  trigger,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  cliente,
  agendamento,
  tipoPadrao,
  onEnviado,
}: WhatsAppMessageDialogProps) {
  const { user } = useAuth();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setIsOpen = isControlled ? setControlledOpen! : setInternalOpen;

  // Determina o tipo sugerido inicial com base no agendamento ou prop
  const tipoSugerido: WhatsAppModalTipo = useMemo(() => {
    if (tipoPadrao) return tipoPadrao;
    if (agendamento) {
      if (agendamento.status === "concluido") return "agradecimento";
      if (agendamento.status === "cancelado") return "reagendamento";
      if (agendamento.status === "confirmado") return "lembrete";
      return "confirmacao";
    }
    return "conversa";
  }, [tipoPadrao, agendamento]);

  const [tipoSelecionado, setTipoSelecionado] = useState<WhatsAppModalTipo>(tipoSugerido);
  const [mensagemTexto, setMensagemTexto] = useState("");
  const [telefoneEditavel, setTelefoneEditavel] = useState(cliente.telefone ?? "");
  const [editandoTelefone, setEditandoTelefone] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // Link público de agendamento
  const publicLink = useMemo(() => {
    if (!user?.id) return "";
    if (typeof window !== "undefined") {
      return `${window.location.origin}/agendar/${user.id}`;
    }
    return `/agendar/${user.id}`;
  }, [user?.id]);

  // Monta os dados estruturados da mensagem
  const dadosMensagem: DadosMensagem = useMemo(
    () => ({
      cliente: cliente.nome?.trim() || "Cliente",
      dataHora: agendamento?.data_hora ?? null,
      servico: agendamento?.servico ?? null,
      valor: agendamento?.valor ?? null,
      linkAgendamento: publicLink,
    }),
    [cliente.nome, agendamento, publicLink],
  );

  // Gera o texto base quando o tipo muda
  useEffect(() => {
    if (tipoSelecionado === "personalizada") {
      setMensagemTexto((prev) => (prev ? prev : `Oi, ${dadosMensagem.cliente}! Tudo bem? 😊`));
    } else if (tipoSelecionado in mensagens) {
      const fn = mensagens[tipoSelecionado as TipoMensagem];
      setMensagemTexto(fn(dadosMensagem));
    }
  }, [tipoSelecionado, dadosMensagem]);

  // Atualiza telefone quando cliente mudar
  useEffect(() => {
    setTelefoneEditavel(cliente.telefone ?? "");
    setEditandoTelefone(!cliente.telefone);
  }, [cliente.telefone]);

  // Validação do número internacional
  const numeroValido = useMemo(() => {
    return numeroWhatsApp(telefoneEditavel);
  }, [telefoneEditavel]);

  const handleCopiar = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(mensagemTexto);
      } else {
        const input = document.createElement("textarea");
        input.value = mensagemTexto;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      setCopiado(true);
      toast.success("Mensagem copiada para a área de transferência!");
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      toast.error("Erro ao copiar texto.");
    }
  };

  const handleEnviarWhatsApp = () => {
    if (!numeroValido) {
      toast.error("Informe um número de telefone celular válido para abrir o WhatsApp.");
      setEditandoTelefone(true);
      return;
    }

    const sucesso = abrirWhatsApp(telefoneEditavel, mensagemTexto);
    if (!sucesso) {
      toast.error("Não foi possível gerar o link do WhatsApp com este número.");
      return;
    }

    toast.success("Abrindo WhatsApp com a mensagem preenchida!");
    if (onEnviado) {
      onEnviado();
    }
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}

      <DialogContent
        className="grid-cols-[minmax(0,1fr)] w-[calc(100%-2rem)] max-w-xl min-w-0 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain bg-card/95 backdrop-blur-xl border border-border/80 shadow-2xl p-5 md:p-6"
        style={{
          width: "calc(100% - 2rem)",
          maxWidth: "36rem",
          minWidth: 0,
          gridTemplateColumns: "minmax(0, 1fr)",
          maxHeight: "calc(100dvh - 2rem - env(safe-area-inset-top) - env(safe-area-inset-bottom))",
          paddingTop: "max(1.25rem, env(safe-area-inset-top))",
          paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
          overflowX: "hidden",
        }}
      >
        <DialogHeader className="min-w-0 max-w-full text-left space-y-1.5 pb-2 pr-7 border-b border-border/40">
          <div className="flex items-center justify-between gap-3 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="size-9 rounded-xl bg-[#25D366]/15 border border-[#25D366]/30 grid place-items-center text-[#25D366] shrink-0">
                <MessageCircle className="size-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="font-display text-base sm:text-lg leading-snug break-words">
                  Preparar Mensagem WhatsApp
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground leading-snug break-words">
                  Revise e ajuste o texto antes de abrir a conversa no WhatsApp
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Card da Cliente e Telefone */}
          <div className="bg-muted/40 border border-border/60 rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs min-w-0 max-w-full">
            <div className="flex items-center gap-2 min-w-0">
              <div className="size-8 rounded-full gradient-primary grid place-items-center text-white text-xs font-bold shrink-0">
                {cliente.nome.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <span className="font-semibold text-foreground truncate block">{cliente.nome}</span>
                {agendamento && (
                  <span className="text-[11px] text-muted-foreground truncate block">
                    {agendamento.servico && `${agendamento.servico} • `}
                    {agendamento.data_hora &&
                      format(new Date(agendamento.data_hora), "dd/MM 'às' HH'h'mm", {
                        locale: ptBR,
                      })}
                  </span>
                )}
              </div>
            </div>

            {/* Telefone e Edição rápida */}
            <div className="flex items-center gap-2 min-w-0 max-w-full sm:shrink-0">
              {editandoTelefone ? (
                <div className="flex items-center gap-1.5 w-full min-w-0 sm:w-auto">
                  <Input
                    size={1}
                    value={telefoneEditavel}
                    placeholder="DDD + Número (ex: 11999998888)"
                    onChange={(e) => setTelefoneEditavel(e.target.value)}
                    className="h-8 text-xs min-w-0 flex-1 sm:flex-none sm:w-44"
                    autoFocus
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-[11px] px-2 shrink-0"
                    onClick={() => setEditandoTelefone(false)}
                  >
                    OK
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 min-w-0 max-w-full">
                  <Badge
                    variant="outline"
                    className={`text-[11px] font-mono max-w-full overflow-hidden text-ellipsis whitespace-nowrap ${
                      numeroValido
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                        : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                    }`}
                  >
                    <Phone className="size-3 mr-1" />
                    {telefoneEditavel || "Sem telefone"}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 hover:bg-accent/40"
                    title="Editar telefone"
                    onClick={() => setEditandoTelefone(true)}
                  >
                    <Pencil className="size-3 text-muted-foreground" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          {!numeroValido && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-2.5 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
              <AlertTriangle className="size-4 shrink-0" />
              <span>
                Telefone inválido ou incompleto. Clique no lápis para corrigir antes de abrir o
                WhatsApp.
              </span>
            </div>
          )}

          {/* Modelos rápidos */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Sparkles className="size-3 text-primary" /> Escolha o modelo da mensagem:
            </Label>
            <div
              className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none w-full min-w-0 max-w-full"
              style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}
            >
              {TEMPLATES.map((t) => {
                const ativo = tipoSelecionado === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTipoSelecionado(t.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium shrink-0 transition-all ${
                      ativo
                        ? "bg-gradient-to-r from-[#D946EF] to-[#A855F7] text-white shadow-glow"
                        : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/50"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Editor do Texto da Mensagem */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                Revise o texto da mensagem (você pode editar livremente):
              </Label>
              <span className="text-[10px] text-muted-foreground font-mono">
                {mensagemTexto.length} caracteres
              </span>
            </div>
            <Textarea
              rows={5}
              value={mensagemTexto}
              onChange={(e) => setMensagemTexto(e.target.value)}
              placeholder="Digite aqui a mensagem..."
              className="font-sans text-xs leading-relaxed resize-none bg-background/80 focus-visible:ring-1 focus-visible:ring-[#25D366] w-full min-w-0 max-w-full"
            />
          </div>

          {/* Pré-visualização no estilo balão do WhatsApp */}
          <div className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block">
              Pré-visualização no WhatsApp:
            </span>
            <div className="bg-[#EFEAE2] dark:bg-[#0B141A] rounded-2xl p-3 border border-border/40 overflow-hidden w-full min-w-0 max-w-full">
              <div className="max-w-[85%] w-full min-w-0 ml-auto bg-[#D9FDD3] dark:bg-[#005C4B] text-[#111B21] dark:text-[#E9EDEF] rounded-2xl rounded-tr-xs p-3 text-xs shadow-sm space-y-1.5">
                <p className="whitespace-pre-wrap leading-relaxed text-xs break-words [overflow-wrap:anywhere]">
                  {mensagemTexto || "Sua mensagem aparecerá aqui..."}
                </p>
                <div className="flex items-center justify-end gap-1 text-[9px] text-[#667781] dark:text-[#8696A0]">
                  <span>{format(new Date(), "HH:mm")}</span>
                  <span className="text-[#53BDEB] font-bold">✓✓</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 pt-3 border-t border-border/40 w-full min-w-0 max-w-full">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full sm:w-auto justify-center text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setIsOpen(false)}
          >
            Fechar
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full sm:w-auto justify-center text-xs glass hover:bg-accent/40"
            onClick={handleCopiar}
          >
            {copiado ? (
              <Check className="size-3.5 mr-1.5 text-emerald-500" />
            ) : (
              <Copy className="size-3.5 mr-1.5" />
            )}
            {copiado ? "Copiado!" : "Copiar Texto"}
          </Button>

          <Button
            type="button"
            size="sm"
            className="w-full sm:w-auto justify-center whitespace-nowrap bg-[#25D366] hover:bg-[#1ebe5d] text-white font-medium text-xs shadow-md shadow-[#25D366]/20 flex items-center gap-1.5 sm:ml-auto"
            onClick={handleEnviarWhatsApp}
          >
            <MessageCircle className="size-4" />
            <span>Abrir no WhatsApp</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
