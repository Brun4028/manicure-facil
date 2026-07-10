/**
 * AI Logger — Observabilidade estruturada
 *
 * Registra logs detalhados de cada chamada à IA:
 * - Tempo de resposta
 * - Modelo utilizado
 * - Quantidade de tokens (quando disponível)
 * - Custo estimado
 * - Erros
 *
 * Preparado para integração futura com serviços de observabilidade
 * (Sentry, Datadog, etc.)
 */

export type AiLogEntry = {
  timestamp: string;
  provider: "openai" | "gemini";
  model: string;
  durationMs: number;
  messageLength: number;
  responseLength: number;
  tokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
  estimatedCostUsd?: number;
  success: boolean;
  error?: string;
  cached: boolean;
};

/**
 * Tabela de custos aproximados por modelo (USD por 1K tokens)
 * Fonte: preços públicos das APIs (Junho 2026)
 */
const COST_TABLE: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-4o": { input: 0.0025, output: 0.01 },
  "gpt-4": { input: 0.03, output: 0.06 },
  "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
  "gemini-2.0-flash": { input: 0.0001, output: 0.0004 },
  "gemini-2.0-pro": { input: 0.002, output: 0.005 },
  "gemini-1.5-pro": { input: 0.0035, output: 0.0105 },
};

function estimateTokens(text: string): number {
  // Aproximação: 1 token ≈ 4 caracteres em português
  return Math.ceil(text.length / 4);
}

function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number | undefined {
  const rates = COST_TABLE[model];
  if (!rates) return undefined;
  return (
    (promptTokens / 1000) * rates.input +
    (completionTokens / 1000) * rates.output
  );
}

export class AiLogger {
  private logs: AiLogEntry[] = [];
  private maxLogs = 500;

  /**
   * Registra uma chamada à IA.
   */
  log(entry: Omit<AiLogEntry, "timestamp">): void {
    const fullEntry: AiLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };

    this.logs.push(fullEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Log estruturado no console (formato JSON para fácil parsing)
    const level = entry.success ? "info" : "error";
    const durationStr = `${entry.durationMs.toFixed(0)}ms`;
    const costStr = entry.estimatedCostUsd
      ? `$${entry.estimatedCostUsd.toFixed(6)}`
      : "N/A";
    const cachedStr = entry.cached ? " [CACHED]" : "";

    console.log(
      `[AI ${level.toUpperCase()}]${cachedStr} ${entry.provider}/${entry.model} | ${durationStr} | Est. cost: ${costStr} | Input: ${entry.messageLength} chars | Output: ${entry.responseLength} chars${entry.error ? ` | Error: ${entry.error}` : ""}`,
    );

    // Se houver erro, loga também no console.error
    if (!entry.success && entry.error) {
      console.error(
        `[AI ERROR] ${entry.provider}/${entry.model}: ${entry.error}`,
        fullEntry,
      );
    }
  }

  /**
   * Cria um log a partir dos dados disponíveis.
   * Aceita tokens opcionais e estima quando não disponíveis.
   */
  createLog(params: {
    provider: "openai" | "gemini";
    model: string;
    startTime: number;
    messageLength: number;
    responseLength: number;
    success: boolean;
    error?: string;
    cached: boolean;
    promptTokens?: number;
    completionTokens?: number;
  }): AiLogEntry {
    const durationMs = Date.now() - params.startTime;

    const promptTokens =
      params.promptTokens ?? estimateTokens(String(params.messageLength));
    const completionTokens =
      params.completionTokens ?? estimateTokens(String(params.responseLength));

    return {
      timestamp: new Date().toISOString(),
      provider: params.provider,
      model: params.model,
      durationMs,
      messageLength: params.messageLength,
      responseLength: params.responseLength,
      tokens: {
        prompt: promptTokens,
        completion: completionTokens,
        total: promptTokens + completionTokens,
      },
      estimatedCostUsd: estimateCost(
        params.model,
        promptTokens,
        completionTokens,
      ),
      success: params.success,
      error: params.error,
      cached: params.cached,
    };
  }

  /**
   * Retorna todos os logs para exibição.
   */
  getLogs(): AiLogEntry[] {
    return [...this.logs];
  }

  /**
   * Limpa os logs.
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Estatísticas resumidas.
   */
  summary(): {
    totalCalls: number;
    successRate: number;
    avgDurationMs: number;
    totalEstimatedCostUsd: number;
    cachedCalls: number;
  } {
    const total = this.logs.length;
    if (total === 0) {
      return {
        totalCalls: 0,
        successRate: 0,
        avgDurationMs: 0,
        totalEstimatedCostUsd: 0,
        cachedCalls: 0,
      };
    }

    const successful = this.logs.filter((l) => l.success).length;
    const cachedCalls = this.logs.filter((l) => l.cached).length;
    const totalDuration = this.logs.reduce((s, l) => s + l.durationMs, 0);
    const totalCost = this.logs.reduce(
      (s, l) => s + (l.estimatedCostUsd ?? 0),
      0,
    );

    return {
      totalCalls: total,
      successRate: successful / total,
      avgDurationMs: totalDuration / total,
      totalEstimatedCostUsd: totalCost,
      cachedCalls,
    };
  }
}

// Singleton
export const aiLogger = new AiLogger();
