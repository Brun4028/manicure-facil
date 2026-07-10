/**
 * AI Cache — LRU com TTL para reduzir chamadas à API
 *
 * Cache simples em memória para perguntas repetidas.
 * O cache expira após um TTL configurável.
 * Usa o hash da pergunta + histórico como chave.
 */

interface CacheEntry {
  response: { text: string; suggestions?: string[] };
  expiresAt: number;
  hitCount: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutos
const MAX_ENTRIES = 100;

class AiCache {
  private cache = new Map<string, CacheEntry>();
  private ttl: number;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttl = ttlMs;
  }

  /**
   * Gera uma chave de cache a partir da mensagem e histórico.
   */
  private makeKey(message: string, history: { role: string; text: string }[]): string {
    const histStr = history
      .slice(-4)
      .map((h) => `${h.role}:${h.text.slice(0, 50)}`)
      .join("|");
    return `${message.slice(0, 100)}|${histStr}`;
  }

  /**
   * Tenta obter uma resposta do cache.
   */
  get(
    message: string,
    history: { role: string; text: string }[],
  ): { text: string; suggestions?: string[] } | null {
    const key = this.makeKey(message, history);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Verifica expiração
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);
    entry.hitCount++;

    return entry.response;
  }

  /**
   * Armazena uma resposta no cache.
   */
  set(
    message: string,
    history: { role: string; text: string }[],
    response: { text: string; suggestions?: string[] },
  ): void {
    // Evita cache de respostas muito curtas ou de erro
    if (response.text.length < 20) return;
    if (response.text.includes("temporariamente indisponível")) return;

    // Evita crescimento infinito
    if (this.cache.size >= MAX_ENTRIES) {
      // Remove o primeiro (mais antigo)
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    const key = this.makeKey(message, history);
    this.cache.set(key, {
      response,
      expiresAt: Date.now() + this.ttl,
      hitCount: 0,
    });
  }

  /**
   * Limpa o cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Estatísticas do cache.
   */
  stats(): { size: number; hitRate: number } {
    const totalHits = Array.from(this.cache.values()).reduce(
      (sum, e) => sum + e.hitCount,
      0,
    );
    return {
      size: this.cache.size,
      hitRate: totalHits > 0 ? totalHits / this.cache.size : 0,
    };
  }
}

// Singleton
export const aiCache = new AiCache();
