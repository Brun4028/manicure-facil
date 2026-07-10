/**
 * AI Chat — Server Function (client-callable)
 *
 * createServerFn que recebe a mensagem, contexto e configurações do cliente,
 * e chama os provedores de IA (OpenAI/Gemini) com fallback.
 *
 * Segurança:
 * - Validação rigorosa de entrada com Zod
 * - Limite de tamanho de mensagens
 * - Detecção de prompt injection no servidor
 * - Limite de histórico
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// ─── Limites de segurança ───────────────────────────────────────────────────

const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_LENGTH = 20;
const MAX_CONTEXT_STRING_LENGTH = 500;

// ─── Validação de segurança server-side ─────────────────────────────────────

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|above|prior|instructions?)/i,
  /forget\s+(all\s+)?(previous|above|prior)/i,
  /you\s+are\s+(not\s+)?(required\s+to|obligated\s+to)/i,
  /disregard\s+(all\s+)?(previous|above)/i,
  /new\s+(instructions?|prompt|rules?):/i,
  /system\s+(prompt|instructions?|message)/i,
];

function detectPromptInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

// ─── Schema de validação ────────────────────────────────────────────────────

const messageSchema = z
  .string()
  .min(1, "Mensagem não pode estar vazia")
  .max(MAX_MESSAGE_LENGTH, `Mensagem muito longa (máx. ${MAX_MESSAGE_LENGTH} caracteres)`);

const historyItemSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(MAX_MESSAGE_LENGTH * 2),
});

const contextSchema = z.object({
  appName: z.string().min(1).max(MAX_CONTEXT_STRING_LENGTH),
  appDescription: z.string().min(1).max(MAX_CONTEXT_STRING_LENGTH),
  totalClientes: z.number().int().min(0),
  totalAgendamentos: z.number().int().min(0),
  totalServicos: z.number().int().min(0),
  faturamentoMes: z.number().min(0),
  estoqueBaixo: z.number().int().min(0),
  contasAReceber: z.number().min(0),
  contasVencidas: z.number().min(0),
  aniversariantesMes: z.number().int().min(0),
  metasFaturamento: z.number().min(0),
  metasLucro: z.number().min(0),
  servicosMaisVendidos: z.string().max(MAX_CONTEXT_STRING_LENGTH),
  clientesInativos: z.number().int().min(0),
  ticketMedio: z.number().min(0),
  ocupacaoAgenda: z.number().min(0).max(100),
  lucroMes: z.number().min(0),
});

// Configurações opcionais do cliente (override das env vars)
const settingsSchema = z.object({
  provider: z.enum(["openai", "gemini"]).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(64).max(8192).optional(),
}).optional().default({});

const inputSchema = z.object({
  message: messageSchema,
  history: z.array(historyItemSchema).max(MAX_HISTORY_LENGTH).default([]),
  context: contextSchema,
  settings: settingsSchema,
});

// ─── Server Function ────────────────────────────────────────────────────────

export const getAiChatResponse = createServerFn({ method: "POST" })
  .inputValidator(inputSchema)
  .handler(async ({ data }) => {
    const { callOpenAI, callGemini, buildSystemPrompt } = await import(
      "./ai-providers.server"
    );

    const { message, history, context, settings } = data;
    const effectiveSettings = settings ?? {};

    // ── Verificação de prompt injection ──────────────────────────
    if (detectPromptInjection(message)) {
      const { AiServiceError } = await import("./ai-service");
      throw new AiServiceError(
        "content-filter",
        "Prompt injection detected in message",
        "🚫 Sua pergunta foi bloqueada pelos filtros de segurança. Reformule de outra forma, por favor.",
      );
    }

    for (const h of history) {
      if (detectPromptInjection(h.text)) {
        const { AiServiceError } = await import("./ai-service");
        throw new AiServiceError(
          "content-filter",
          "Prompt injection detected in history",
          "🚫 Detectamos um padrão suspeito no histórico da conversa. Vamos começar uma nova conversa.",
        );
      }
    }

    // ── Monta mensagens para a IA ────────────────────────────────
    const systemPrompt = buildSystemPrompt(context);
    const chatMessages: { role: string; content: string }[] = [
      { role: "system", content: systemPrompt },
    ];

    for (const h of history) {
      chatMessages.push({ role: h.role, content: h.text });
    }

    chatMessages.push({ role: "user", content: message });

    // ── Determina provedor: client setting > env var > openai ────
    const provider = effectiveSettings.provider ??
      (process.env.AI_PROVIDER ?? "openai").toLowerCase() as "openai" | "gemini";

    // Prepara overrides de configuração
    const configOverrides = {
      temperature: effectiveSettings.temperature,
      maxTokens: effectiveSettings.maxTokens,
    };

    // ── Executa com fallback ──────────────────────────────────────
    try {
      if (provider === "gemini") {
        return await callGemini(chatMessages, configOverrides);
      }
      return await callOpenAI(chatMessages, configOverrides);
    } catch (primaryError: any) {
      // Se for rate-limit ou api-error, tenta o outro provedor
      if (
        primaryError &&
        typeof primaryError === "object" &&
        "code" in primaryError &&
        typeof primaryError.code === "string" &&
        ["rate-limit", "api-error"].includes(primaryError.code)
      ) {
        const fallbackProvider = provider === "gemini" ? "openai" : "gemini";
        try {
          return fallbackProvider === "gemini"
            ? await callGemini(chatMessages, configOverrides)
            : await callOpenAI(chatMessages, configOverrides);
        } catch {
          // Fallback também falhou — propaga o erro original
        }
      }

      throw primaryError;
    }
  });
