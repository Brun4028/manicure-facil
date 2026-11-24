import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import {
  Link as LinkIcon,
  Copy,
  Check,
  ExternalLink,
  MessageCircle,
  Share2,
  Sparkles,
  ShieldCheck,
  CalendarCheck,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { abrirWhatsApp } from "@/lib/whatsapp";

interface CompartilharLinkDialogProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CompartilharLinkDialog({
  trigger,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
}: CompartilharLinkDialogProps) {
  const { user } = useAuth();
  const [internalOpen, setInternalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setIsOpen = isControlled ? setControlledOpen! : setInternalOpen;

  const publicLink = useMemo(() => {
    if (!user?.id) return "";
    if (typeof window !== "undefined") {
      return `${window.location.origin}/agendar/${user.id}`;
    }
    return `/agendar/${user.id}`;
  }, [user?.id]);

  const handleCopy = async () => {
    if (!publicLink) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(publicLink);
      } else {
        // Fallback para navegadores sem permissão de clipboard
        const input = document.createElement("input");
        input.value = publicLink;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      setCopied(true);
      toast.success("Link copiado com sucesso! Pronto para colar e enviar.");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Não foi possível copiar automaticamente. Selecione o texto e copie.");
    }
  };

  const handleShareWhatsApp = () => {
    if (!publicLink) return;
    const msg =
      `Olá! 💅\n` +
      `Para agendar seu horário comigo de forma rápida e prática, acesse meu link de agendamento online:\n\n` +
      `👉 ${publicLink}\n\n` +
      `Você pode visualizar todos os procedimentos, conferir os horários disponíveis e garantir sua vaga na hora! ✨`;

    // Abre WhatsApp sem número definido para permitir que a manicure selecione
    // a cliente ou grupo de contato
    const base = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(base, "_blank", "noopener,noreferrer");
  };

  const handleNativeShare = async () => {
    if (navigator.share && publicLink) {
      try {
        await navigator.share({
          title: "Agende seu horário — Manicure Fácil",
          text: "Agende seu procedimento diretamente pela minha agenda online:",
          url: publicLink,
        });
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "AbortError") {
          handleCopy();
        }
      }
    } else {
      handleCopy();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="glass border-primary/20 hover:border-primary/40 text-xs font-medium text-foreground gap-1.5"
          >
            <LinkIcon className="size-3.5 text-primary" />
            <span className="hidden sm:inline">Link de</span> Agendamento
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-xl border border-border/80 shadow-2xl">
        <DialogHeader className="text-left space-y-2">
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-xl gradient-primary grid place-items-center text-white shadow-glow shrink-0">
              <Share2 className="size-4" />
            </div>
            <div>
              <DialogTitle className="font-display text-lg">Link de Agendamento Online</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Compartilhe com suas clientes para agendamentos rápidos e automáticos
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Caixa com o link e botão de copiar */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Seu link público exclusivo:
            </label>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={publicLink}
                className="bg-muted/40 font-mono text-xs select-all text-ellipsis"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button
                type="button"
                variant={copied ? "default" : "outline"}
                className={`shrink-0 transition-all ${
                  copied
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "glass hover:bg-accent/40"
                }`}
                onClick={handleCopy}
              >
                {copied ? <Check className="size-4 mr-1.5" /> : <Copy className="size-4 mr-1.5" />}
                {copied ? "Copiado!" : "Copiar"}
              </Button>
            </div>
          </div>

          {/* Botões de Ação rápida */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button
              type="button"
              className="w-full bg-[#25D366] hover:bg-[#1ebe5d] text-white font-medium text-xs h-10 shadow-sm flex items-center justify-center gap-2"
              onClick={handleShareWhatsApp}
            >
              <MessageCircle className="size-4 shrink-0" />
              <span>Enviar no WhatsApp</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full glass border-border/80 hover:bg-accent/40 text-xs h-10 flex items-center justify-center gap-2"
              onClick={() => {
                if (publicLink) {
                  window.open(publicLink, "_blank", "noopener,noreferrer");
                }
              }}
            >
              <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
              <span>Ver como cliente</span>
            </Button>
          </div>

          {/* Benefícios e funcionamento do link */}
          <div className="bg-muted/30 border border-border/50 rounded-2xl p-3.5 space-y-2.5 text-xs text-muted-foreground">
            <div className="font-semibold text-foreground flex items-center gap-1.5 text-xs">
              <Sparkles className="size-3.5 text-primary" />
              Como funciona o link público:
            </div>

            <div className="space-y-2 text-[11px] leading-relaxed">
              <div className="flex items-start gap-2">
                <ShieldCheck className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <span>
                  <strong>Sem login para as clientes:</strong> Elas acessam a página, escolhem o
                  serviço e o horário disponível direto pelo celular ou PC.
                </span>
              </div>

              <div className="flex items-start gap-2">
                <Clock className="size-3.5 text-blue-500 shrink-0 mt-0.5" />
                <span>
                  <strong>Respeita seu expediente:</strong> Apenas horários dentro dos seus dias de
                  trabalho e fora de pausas/bloqueios são oferecidos.
                </span>
              </div>

              <div className="flex items-start gap-2">
                <CalendarCheck className="size-3.5 text-purple-500 shrink-0 mt-0.5" />
                <span>
                  <strong>Sem conflitos de agenda:</strong> Horários já ocupados ficam bloqueados e
                  a reserva cai imediatamente aqui na sua agenda.
                </span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
