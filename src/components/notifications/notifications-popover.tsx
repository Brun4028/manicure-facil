/**
 * NotificationsPopover — Sistema de notificações internas
 *
 * Exibe um sino na barra superior com badge de notificações não lidas.
 * Dropdown com lista de notificações, ação de marcar como lida e link.
 */

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Bell, CheckCheck, Info, AlertCircle, CheckCircle, Gift, Cake, CalendarDays, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { mensagemErroAmigavel } from "@/lib/user-errors";

type Notificacao = {
  id: string;
  user_id: string;
  titulo: string;
  mensagem: string;
  tipo: "info" | "sucesso" | "aviso" | "erro" | "promocao" | "lembrete" | "aniversario";
  lida: boolean;
  acao_texto: string | null;
  acao_link: string | null;
  entidade: string | null;
  entidade_id: string | null;
  created_at: string;
};

const tipoConfig: Record<string, { icon: typeof Info; color: string; bg: string; border: string }> = {
  info: { icon: Info, color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  sucesso: { icon: CheckCircle, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  aviso: { icon: AlertCircle, color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  erro: { icon: AlertCircle, color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20" },
  promocao: { icon: Gift, color: "text-[#D946EF]", bg: "bg-[#D946EF]/10", border: "border-[#D946EF]/20" },
  lembrete: { icon: CalendarDays, color: "text-[#A855F7]", bg: "bg-[#A855F7]/10", border: "border-[#A855F7]/20" },
  aniversario: { icon: Cake, color: "text-pink-500", bg: "bg-pink-500/10", border: "border-pink-500/20" },
};

export function NotificationsPopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();

  // Fecha ao clicar fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const { data: notificacoes = [] } = useQuery({
    queryKey: ["notificacoes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("notificacoes_internas")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Notificacao[];
    },
    refetchInterval: 60_000, // Poll a cada 60s
  });

  const naoLidas = notificacoes.filter(n => !n.lida).length;

  const markAsReadMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notificacoes_internas").update({ lida: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificacoes"] }),
    onError: (e: Error) => toast.error(mensagemErroAmigavel(e.message)),
  });

  const markAllReadMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("notificacoes_internas").update({ lida: true }).eq("lida", false);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificacoes"] }),
    onError: (e: Error) => toast.error(mensagemErroAmigavel(e.message)),
  });

  function handleAction(n: Notificacao) {
    if (n.acao_link) {
      navigate({ to: n.acao_link as any });
      setOpen(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <Button variant="ghost" size="icon" className="relative" onClick={() => setOpen(!open)} aria-label="Notificações">
        <Bell className="size-5" />
        {naoLidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 size-4.5 rounded-full bg-gradient-to-r from-[#D946EF] to-[#A855F7] text-[9px] font-bold text-white grid place-items-center shadow-glow animate-pulse-soft">
            {naoLidas > 9 ? "9+" : naoLidas}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[min(380px,calc(100vw_-_2rem))] max-h-[500px] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden z-50 animate-fade-up">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border/40">
            <div className="flex items-center gap-2">
              <Bell className="size-4 text-[#D946EF]" />
              <span className="text-sm font-semibold text-card-foreground">Notificações</span>
              {naoLidas > 0 && (
                <span className="text-[10px] bg-[#D946EF]/10 text-[#D946EF] px-2 py-0.5 rounded-full font-medium">{naoLidas} nova{naoLidas > 1 ? "s" : ""}</span>
              )}
            </div>
            {naoLidas > 0 && (
              <button onClick={() => markAllReadMut.mutate()} className="text-[10px] text-muted-foreground hover:text-[#D946EF] transition-colors flex items-center gap-1">
                <CheckCheck className="size-3" /> Marcar todas
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-[380px]">
            {notificacoes.length === 0 ? (
              <div className="p-8 text-center">
                <Sparkles className="size-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Nenhuma notificação ainda</p>
              </div>
            ) : (
              notificacoes.map(n => {
                const cfg = tipoConfig[n.tipo] ?? tipoConfig.info;
                const Icon = cfg.icon;
                return (
                  <div
                    key={n.id}
                    className={`p-4 border-b border-border/20 transition-colors cursor-pointer ${n.lida ? "opacity-60 hover:opacity-80" : "hover:bg-accent/20"} ${n.entidade_id ? "cursor-pointer" : ""}`}
                    onClick={() => {
                      if (!n.lida) markAsReadMut.mutate(n.id);
                      handleAction(n);
                    }}
                  >
                    <div className="flex gap-3">
                      <div className={`size-9 rounded-xl ${cfg.bg} ${cfg.border} border grid place-items-center shrink-0 mt-0.5`}>
                        <Icon className={`size-4 ${cfg.color}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-xs font-medium text-card-foreground ${!n.lida ? "font-semibold" : ""}`}>{n.titulo}</p>
                          <span className="text-[9px] text-muted-foreground shrink-0 whitespace-nowrap">
                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{n.mensagem}</p>
                        {n.acao_texto && (
                          <span className="text-[10px] text-[#D946EF] hover:underline mt-1 inline-block font-medium">{n.acao_texto} →</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
