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
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  Sparkles, X, Send, Bot, Settings2, Trash2, Eraser,
} from "lucide-react";
import { sendToAi, getAiErrorMessage, type AiMessage, type AiContext } from "@/lib/ai/ai-service";
import { aiCache } from "@/lib/ai/ai-cache";
import { MarkdownContent } from "./markdown-content";
import { AiSettingsDialog, getAiSettings, type AiSettings } from "./ai-settings-dialog";

// ─── Constantes ─────────────────────────────────────────────────────────────

const MAX_MESSAGES = 20;
const TYPING_SPEED_MIN = 8;
const TYPING_SPEED_MAX = 25;
const TYPING_PAUSE_PUNCTUATION = 200;
const TYPING_PAUSE_NEWLINE = 300;

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

      const agsMes = agsMesR.data ?? [];
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
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AiMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [isWaiting, setIsWaiting] = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

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
      if (!text.trim() || isWaiting) return;
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

        const response = await sendToAi(text, historyForAi, context!, {
          historyLength: 10,
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
          provider: settings.provider,
        });

        // Anima caractere por caractere
        setTimeout(() => {
          let charIndex = 0;
          const fullText = response.text;
          const typeNextChar = () => {
            if (charIndex < fullText.length) {
              updateStreamingText(assistantMsgId, fullText.slice(0, charIndex + 1));
              charIndex++;

              const char = fullText[charIndex - 1];
              let delay = TYPING_SPEED_MIN + Math.random() * (TYPING_SPEED_MAX - TYPING_SPEED_MIN);
              if (char === "." || char === "!" || char === "?" || char === ":") delay += TYPING_PAUSE_PUNCTUATION;
              else if (char === "\n") delay += TYPING_PAUSE_NEWLINE;
              setTimeout(typeNextChar, delay);
            } else {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, text: fullText, suggestions: response.suggestions, isStreaming: false }
                    : m,
                ),
              );
              setStreamingMsgId(null);
              setIsWaiting(false);
            }
          };
          typeNextChar();
        }, 120);
      } catch (error) {
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
        setStreamingMsgId(null);
        setIsWaiting(false);
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
  }, []);

  // ── Lista de mensagens memoizada ────────────────────────────────
  const messageList = useMemo(
    () =>
      messages.map((msg) => {
        const isStreaming = msg.id === streamingMsgId;
        const showTypingBounce = isStreaming && msg.text.length === 0;

        return (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div className={`max-w-[92%] space-y-2 ${msg.role === "user" ? "order-1" : ""}`}>
              <div
                className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-gradient-to-r from-[#D946EF] to-[#A855F7] text-white rounded-br-lg"
                    : "bg-muted border border-border text-card-foreground rounded-bl-lg"
                }`}
              >
                <div className="flex items-start gap-2">
                  {msg.role === "assistant" && (
                    <Bot className="size-4 mt-1 shrink-0 text-[#D946EF]" />
                  )}
                  <div className="min-w-0 flex-1">
                    {showTypingBounce ? (
                      <div className="flex items-center gap-1.5 py-1">
                        <span className="size-2 rounded-full bg-[#D946EF] animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="size-2 rounded-full bg-[#D946EF] animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="size-2 rounded-full bg-[#D946EF] animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    ) : msg.role === "assistant" ? (
                      <MarkdownContent content={msg.text} />
                    ) : (
                      <div className="whitespace-pre-wrap">{msg.text}</div>
                    )}
                  </div>
                </div>
              </div>

              {msg.suggestions && msg.suggestions.length > 0 && !isStreaming && (
                <div className="flex flex-wrap gap-1.5">
                  {msg.suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleSuggestionClick(s)}
                      className="text-xs px-3 py-1.5 rounded-full bg-[#D946EF]/5 border border-[#D946EF]/20 text-muted-foreground hover:text-[#D946EF] hover:border-[#D946EF]/40 hover:bg-[#D946EF]/10 transition-all"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      }),
    [messages, streamingMsgId, handleSuggestionClick],
  );

  return (
    <>
      {/* ── Floating Button ────────────────────────────────────── */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-6 z-50 size-14 rounded-full bg-gradient-to-r from-[#D946EF] to-[#A855F7] text-white shadow-[0_4px_24px_rgba(217,70,239,0.25)] grid place-items-center hover:scale-105 active:scale-95 transition-all duration-300 animate-fade-up group"
        aria-label="Abrir assistente"
      >
        <Sparkles className="size-6 group-hover:rotate-12 transition-transform duration-300" />
        <span className="absolute inset-0 rounded-full bg-gradient-to-r from-[#D946EF] to-[#A855F7] animate-ping opacity-20" />
      </button>

      {/* ── Overlay ─────────────────────────────────────────────── */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm" onClick={() => setOpen(false)} />
      )}

      {/* ── Panel ───────────────────────────────────────────────── */}
      <div
        className={`fixed bottom-0 right-0 z-50 w-full sm:w-[420px] h-[85vh] sm:h-[600px] sm:bottom-6 sm:right-6 sm:rounded-2xl bg-card border border-border shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          open ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0 pointer-events-none"
        }`}
      >
        {/* ── Header ──────────────────────────────────────────── */}
        <div className="shrink-0 bg-gradient-to-r from-[#D946EF] to-[#A855F7] p-4 sm:rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="size-10 rounded-xl bg-white/15 grid place-items-center backdrop-blur-sm shrink-0">
                <Sparkles className="size-5 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-base font-semibold text-white truncate">Assistente IA</h2>
                <p className="text-[10px] text-white/70 truncate">Consultora de gestão inteligente</p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)}
                className="text-white/80 hover:text-white hover:bg-white/10 rounded-xl size-8" aria-label="Configurações"
              ><Settings2 className="size-4" /></Button>
              {messages.length > 1 && (
                <Button variant="ghost" size="icon" onClick={handleClearChat}
                  className="text-white/80 hover:text-white hover:bg-white/10 rounded-xl size-8" aria-label="Limpar conversa"
                ><Eraser className="size-4" /></Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)}
                className="text-white/80 hover:text-white hover:bg-white/10 rounded-xl size-8" aria-label="Fechar"
              ><X className="size-5" /></Button>
            </div>
          </div>
        </div>

        {/* ── Messages ────────────────────────────────────────── */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
          {messageList}
        </div>

        {/* ── Input ───────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-border p-4 bg-card">
          <form
            onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
            className="flex items-center gap-2"
          >
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Digite sua pergunta..."
              className="flex-1 rounded-xl bg-muted border-border focus-visible:ring-[#D946EF]"
              disabled={isWaiting}
            />
            <Button
              type="submit" size="icon"
              disabled={!input.trim() || isWaiting}
              className="rounded-xl bg-gradient-to-r from-[#D946EF] to-[#A855F7] text-white hover:opacity-90 shadow-[0_2px_12px_rgba(217,70,239,0.15)] shrink-0 disabled:opacity-50"
            ><Send className="size-4" /></Button>
          </form>
          <div className="flex items-center justify-between mt-2">
            <p className="text-[10px] text-muted-foreground">
              {context ? `${context.totalClientes} clientes • ${context.totalAgendamentos} agendamentos` : "Carregando dados..."}
            </p>
            <button type="button" onClick={handleClearChat}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            ><Trash2 className="size-3" /> Limpar</button>
          </div>
        </div>
      </div>

      {/* ── Settings Dialog ────────────────────────────────────── */}
      <AiSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
