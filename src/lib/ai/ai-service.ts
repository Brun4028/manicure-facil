/**
 * AI Service Layer — Frontend
 *
 * Abstrai a comunicação com o backend de IA.
 * Fornece tipos, tratamento de erros, cache, e preparação para streaming.
 * Preparado para futuras funções: análise de clientes, campanhas, etc.
 */

import { getAiChatResponse } from "./ai-chat";
import { aiCache } from "./ai-cache";

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

export type AiErrorCode =
  | "network"
  | "timeout"
  | "rate-limit"
  | "api-error"
  | "server-error"
  | "content-filter" // Conteúdo bloqueado pelo filtro de segurança
  | "unknown";

export class AiServiceError extends Error {
  code: AiErrorCode;
  userMessage: string;

  constructor(code: AiErrorCode, message: string, userMessage?: string) {
    super(message);
    this.name = "AiServiceError";
    this.code = code;
    this.userMessage = userMessage ?? mensagemAmigavel(code);
  }
}

// ─── Friendly error messages in Portuguese ──────────────────────────────────

function mensagemAmigavel(code: AiErrorCode): string {
  const messages: Record<AiErrorCode, string> = {
    network:
      "😔 Não foi possível conectar ao assistente. Verifique sua conexão com a internet e tente novamente.",
    timeout:
      "⏰ O assistente demorou muito para responder. Pode ser um momento de instabilidade — tente novamente em alguns segundos.",
    "rate-limit":
      "🔄 Você já fez muitas perguntas seguidas! Aguarde um momento e tente novamente.",
    "api-error":
      "🤖 O assistente está temporariamente indisponível. Já estou avisando a equipe técnica! Tente novamente mais tarde.",
    "server-error":
      "🔧 Serviço temporariamente indisponível. Tente novamente em instantes.",
    "content-filter":
      "🚫 Sua pergunta foi bloqueada pelos filtros de segurança. Reformule de outra forma.",
    unknown:
      "😅 Algo inesperado aconteceu. Por favor, tente novamente ou reformule sua pergunta.",
  };
  return messages[code];
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
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new AiServiceError("timeout", `Request timed out after ${ms}ms`));
      }, ms);
      // Clean up timeout on abort
      abortSignal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new AiServiceError("timeout", "Request was cancelled"));
        },
        { once: true },
      );
    }),
  ]);
}

// ─── Security helpers ───────────────────────────────────────────────────────

const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_LENGTH = 20;

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
 * Inclui cache, segurança, e tratamento completo de erros.
 */
export async function sendToAi(
  message: string,
  history: AiMessage[],
  context: AiContext,
  config: AiServiceConfig = DEFAULT_CONFIG,
): Promise<AiResponse> {
  // ── Validação de segurança ──────────────────────────────────────
  if (!message.trim()) {
    throw new AiServiceError("unknown", "Empty message");
  }

  const security = isPromptSafe(message);
  if (!security.safe) {
    throw new AiServiceError(
      "content-filter",
      `Prompt injection detected: ${security.reason}`,
    );
  }

  // ── Prepara histórico (últimas N mensagens) ─────────────────────
  const recentHistory = history
    .filter((m) => !m.isStreaming) // Remove mensagens de streaming anteriores
    .slice(-config.historyLength)
    .map((m) => ({ role: m.role, text: m.text }));

  const trimmedMessage = message.trim().slice(0, MAX_MESSAGE_LENGTH);

  // ── Verifica cache ──────────────────────────────────────────────
  const cached = aiCache.get(trimmedMessage, recentHistory);
  if (cached) {
    return cached;
  }

  // ── Tenta obter resposta da IA ──────────────────────────────────
  try {
    const response = await withTimeout(
      getAiChatResponse({
        data: {
          message: trimmedMessage,
          history: recentHistory,
          context: {
            appName: "Manicure Fácil",
            appDescription:
              "Sistema de gestão premium para manicures e pequenos salões de beleza",
            ...context,
          },
          settings: {
            provider: config.provider,
            temperature: config.temperature,
            maxTokens: config.maxTokens,
          },
        },
      }),
      30_000,
    );

    const result: AiResponse = {
      text: response.text,
      suggestions: response.suggestions,
    };

    // Armazena em cache (exceto respostas muito curtas)
    if (result.text.length > 50) {
      aiCache.set(trimmedMessage, recentHistory, result);
    }

    return result;
  } catch (error) {
    // AiServiceError local
    if (error instanceof AiServiceError) {
      throw error;
    }

    // Erro serializado do servidor (createServerFn)
    if (error && typeof error === "object" && "code" in error) {
      const err = error as { code: AiErrorCode; message: string; userMessage?: string };
      throw new AiServiceError(err.code, err.message, err.userMessage);
    }

    // Erro de rede
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new AiServiceError("network", error.message);
    }

    // Desconhecido
    const msg =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null
          ? JSON.stringify(error)
          : String(error);

    throw new AiServiceError("unknown", msg);
  }
}

export function getFallbackResponse(): AiResponse {
  return fallbackResponse();
}

export function isAiError(error: unknown): error is AiServiceError {
  return error instanceof AiServiceError;
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
