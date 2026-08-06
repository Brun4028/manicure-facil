/**
 * AI Assistant — Componente Principal
 *
 * Assistente virtual com IA real para o Manicure Fácil.
 *
 * Funcionalidades:
 * - 💬 Chat com memória de 20 mensagens
 * - ✍️ Efeito de digitação progressiva (typing animation)
 * - 📝 Renderização de Markdown (react-markdown)
 * - ⚡ Cache inteligente de perguntas repetidas
 * - 📊 Contexto completo do sistema (11+ indicadores)
 * - 🎯 Sugestões proativas de negócio
 * - ⚙️ Configurações (provedor, temperatura, tokens)
 * - 🔒 Segurança (validação, anti-injection)
 * - 📈 Observabilidade integrada
 *
 * NOTA DE UI: este arquivo contém APENAS ajustes visuais do chat.
 * Toda a lógica (envio, streaming, debounce, contexto, cache) está intacta.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import {
  BrainCircuit, X, Send, Settings2, Trash2, Eraser, Sparkle,
} from "lucide-react";
import { sendToAi, getAiErrorMessage, type AiMessage, type AiContext } from "@/lib/ai/ai-service";
import { aiCache } from "@/lib/ai/ai-cache";
import { MarkdownContent } from "./markdown-content";
import { AiSettingsDialog, getAiSettings } from "./ai-settings-dialog";
import { setAiPanelOpen, useAiPanelOpen } from "./ai-panel-store";

// ─── Constantes ─────────────────────────────────────────────────────────────

const MAX_MESSAGES = 20;
const TYPING_SPEED_MIN = 8;
const TYPING_SPEED_MAX = 25;
const TYPING_PAUSE_PUNCTUATION = 200;
const TYPING_PAUSE_NEWLINE = 300;
// Debounce de envio: impede a MESMA pergunta de ser enviada 2x seguidas
// (duplo clique no botão/Enter) — economiza chamadas à API.
const SEND_DEBOUNCE_MS = 1500;

const SUGGESTIONS = [
  "Como cadastrar uma nova cliente?",
  "Como registrar um agendamento?",
  "Como funciona o ranking de clientes?",
  "Dicas para aumentar meu faturamento",
  "Sugestões de promoções",
  "Como gerenciar o estoque?",
];

const INITIAL_MESSAGE: AiMessage = {
  id: "welcome",
  role: "assistant",
  text: "Olá! ✨ Sou a **assistente virtual** do Manicure Fácil. Estou aqui para ajudar você a administrar melhor seu salão!\n\n💡 **Posso ajudar com:**\n\n📋 Dúvidas sobre o sistema\n💰 Dicas para aumentar seu faturamento\n🎯 Sugestões de marketing e promoções\n📊 Análises com base nos seus dados\n👥 Fidelização de clientes\n📦 Gestão de estoque\n\n**Como posso ajudar você hoje?**",
  timestamp: new Date(),
  suggestions: SUGGESTIONS,
};

// ─── Context Query ──────────────────────────────────────────────────────────

function useAiContext(open: boolean) {
  return useQuery({
    queryKey: ["assistant-context"],
    queryFn: async (): Promise<AiContext> => {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

      const [
        clientesR, agendamentosR, servicosR,
        produtosR, fatMesR,
      ] = await Promise.all([
        supabase.from("clientes").select("id", { count: "exact", head: true }),
        supabase.from("agendamentos").select("id", { count: "exact", head: true }),
        supabase.from("servicos").select("id", { count: "exact", head: true }).eq("ativo", true),
        supabase.from("produtos").select("id, quantidade, quantidade_minima"),
        supabase.from("agendamentos").select("valor, custo, data_hora, status").eq("status", "concluido").gte("data_hora", firstDay).lte("data_hora", lastDay),
      ]);

      const produtos = produtosR.data ?? [];
      const fatMes = fatMesR.data ?? [];

      // Run remaining queries in parallel
      const [
        agsMesR, servicosMaisR,
        contasPendentesR, vencidosR,
        aniversariantesR, metasR,
        clientesAtivosR,
      ] = await Promise.all([
        supabase.from("agendamentos").select("id, data_hora").gte("data_hora", firstDay),
        supabase.from("agendamentos").select("servico_id, servicos(nome)").eq("status", "concluido").gte("data_hora", firstDay),
        supabase.from("agendamentos").select("valor").eq("status", "concluido").eq("pagamento", "pendente"),
        supabase.from("agendamentos").select("valor").not("status", "in", ["concluido", "cancelado"]).lt("data_hora", now.toISOString()),
        supabase.from("clientes").select("id", { count: "exact", head: true }).like("data_nascimento", `%-${String(now.getMonth() + 1).padStart(2, "0")}-%`),
        supabase.from("metas_mensais").select("faturamento_alvo, lucro_alvo").eq("mes_ano", `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`).maybeSingle(),
        supabase.from("agendamentos").select("cliente_id").eq("status", "concluido").gte("data_hora", new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      ]);

      const servicosMais = servicosMaisR?.data ?? [];

      // Estoque baixo
      const estoqueBaixo = produtos.filter(
        (p: any) => p.quantidade <= p.quantidade_minima,
      ).length;

      // Faturamento e lucro do mês
      const faturamentoMes = fatMes.reduce((s: number, a: any) => s + Number(a.valor), 0);
      const custoMes = fatMes.reduce((s: number, a: any) => s + Number(a.custo || 0), 0);
      const lucroMes = faturamentoMes - custoMes;

      // Contas a receber
      const contasAReceber = (contasPendentesR?.data ?? []).reduce(
        (s: number, a: any) => s + Number(a.valor), 0,
      );

      // Contas vencidas
      const contasVencidas = (vencidosR?.data ?? []).reduce(
        (s: number, a: any) => s + Number(a.valor), 0,
      );

      // Aniversariantes
      const aniversariantesMes = aniversariantesR?.count ?? 0;

      // Metas
      const metas = metasR?.data;

      // Serviços mais vendidos
      const servicoCount: Record<string, { nome: string; count: number }> = {};
      (servicosMais as any[] ?? []).forEach((a: any) => {
        const nome = a.servicos?.nome ?? "Desconhecido";
        if (!servicoCount[nome]) servicoCount[nome] = { nome, count: 0 };
        servicoCount[nome].count++;
      });
      const topServicos = Object.values(servicoCount)
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map((s) => `${s.nome} (${s.count}x)`)
        .join(", ");

      // Clientes inativas
      const clientesUnicos = new Set((clientesAtivosR?.data ?? []).map((a: any) => a.cliente_id));
      const totalClientes = clientesR.count ?? 0;
      const clientesInativos = Math.max(0, totalClientes - clientesUnicos.size);

      // Ticket médio
      const totalAgendamentosMes = fatMes.length;
      const ticketMedio = totalAgendamentosMes > 0 ? faturamentoMes / totalAgendamentosMes : 0;

      // Ocupação da agenda
      const diasUteis = 22;
      const horariosPorDia = 8;
      const totalSlots = diasUteis * horariosPorDia;
      const ocupacaoAgenda = totalSlots > 0
        ? Math.min(100, Math.round(((agsMesR?.data?.length ?? 0) / totalSlots) * 100))
        : 0;

      return {
        totalClientes: clientesR.count ?? 0,
        totalAgendamentos: agendamentosR.count ?? 0,
        totalServicos: servicosR.count ?? 0,
        faturamentoMes,
        estoqueBaixo,
        contasAReceber,
        contasVencidas,
        aniversariantesMes,
        metasFaturamento: Number(metas?.faturamento_alvo ?? 0),
        metasLucro: Number(metas?.lucro_alvo ?? 0),
        servicosMaisVendidos: topServicos || "Nenhum ainda",
        clientesInativos,
        ticketMedio,
        ocupacaoAgenda,
        lucroMes,
      };
    },
    enabled: open,
    staleTime: 60_000,
  });
}

// ─── Componente Principal ───────────────────────────────────────────────────

export function AiAssistant() {
  const open = useAiPanelOpen();

  // Se o shell desmontar (ex.: logout), o mini-store externo não pode ficar
  // "preso" em aberto — senão o painel reabriria sozinho no próximo login.
  useEffect(() => {
    return () => setAiPanelOpen(false);
  }, []);
  const [messages, setMessages] = useState<AiMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [isWaiting, setIsWaiting] = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  // Rastreia qual mensagem do assistente está com a animação em voo.
  // Evita que uma resposta antiga (de uma sessão anterior do painel) libere
  // o input enquanto uma mensagem MAIS NOVA ainda está sendo digitada.
  const activeStreamRef = useRef<string | null>(null);
  // Debounce de envio: impede requisições duplicadas por cliques repetidos
  // (duplo clique no botão/Enter) ou a MESMA pergunta enviada 2x seguidas.
  const lastSendRef = useRef<{ text: string; at: number } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Rastreia o timer da animação de digitação para limpeza no unmount.
  const typeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Limpa a cadeia de setTimeouts da animação de digitação ao desmontar
  // (ex.: logout) — evita ciclos de setState e timers órfãos após a saída.
  useEffect(() => {
    return () => {
      if (typeTimerRef.current) clearTimeout(typeTimerRef.current);
    };
  }, []);

  const { data: context } = useAiContext(open);

  // ── Scroll automático ──────────────────────────────────────────
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "instant" });
      });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isWaiting, streamingMsgId, scrollToBottom]);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 400);
    }
  }, [open]);

  // ── Auto-reset de segurança ────────────────────────────────────────
  // Se `isWaiting` ou `streamingMsgId` ficarem presos (ex: exceção numa
  // animação assíncrona), o input do chat permaneceria desabilitado para
  // sempre. Ao reabrir o painel, garantimos que o estado sempre volte a
  // zero — o input nunca pode ficar bloqueado.
  useEffect(() => {
    if (open) {
      setIsWaiting(false);
      setStreamingMsgId(null);
      activeStreamRef.current = null;
    }
  }, [open]);

  // ── Progresso da digitação ──────────────────────────────────────
  const updateStreamingText = useCallback((msgId: string, partial: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, text: partial } : m)),
    );
    scrollToBottom();
  }, [scrollToBottom]);

  // ── Envio de mensagem ────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isWaiting) return;

      // ── Debounce: mesma pergunta dentro de 1.5s é ignorada ──
      // Evita que o usuário (ou um duplo clique) dispare a mesma
      // requisição várias vezes seguidas — economiza chamadas à API.
      const now = Date.now();
      const last = lastSendRef.current;
      if (last && last.text === trimmed && now - last.at < SEND_DEBOUNCE_MS) {
        return;
      }
      lastSendRef.current = { text: trimmed, at: now };

      const currentMessages = messagesRef.current;

      const userMsg: AiMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        text: text.trim().slice(0, 2000),
        timestamp: new Date(),
      };

      const assistantMsgId = `ai-${Date.now() + 1}`;
      const assistantPlaceholder: AiMessage = {
        id: assistantMsgId,
        role: "assistant",
        text: "",
        timestamp: new Date(),
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantPlaceholder]);
      setInput("");
      setIsWaiting(true);
      setStreamingMsgId(assistantMsgId);
      activeStreamRef.current = assistantMsgId;

      try {
        // Prepara histórico (exclui streaming, mantém boas-vindas)
        const baseHistory = currentMessages[0]?.id === "welcome"
          ? [currentMessages[0]]
          : [];
        const recentHistory = currentMessages
          .filter((m) => !m.isStreaming && m.id !== "welcome")
          .slice(-(MAX_MESSAGES - 4));
        const historyForAi = [...baseHistory, ...recentHistory];

        // Lê as settings atuais
        const settings = getAiSettings();

        const response = await sendToAi(text, historyForAi, context, {
          historyLength: 10,
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
          provider: settings.provider,
        });

        // Anima caractere por caractere
        // 🔧 PROTEÇÃO: o setTimeout é assíncrono — qualquer exceção aqui
        // escaparia do try/catch e deixaria `isWaiting` preso em true,
        // desabilitando o input para sempre. Por isso o callback é
        // envolvido em try/catch próprio e `response.text` é protegido.
        typeTimerRef.current = setTimeout(() => {
          try {
            let charIndex = 0;
            const fullText = typeof response.text === "string" ? response.text : "";
            const typeNextChar = () => {
              if (charIndex < fullText.length) {
                updateStreamingText(assistantMsgId, fullText.slice(0, charIndex + 1));
                charIndex++;

                const char = fullText[charIndex - 1];
                let delay = TYPING_SPEED_MIN + Math.random() * (TYPING_SPEED_MAX - TYPING_SPEED_MIN);
                if (char === "." || char === "!" || char === "?" || char === ":") delay += TYPING_PAUSE_PUNCTUATION;
                else if (char === "\n") delay += TYPING_PAUSE_NEWLINE;
                typeTimerRef.current = setTimeout(typeNextChar, delay);
              } else {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, text: fullText, suggestions: response.suggestions, isStreaming: false }
                      : m,
                  ),
                );
                // Só libera o input se ESTA mensagem ainda for a animação ativa
                if (activeStreamRef.current === assistantMsgId) {
                  setStreamingMsgId(null);
                  setIsWaiting(false);
                  activeStreamRef.current = null;
                }
              }
            };
            typeNextChar();
          } catch (animationError) {
            // Nunca deixa o chat preso: mesmo com erro na animação,
            // finaliza a mensagem e libera o input.
            console.error("[AI] Erro na animação de digitação:", animationError);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      text:
                        typeof response.text === "string" && response.text.length > 0
                          ? response.text
                          : "🤖 Recebi sua pergunta! Mas tive um problema ao exibir a resposta. Tente novamente.",
                      suggestions: response.suggestions,
                      isStreaming: false,
                    }
                  : m,
              ),
            );
            if (activeStreamRef.current === assistantMsgId) {
              setStreamingMsgId(null);
              setIsWaiting(false);
              activeStreamRef.current = null;
            }
          }
        }, 120);
      } catch (error) {
        // Libera o debounce para retry imediato em caso de erro
        lastSendRef.current = null;
        const errorMessage = getAiErrorMessage(error);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  text: errorMessage,
                  suggestions:
                    errorMessage.includes("temporariamente") || errorMessage.includes("indisponível")
                      ? ["Como funciona o sistema?", "Tentar novamente"]
                      : ["Tentar novamente", "Como cadastrar uma cliente?"],
                  isStreaming: false,
                }
              : m,
          ),
        );
        if (activeStreamRef.current === assistantMsgId) {
          setStreamingMsgId(null);
          setIsWaiting(false);
          activeStreamRef.current = null;
        }
      }
    },
    [isWaiting, context, updateStreamingText, scrollToBottom],
  );

  const handleSuggestionClick = useCallback(
    (suggestion: string) => sendMessage(suggestion),
    [sendMessage],
  );

  const handleClearChat = useCallback(() => {
    setMessages([INITIAL_MESSAGE]);
    aiCache.clear();
    setInput("");
    // Limpar a conversa também libera o estado de espera, caso haja
    // uma requisição/animacão em voo — o input nunca fica preso.
    setIsWaiting(false);
    setStreamingMsgId(null);
    activeStreamRef.current = null;
  }, []);

  // ── Lista de mensagens memoizada ────────────────────────────────
  const messageList = useMemo(
    () =>
      messages.map((msg) => {
        const isStreaming = msg.id === streamingMsgId;
        const showTypingBounce = isStreaming && msg.text.length === 0;

        // Balão do usuário: gradiente da marca, canto "cauda" inferior direito
        if (msg.role === "user") {
          return (
            <div key={msg.id} className="flex justify-end animate-fade-up">
              <div className="max-w-[88%] sm:max-w-[80%] space-y-2">
                <div className="rounded-2xl rounded-br-md bg-gradient-to-br from-[#D946EF] to-[#A855F7] text-white px-4 py-3 text-sm leading-relaxed shadow-[0_8px_24px_rgba(217,70,239,0.28)]">
                  <div className="whitespace-pre-wrap">{msg.text}</div>
                </div>
              </div>
            </div>
          );
        }

        // Balão da IA: vidro fosco com avatar, canto "cauda" inferior esquerdo
        return (
          <div key={msg.id} className="flex justify-start animate-fade-up">
            <div className="flex items-end gap-2.5 max-w-[94%] sm:max-w-[88%]">
              {/* Avatar da IA */}
              <div className="size-8 shrink-0 rounded-xl bg-gradient-to-br from-[#D946EF] to-[#A855F7] grid place-items-center shadow-glow">
                <BrainCircuit className="size-4 text-white" />
              </div>

              <div className="min-w-0 space-y-2">
                <div className="rounded-2xl rounded-bl-md bg-muted/70 border border-border/70 backdrop-blur-sm px-4 py-3 text-sm leading-relaxed text-card-foreground shadow-card">
                  {showTypingBounce ? (
                    <div className="flex items-center gap-1.5 py-1.5">
                      <span className="size-2 rounded-full bg-gradient-to-br from-[#D946EF] to-[#A855F7] animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="size-2 rounded-full bg-gradient-to-br from-[#D946EF] to-[#A855F7] animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="size-2 rounded-full bg-gradient-to-br from-[#D946EF] to-[#A855F7] animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  ) : (
                    <MarkdownContent content={msg.text} />
                  )}
                </div>

                {msg.suggestions && msg.suggestions.length > 0 && !isStreaming && (
                  <div className="flex flex-wrap gap-2 pt-0.5">
                    {msg.suggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => handleSuggestionClick(s)}
                        style={{ animationDelay: `${i * 45}ms` }}
                        className="group flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-full border border-[#D946EF]/25 bg-[#D946EF]/[0.04] text-muted-foreground animate-fade-up hover:text-[#D946EF] hover:border-[#D946EF]/50 hover:bg-[#D946EF]/10 hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(217,70,239,0.15)] active:translate-y-0 active:scale-95 transition-all duration-200"
                      >
                        <Sparkle className="size-3 opacity-50 group-hover:opacity-100 group-hover:scale-110 transition-all" />
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      }),
    [messages, streamingMsgId, handleSuggestionClick],
  );

  return (
    <>
      {/* ── Overlay ─────────────────────────────────────────────── */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[2px]" onClick={() => setAiPanelOpen(false)} />
      )}

      {/* ── Panel ───────────────────────────────────────────────── */}
      <div
        className={`fixed bottom-0 right-0 z-50 w-full sm:w-[430px] h-[88vh] sm:h-[640px] sm:bottom-6 sm:right-6 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          open ? "translate-y-0 opacity-100 scale-100" : "translate-y-10 opacity-0 scale-[0.98] pointer-events-none"
        }`}
      >
        {/* Moldura com gradiente da marca */}
        <div className="h-full w-full p-[1.5px] rounded-t-[24px] sm:rounded-[24px] bg-gradient-to-br from-[#D946EF]/60 via-[#A855F7]/35 to-[#6366F1]/25 shadow-[0_32px_80px_-24px_rgba(217,70,239,0.35)]">
          <div className="h-full w-full rounded-t-[22.5px] sm:rounded-[22.5px] bg-card overflow-hidden flex flex-col">
            {/* ── Header premium ─────────────────────────────────── */}
            <div className="relative shrink-0 overflow-hidden bg-gradient-to-r from-[#D946EF] via-[#C026D3] to-[#A855F7] px-4 py-4">
              {/* Glows decorativos */}
              <div className="pointer-events-none absolute -top-12 -right-10 size-44 rounded-full bg-white/15 blur-3xl" aria-hidden="true" />
              <div className="pointer-events-none absolute -bottom-16 -left-10 size-40 rounded-full bg-fuchsia-950/30 blur-3xl" aria-hidden="true" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/25" aria-hidden="true" />

              <div className="relative flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <div className="size-11 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/25 grid place-items-center shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
                      <BrainCircuit className="size-6 text-white drop-shadow" />
                    </div>
                    <span
                      className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-emerald-400 border-2 border-[#D946EF] animate-pulse-soft"
                      aria-hidden="true"
                    />
                  </div>

                  <div className="min-w-0">
                    <h2 className="font-display text-[15px] font-semibold text-white truncate leading-tight">Assistente IA</h2>
                    <p className="flex items-center gap-1.5 text-[10px] text-white/80 truncate mt-0.5">
                      <span className="size-1.5 rounded-full bg-emerald-300 animate-pulse-soft" aria-hidden="true" />
                      Online · Consultora de gestão inteligente
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)}
                    className="size-8 rounded-xl bg-white/10 text-white hover:bg-white/20 hover:text-white backdrop-blur-sm transition-colors" aria-label="Configurações"
                  ><Settings2 className="size-4" /></Button>
                  {messages.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={handleClearChat}
                      className="size-8 rounded-xl bg-white/10 text-white hover:bg-white/20 hover:text-white backdrop-blur-sm transition-colors" aria-label="Limpar conversa"
                    ><Eraser className="size-4" /></Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => setAiPanelOpen(false)}
                    className="size-8 rounded-xl bg-white/10 text-white hover:bg-white/20 hover:text-white backdrop-blur-sm transition-colors" aria-label="Fechar"
                  ><X className="size-5" /></Button>
                </div>
              </div>
            </div>

            {/* ── Messages ────────────────────────────────────── */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto scrollbar-thin px-4 sm:px-5 py-5 space-y-5 bg-card bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(217,70,239,0.07),transparent)]"
            >
              {messageList}
            </div>

            {/* ── Input premium ───────────────────────────────── */}
            <div className="shrink-0 bg-card/90 backdrop-blur-xl border-t border-border p-3 sm:p-4 pb-3">
              <div className="rounded-2xl border border-border bg-muted/40 shadow-card transition-all duration-200 focus-within:border-[#D946EF]/50 focus-within:ring-2 focus-within:ring-[#D946EF]/15 p-1.5 pl-3">
                <form
                  onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
                  className="flex items-center gap-1.5"
                >
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Digite sua pergunta..."
                    className="flex-1 h-10 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-1 text-sm placeholder:text-muted-foreground/70"
                    disabled={isWaiting}
                  />
                  <Button
                    type="submit" size="icon"
                    disabled={!input.trim() || isWaiting}
                    className="size-10 rounded-xl shrink-0 bg-gradient-to-br from-[#D946EF] to-[#A855F7] text-white shadow-[0_4px_16px_rgba(217,70,239,0.3)] hover:shadow-[0_4px_24px_rgba(217,70,239,0.45)] hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-[0_4px_16px_rgba(217,70,239,0.3)]"
                    aria-label="Enviar mensagem"
                  ><Send className="size-4" /></Button>
                </form>
              </div>
              <div className="flex items-center justify-between mt-2 px-1">
                <p className="text-[10px] text-muted-foreground/80 truncate">
                  {context ? `${context.totalClientes} clientes • ${context.totalAgendamentos} agendamentos` : "Carregando dados..."}
                </p>
                <button type="button" onClick={handleClearChat}
                  className="text-[10px] text-muted-foreground/80 hover:text-[#D946EF] transition-colors flex items-center gap-1 shrink-0"
                ><Trash2 className="size-3" /> Limpar</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Settings Dialog ────────────────────────────────────── */}
      <AiSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
