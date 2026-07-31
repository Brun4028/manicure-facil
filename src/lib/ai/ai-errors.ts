/**
 * AI Errors — Tipos e mensagens amigáveis compartilhados
 *
 * Módulo isolado (sem dependências) para quebrar a dependência circular
 * entre ai-service (client), ai-chat (server fn) e ai-providers (server).
 *
 * O TanStack Start serializa erros lançados em server functions preservando
 * APENAS `message` (ShallowErrorPlugin). Por isso, a server function NÃO deve
 * depender de classes de erro customizadas atravessando o RPC — ela retorna um
 * envelope serializável { ok:false, code, message, userMessage }. Estas
 * mensagens amigáveis são usadas nos dois lados.
 */

// ─── Códigos de erro ─────────────────────────────────────────────────────────

export type AiErrorCode =
  | "network"
  | "timeout"
  | "rate-limit"
  | "api-error"
  | "server-error"
  | "validation"
  | "content-filter" // Conteúdo bloqueado pelo filtro de segurança
  | "unauthorized"
  | "unknown";

// ─── Mensagens amigáveis (PT-BR) ─────────────────────────────────────────────

export function mensagemAmigavel(code: AiErrorCode): string {
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
    validation:
      "🤔 Não consegui processar sua pergunta. Tente reformulá-la de outra forma.",
    "content-filter":
      "🚫 Sua pergunta foi bloqueada pelos filtros de segurança. Reformule de outra forma.",
    unauthorized:
      "🔒 Sua sessão expirou. Faça login novamente para usar o assistente.",
    unknown:
      "😅 Algo inesperado aconteceu. Por favor, tente novamente ou reformule sua pergunta.",
  };
  return messages[code];
}

// ─── Classe de erro (cliente) ────────────────────────────────────────────────

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

// ─── Normalização (cliente) ──────────────────────────────────────────────────

/**
 * Converte qualquer valor recebido (incluindo erros serializados pelo
 * TanStack Start, que chegam como objetos/Error com apenas `message`)
 * em um erro tipado com código e mensagem amigável.
 */
export function normalizeErrorToAiError(error: unknown): AiServiceError {
  // 1. Erro já tipado
  if (error instanceof AiServiceError) return error;

  // 2. Falha de rede (fetch) — TypeError real do navegador/node
  if (error instanceof TypeError) {
    return new AiServiceError("network", error.message);
  }

  // 3. Error comum (incluindo erros serializados pelo TanStack Start,
  //    que chegam como Error com apenas `message`)
  if (error instanceof Error) {
    return mapSerializedMessage(error.message);
  }

  // 4. Objetos serializados (envelope estruturado ou plain object)
  if (error && typeof error === "object") {
    const obj = error as Record<string, unknown>;

    // Envelope estruturado { ok:false, code, message, userMessage }
    if (obj.ok === false && typeof obj.code === "string") {
      return new AiServiceError(
        obj.code as AiErrorCode,
        String(obj.message ?? ""),
        typeof obj.userMessage === "string" ? obj.userMessage : undefined,
      );
    }

    // Objeto com message (erro serializado sem protótipo de Error)
    if (typeof obj.message === "string") {
      return mapSerializedMessage(obj.message);
    }
  }

  const msg =
    typeof error === "string"
      ? error
      : JSON.stringify(error) ?? String(error);
  return new AiServiceError("unknown", msg);
}

/**
 * Mapeia a `message` de um erro serializado (TanStack Start preserva apenas
 * `message` no ShallowErrorPlugin) para um AiServiceError com código real.
 */
function mapSerializedMessage(message: string): AiServiceError {
  // Erros de autenticação do middleware requireSupabaseAuth
  if (
    message.startsWith("Unauthorized") ||
    message.includes("authorization header") ||
    message.includes("Invalid token")
  ) {
    return new AiServiceError(
      "unauthorized",
      message,
      mensagemAmigavel("unauthorized"),
    );
  }

  // Falta de variáveis de ambiente do Supabase no servidor
  if (message.includes("Missing Supabase environment variable")) {
    return new AiServiceError(
      "server-error",
      message,
      "🔧 O servidor está com configuração incompleta (variáveis do Supabase). Verifique o .env e reinicie.",
    );
  }

  // Erros de validação do Zod no servidor (mensagem padrão do Zod v3)
  if (
    message.startsWith("Invalid input") ||
    message.includes("invalid_type") ||
    message.includes("invalid_string") ||
    message.includes("too_small") ||
    message.includes("too_big")
  ) {
    return new AiServiceError("validation", message, mensagemAmigavel("validation"));
  }

  // Outros erros com mensagem — preserva a informação para diagnóstico
  return new AiServiceError("unknown", message, mensagemAmigavel("unknown"));
}

export function isAiError(error: unknown): error is AiServiceError {
  return error instanceof AiServiceError;
}
