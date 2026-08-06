/**
 * AI Chat — Server Function (client-callable)
 *
 * createServerFn que recebe a mensagem, contexto e configurações do cliente,
 * e chama os provedores de IA (OpenAI/Gemini) com fallback.
 *
 * 🔧 CORREÇÃO ETAPA 3 (auditoria):
 * - O TanStack Start serializa erros lançados aqui preservando APENAS
 *   `message`. Por isso este handler NÃO lança classes de erro customizadas
 *   para o cliente: ele captura tudo, registra em logs internos e retorna um
 *   ENVELOPE serializável { ok:true|false, code, message, userMessage }.
 * - Todas as falhas são logadas no console + aiLogger para manutenção.
 * - Autenticação obrigatória (requireSupabaseAuth) — evita queima da chave
 *   de API por usuários não autenticados.
 * - Leitura de env vars robusta (process.env + fallback para arquivo .env),
 *   garantindo que a chave funcione em dev, Docker e produção.
 *
 * Segurança:
 * - Validação rigorosa de entrada com Zod
 * - Limite de tamanho de mensagens
 * - Detecção de prompt injection no servidor
 * - Limite de histórico
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiLogger } from "./ai-logger";
import { AiServiceError, mensagemAmigavel, type AiErrorCode } from "./ai-errors";

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
const settingsSchema = z
  .object({
    provider: z.enum(["openai", "gemini"]).optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().min(1024).max(8192).optional(),
  })
  .optional()
  .default({});

const inputSchema = z.object({
  message: messageSchema,
  history: z.array(historyItemSchema).max(MAX_HISTORY_LENGTH).default([]),
  context: contextSchema,
  settings: settingsSchema,
});

// ─── Envelope de resposta (serializável — atravessa o RPC sem perdas) ───────

export type AiChatSuccess = {
  ok: true;
  text: string;
  suggestions?: string[];
};

export type AiChatFailure = {
  ok: false;
  code: AiErrorCode;
  message: string;
  userMessage: string;
};

export type AiChatResponse = AiChatSuccess | AiChatFailure;

function success(text: string, suggestions?: string[]): AiChatSuccess {
  return { ok: true, text, suggestions };
}

function failure(code: AiErrorCode, message: string, userMessage?: string): AiChatFailure {
  return { ok: false, code, message, userMessage: userMessage ?? mensagemAmigavel(code) };
}

// ─── Conversão de erro → envelope (compartilhada) ──────────────────────────

function toFailureEnvelope(error: unknown): AiChatFailure {
  if (error instanceof AiServiceError) {
    return failure(error.code, error.message, error.userMessage);
  }
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    const e = error as { code: AiErrorCode; message: string; userMessage?: string };
    return failure(e.code, e.message, e.userMessage);
  }
  // Falha de rede real (fetch) — não confundir com erro de API
  if (error instanceof TypeError) {
    return failure("network", error.message);
  }
  // 🔧 Exceção inesperada (não tipada) — NUNCA esconder a causa real.
  // Registra o erro completo com stack antes de mapear para api-error.
  const msg = error instanceof Error ? error.message : String(error);
  console.error(
    `[AI UNEXPECTED ERROR] Mapeado para api-error (causa original): ${msg}`,
    error instanceof Error
      ? { stack: error.stack, originalError: error }
      : { originalError: error },
  );
  return failure("api-error", msg);
}

// ─── Logging server-side ────────────────────────────────────────────────────

type LogMeta = {
  // "unknown" cobre a rede de segurança externa (exceções em imports,
  // buildSystemPrompt etc. que não pertencem a um provider específico).
  provider: "openai" | "gemini" | "unknown";
  model: string;
  startTime: number;
  messageLength: number;
  userId?: string;
};

function logServerError(meta: LogMeta, error: unknown): void {
  const normalized =
    error instanceof AiServiceError
      ? { code: error.code, message: error.message, userMessage: error.userMessage }
      : error && typeof error === "object" && "code" in error
        ? {
            code: (error as { code: AiErrorCode }).code,
            message: String((error as { message?: unknown }).message ?? "unknown"),
            userMessage: (error as { userMessage?: string }).userMessage,
          }
        : {
            code: "unknown" as const,
            message: error instanceof Error ? error.message : String(error),
            userMessage: mensagemAmigavel("unknown"),
          };

  // Limite de cota (rate-limit) não é erro crítico — registra como warn.
  const isWarn = normalized.code === "rate-limit";

  try {
    aiLogger.log(
      aiLogger.createLog({
        provider: meta.provider,
        model: meta.model,
        startTime: meta.startTime,
        messageLength: meta.messageLength,
        responseLength: 0,
        success: false,
        warn: isWarn,
        error: `${normalized.code}: ${normalized.message}`,
        cached: false,
      }),
    );
  } catch {
    /* logging nunca deve quebrar a request */
  }

  // 🔧 Log COMPLETO da exceção original (incluindo stack trace) para que
  // nenhuma falha real seja escondida atrás de mensagens genéricas.
  const stack = error instanceof Error ? error.stack : undefined;
  const logFn = isWarn ? console.warn : console.error;
  logFn(
    `[AI ${isWarn ? "RATE LIMIT" : "SERVER ERROR"}] ${normalized.code} (${meta.provider}/${meta.model}) — ${normalized.message}`,
    {
      userId: meta.userId ?? "unknown",
      timestamp: new Date().toISOString(),
      originalError: error,
      stack,
    },
  );
}

// ─── Server Function ────────────────────────────────────────────────────────

export const getAiChatResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema)
  .handler(async ({ data, context }): Promise<AiChatResponse> => {
    // 🔧 REDE DE SEGURANÇA FINAL: o corpo inteiro da antiga handler roda
    // dentro de `handleAiChat`. Qualquer exceção (inclusive em imports
    // dinâmicos, buildSystemPrompt, determinação de provider etc.) é
    // capturada aqui, registrada COM STACK TRACE e retornada como envelope
    // honesto — nenhuma falha real pode mais escapar sem log.
    try {
      return await handleAiChat(data, context);
    } catch (unexpectedError) {
      logServerError(
        {
          provider: "unknown",
          model: "n/a",
          startTime: Date.now(),
          messageLength: typeof data?.message === "string" ? data.message.length : 0,
          userId: (context as { userId?: string } | undefined)?.userId ?? "unknown",
        },
        unexpectedError,
      );
      return toFailureEnvelope(unexpectedError);
    }
  });

// ─── Diagnóstico de configuração (pós-deploy) ───────────────────────────────
// Permite ao usuário verificar, na interface, se as variáveis de IA realmente
// chegaram ao servidor (ex.: após adicionar GEMINI_API_KEY na Vercel).
// NUNCA retorna segredos — apenas flags booleanas + nomes de configuração.

export const getAiConfigStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async (): Promise<{
      provider: string;
      geminiConfigured: boolean;
      openaiConfigured: boolean;
      nodeEnv: string;
    }> => {
      const { getServerEnv } = await import("../config.server");
      return {
        provider: getServerEnv("AI_PROVIDER") ?? "openai",
        geminiConfigured: Boolean(getServerEnv("GEMINI_API_KEY")),
        openaiConfigured: Boolean(getServerEnv("OPENAI_API_KEY")),
        nodeEnv: getServerEnv("NODE_ENV") ?? "development",
      };
    },
  );

// Corpo principal da server function (era o corpo do handler acima).
async function handleAiChat(
  data: z.infer<typeof inputSchema>,
  context: unknown,
): Promise<AiChatResponse> {
  const userId = (context as { userId?: string } | undefined)?.userId ?? "unknown";
  const startTime = Date.now();

  const { callOpenAI, callGemini, buildSystemPrompt } = await import("./ai-providers.server");

  const { message, history, context: aiContext, settings } = data;
  const effectiveSettings = settings ?? {};

  // ── Verificação de prompt injection ──────────────────────────
  if (detectPromptInjection(message)) {
    const result = failure(
      "content-filter",
      "Prompt injection detected in message",
      "🚫 Sua pergunta foi bloqueada pelos filtros de segurança. Reformule de outra forma, por favor.",
    );
    logServerError(
      { provider: "openai", model: "n/a", startTime, messageLength: message.length, userId },
      {
        code: result.code,
        message: result.message,
      },
    );
    return result;
  }

  for (const h of history) {
    if (detectPromptInjection(h.text)) {
      const result = failure(
        "content-filter",
        "Prompt injection detected in history",
        "🚫 Detectamos um padrão suspeito no histórico da conversa. Vamos começar uma nova conversa.",
      );
      logServerError(
        { provider: "openai", model: "n/a", startTime, messageLength: message.length, userId },
        {
          code: result.code,
          message: result.message,
        },
      );
      return result;
    }
  }

  // ── Cache server-side (economia de chamadas à API) ──────────
  // Perguntas genéricas de "como fazer" são compartilhadas entre usuários;
  // perguntas sobre dados do negócio são cacheadas por usuário (segurança:
  // nunca misturar dados de contas diferentes).
  const { aiServerCache, buildCacheKey, classifyQuestionScope } = await import("./ai-cache.server");
  const cacheScope = classifyQuestionScope(message);
  // 🔒 SEGURANÇA: perguntas de conhecimento geral (escopo `shared`) NÃO
  // incluem o histórico na chave do cache — o histórico contém dados do
  // usuário (respostas anteriores com nomes, valores, datas) e não pode
  // influenciar uma resposta que será compartilhada entre usuários. Bônus:
  // usuários diferentes com a MESMA pergunta genérica batem na mesma
  // entrada (economia máxima da cota).
  const cacheKey = buildCacheKey(message, cacheScope === "shared" ? [] : history);
  const cachedHit =
    cacheScope === "shared"
      ? aiServerCache.get("shared", userId, cacheKey)
      : aiServerCache.get("user", userId, cacheKey);
  if (cachedHit) {
    console.log(`[AI CACHE] ${cacheScope} hit para "${message.slice(0, 50)}" (${cacheKey})`);
    return success(cachedHit.text, cachedHit.suggestions);
  }

  // ── Monta mensagens para a IA ────────────────────────────────
  // 🔒 SEGURANÇA: perguntas de conhecimento geral (escopo `shared` do
  // cache) NÃO recebem os dados do negócio no prompt — a resposta nasce
  // sem nomes, valores, datas ou qualquer dado do banco, e pode ser
  // compartilhada entre usuários sem risco de vazamento.
  const systemPrompt = buildSystemPrompt(cacheScope === "shared" ? null : aiContext);
  const chatMessages: { role: string; content: string }[] = [
    { role: "system", content: systemPrompt },
  ];

  // 🔒 SEGURANÇA (regra absoluta do usuário): o histórico NÃO é enviado ao
  // modelo em perguntas de conhecimento geral (escopo `shared`) — o
  // histórico pode conter dados do banco (respostas anteriores com nomes,
  // valores, percentuais, datas, telefones) e a IA poderia citá-los na
  // resposta, que seria cacheada COMPARTILHADA. Perguntas de
  // acompanhamento ("E depois?") são classificadas como escopo `user` e
  // recebem o histórico completo normalmente.
  if (cacheScope !== "shared") {
    for (const h of history) {
      chatMessages.push({ role: h.role, content: h.text });
    }
  }

  chatMessages.push({ role: "user", content: message });

  // ── Determina provedor: client setting > env var > openai ────
  const { getServerEnv } = await import("../config.server");
  const provider =
    effectiveSettings.provider ??
    ((getServerEnv("AI_PROVIDER") ?? "openai") as "openai" | "gemini");

  // Prepara overrides de configuração
  const configOverrides = {
    temperature: effectiveSettings.temperature,
    maxTokens: effectiveSettings.maxTokens,
  };

  // ── Executa com fallback ──────────────────────────────────────
  const cacheSuccess = (result: { text: string; suggestions?: string[] }) => {
    // Guarda a resposta de sucesso no cache (por escopo). Respostas
    // curtas (ex: "ok") não valem a pena serem cacheadas.
    if (result.text.length >= 30) {
      if (cacheScope === "shared") {
        aiServerCache.set("shared", userId, cacheKey, result);
      } else {
        aiServerCache.set("user", userId, cacheKey, result);
      }
    }
    return success(result.text, result.suggestions);
  };

  try {
    if (provider === "gemini") {
      const result = await callGemini(chatMessages, configOverrides);
      return cacheSuccess(result);
    }
    const result = await callOpenAI(chatMessages, configOverrides);
    return cacheSuccess(result);
  } catch (primaryError: any) {
    // Se o provedor primário falhar (rate-limit, api-error ou chave não
    // configurada), tenta o outro provedor — assim, mesmo com apenas uma
    // chave configurada (ex: só Gemini), a IA continua funcionando.
    const isRetryable =
      primaryError &&
      typeof primaryError === "object" &&
      "code" in primaryError &&
      typeof primaryError.code === "string" &&
      ["rate-limit", "api-error", "server-error"].includes(primaryError.code);

    if (isRetryable) {
      const fallbackProvider = provider === "gemini" ? "openai" : "gemini";
      // Só tenta o fallback se o outro provedor tiver uma chave configurada.
      // Caso contrário, pular direto evita erro enganoso do tipo
      // "OPENAI_API_KEY não configurada" quando o problema real foi o Gemini
      // falhar temporariamente (rate-limit, instabilidade da API etc).
      const fallbackHasKey =
        fallbackProvider === "gemini"
          ? Boolean(getServerEnv("GEMINI_API_KEY"))
          : Boolean(getServerEnv("OPENAI_API_KEY"));
      if (fallbackHasKey) {
        try {
          const result =
            fallbackProvider === "gemini"
              ? await callGemini(chatMessages, configOverrides)
              : await callOpenAI(chatMessages, configOverrides);
          return cacheSuccess(result);
        } catch (fallbackError) {
          logServerError(
            {
              provider: fallbackProvider,
              model: "fallback",
              startTime,
              messageLength: message.length,
              userId,
            },
            fallbackError,
          );
          logServerError(
            { provider, model: "primary", startTime, messageLength: message.length, userId },
            primaryError,
          );

          // Ambos falharam — reporta o erro do provedor PRIMÁRIO (o real),
          // que é o mais relevante para o usuário.
          return toFailureEnvelope(primaryError);
        }
      }
      // Sem chave no fallback: cai para o reporte do erro primário abaixo.
    }

    logServerError(
      { provider, model: "primary", startTime, messageLength: message.length, userId },
      primaryError,
    );

    // Converte qualquer erro (AiServiceError ou não) em envelope
    return toFailureEnvelope(primaryError);
  }
}
