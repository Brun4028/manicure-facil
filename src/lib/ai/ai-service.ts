/**
 * AI Service Layer — Frontend
 *
 * Abstrai a comunicação com o backend de IA.
 * Fornece tipos, tratamento de erros, cache e preparação para streaming.
 *
 * IMPORTANTE (descoberto na auditoria ETAPA 3):
 * O TanStack Start serializa erros lançados em server functions preservando
 * APENAS `message` (ShallowErrorPlugin do seroval). Por isso a server function
 * retorna um ENVELOPE estruturado { ok:true|false, code, message, userMessage }
 * e a normalização completa de erros vive em `ai-errors.ts`.
 */

import { getAiChatResponse } from "./ai-chat";
import { aiCache } from "./ai-cache";
import { getInstantQuickResponse } from "./ai-instant-responses";
import { AiServiceError, normalizeErrorToAiError, isAiError, type AiErrorCode } from "./ai-errors";

// Re-export para compatibilidade com imports existentes
export { AiServiceError, isAiError, type AiErrorCode };

// ─── Types ──────────────────────────────────────────────────────────────────

export type AiRole = "user" | "assistant";

export type AiMessage = {
  id: string;
  role: AiRole;
  text: string;
  timestamp: Date;
  suggestions?: string[];
  /** Para streaming: texto parcial enquanto está sendo digitado */
  isStreaming?: boolean;
};

export type AiContext = {
  userName?: string;
  totalClientes: number;
  totalAgendamentos: number;
  totalServicos: number;
  faturamentoMes: number;
  // ─── Dados expandidos ──────────────────────────────────────────
  estoqueBaixo: number;
  contasAReceber: number;
  contasVencidas: number;
  aniversariantesMes: number;
  metasFaturamento: number;
  metasLucro: number;
  servicosMaisVendidos: string;
  clientesInativos: number;
  ticketMedio: number;
  ocupacaoAgenda: number;
  lucroMes: number;
};

export type AiResponse = {
  text: string;
  suggestions?: string[];
};

/** Contexto padrão usado quando os dados ainda não carregaram */
export const EMPTY_AI_CONTEXT: AiContext = {
  userName: "",
  totalClientes: 0,
  totalAgendamentos: 0,
  totalServicos: 0,
  faturamentoMes: 0,
  estoqueBaixo: 0,
  contasAReceber: 0,
  contasVencidas: 0,
  aniversariantesMes: 0,
  metasFaturamento: 0,
  metasLucro: 0,
  servicosMaisVendidos: "Nenhum ainda",
  clientesInativos: 0,
  ticketMedio: 0,
  ocupacaoAgenda: 0,
  lucroMes: 0,
};

/** Une contexto parcial (possivelmente undefined) com valores seguros */
export function normalizeContext(context?: Partial<AiContext> | null): AiContext {
  if (!context) return EMPTY_AI_CONTEXT;
  return { ...EMPTY_AI_CONTEXT, ...context };
}

// ─── Fallback response ──────────────────────────────────────────────────────

function fallbackResponse(): AiResponse {
  return {
    text: `🤖 **Assistente temporariamente offline**

No momento não consigo acessar a inteligência artificial. Mas você ainda pode:

📋 Navegar pelas **telas do sistema** no menu lateral
📖 Usar o **guia rápido** perguntando "como funciona o sistema?"
👩‍🔧 Entrar em contato com o **suporte** se precisar de ajuda

Assim que a conexão for restabelecida, estarei pronta para ajudar! ✨`,
    suggestions: [
      "Como funciona o sistema?",
      "O que cada tela faz?",
      "Como cadastrar uma cliente?",
    ],
  };
}

// ─── Timeout helper ─────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, abortSignal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    // Limpeza do timer e do listener quando a requisição terminar (sucesso,
    // erro, timeout ou abort) — evita timers órfãos de 45s por chamada de IA.
    const timer = setTimeout(() => {
      cleanup();
      reject(new AiServiceError("timeout", `Request timed out after ${ms}ms`));
    }, ms);
    const cleanup = () => {
      clearTimeout(timer);
      abortSignal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new AiServiceError("timeout", "Request was cancelled"));
    };

    abortSignal?.addEventListener("abort", onAbort, { once: true });

    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

// ─── Security helpers ───────────────────────────────────────────────────────

const MAX_MESSAGE_LENGTH = 2000;

/** Lista de padrões suspeitos de prompt injection */
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|above|prior)/i,
  /forget\s+(all\s+)?(previous|above|prior)/i,
  /you\s+are\s+(not\s+)?(required\s+to|obligated\s+to)/i,
  /disregard\s+(all\s+)?(previous|above)/i,
  /new\s+instructions?:\s*/i,
  /system\s+(prompt|instructions?|message)/i,
  /---+\s*system/i,
];

/**
 * Verifica se a mensagem contém tentativa de prompt injection.
 * Retorna true se parecer seguro, false se suspeito.
 */
function isPromptSafe(message: string): { safe: boolean; reason?: string } {
  // Verifica tamanho
  if (message.length > MAX_MESSAGE_LENGTH) {
    return { safe: false, reason: "Mensagem muito longa" };
  }

  // Verifica padrões suspeitos
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(message)) {
      return { safe: false, reason: `Padrão suspeito detectado: ${pattern.source}` };
    }
  }

  return { safe: true };
}

// ─── Public API ─────────────────────────────────────────────────────────────

export type AiServiceConfig = {
  /** Número máximo de mensagens no histórico enviado para a IA */
  historyLength: number;
  /** Provedor de IA (opcional — override do env var do servidor) */
  provider?: "openai" | "gemini";
  /** Temperatura da IA (opcional — override do env var) */
  temperature?: number;
  /** Máximo de tokens na resposta (opcional — override do env var) */
  maxTokens?: number;
};

const DEFAULT_CONFIG: AiServiceConfig = {
  historyLength: 10,
};

/**
 * Envia uma mensagem para o assistente IA e retorna a resposta.
 * Inclui cache, segurança e tratamento completo de erros.
 */
export async function sendToAi(
  message: string,
  history: AiMessage[],
  context?: Partial<AiContext> | null,
  config: AiServiceConfig = DEFAULT_CONFIG,
): Promise<AiResponse> {
  // ── Validação de segurança ──────────────────────────────────────
  if (!message.trim()) {
    throw new AiServiceError("unknown", "Empty message");
  }

  const security = isPromptSafe(message);
  if (!security.safe) {
    throw new AiServiceError("content-filter", `Prompt injection detected: ${security.reason}`);
  }

  // ── Prepara histórico (últimas N mensagens) ─────────────────────
  const recentHistory = history
    .filter((m) => !m.isStreaming) // Remove mensagens de streaming anteriores
    .slice(-config.historyLength)
    .map((m) => ({ role: m.role, text: m.text }));

  const trimmedMessage = message.trim().slice(0, MAX_MESSAGE_LENGTH);

  // ── ⚡ Respostas Instantâneas (saudações, pequenas conversas, FAQ) ─
  const quickResponse = getInstantQuickResponse(trimmedMessage, context?.userName);
  if (quickResponse) {
    return quickResponse;
  }

  // ── Verifica cache ──────────────────────────────────────────────
  const cached = aiCache.get(trimmedMessage, recentHistory);
  if (cached) {
    return cached;
  }

  // ── Contexto seguro (nunca undefined — evita falha de validação) ─
  const safeContext = normalizeContext(context);

  // ── Tenta obter resposta da IA ──────────────────────────────────
  try {
    const response = await withTimeout(
      getAiChatResponse({
        data: {
          message: trimmedMessage,
          history: recentHistory,
          context: {
            appName: "Manicure Fácil",
            appDescription: "Sistema de gestão premium para manicures e pequenos salões de beleza",
            ...safeContext,
          },
          settings: {
            provider: config.provider,
            temperature: config.temperature,
            maxTokens: config.maxTokens,
          },
        },
      }),
      45_000,
    );

    // ── Envelope estruturado do servidor ──────────────────────────
    if (!response || typeof response !== "object") {
      throw new AiServiceError("api-error", "Resposta inválida do servidor");
    }

    if (response.ok === true) {
      const result: AiResponse = {
        text: response.text,
        suggestions: response.suggestions,
      };

      // Armazena em cache (exceto respostas muito curtas)
      if (result.text.length > 50) {
        aiCache.set(trimmedMessage, recentHistory, result);
      }

      return result;
    }

    // ok === false → erro estruturado com código real
    const err = response as {
      code: AiErrorCode;
      message: string;
      userMessage?: string;
    };
    throw new AiServiceError(err.code, err.message, err.userMessage);
  } catch (error) {
    const normalized = normalizeErrorToAiError(error);

    // ── Log client-side para diagnóstico ──────────────────────────
    console.error(`[AI CLIENT] ${normalized.code}: ${normalized.message}`, {
      userMessage: normalized.userMessage,
    });

    throw normalized;
  }
}

export function getFallbackResponse(): AiResponse {
  return fallbackResponse();
}

export function getAiErrorMessage(error: unknown): string {
  if (isAiError(error)) {
    return error.userMessage;
  }
  if (error instanceof Error) {
    return `😅 Erro inesperado: ${error.message}`;
  }
  return "😅 Ocorreu um erro inesperado. Tente novamente.";
}
