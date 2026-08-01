/**
 * AI Cache Server — cache inteligente server-side
 *
 * Objetivo: reduzir ao máximo o consumo da API Gemini (cota free-tier de
 * ~20 requisições/dia), reutilizando respostas idênticas por alguns minutos.
 *
 * Duas camadas (escolha do usuário — HÍBRIDO):
 * - Perguntas GENÉRICAS de conhecimento do sistema (ex: "Como cadastrar uma
 *   cliente?", "O que é DRE?", "Como funciona o estoque?") → cache
 *   COMPARTILHADO entre todos os usuários.
 * - Perguntas sobre DADOS do negócio (ex: "Qual cliente mais gastou?")
 *   → cache POR USUÁRIO (segurança: nunca misturar dados de contas).
 *
 * 🔒 SEGURANÇA EM 2 CAMADAS (garante "nunca vazar dados do banco"):
 * 1. Arquitetural: perguntas compartilhadas são respondidas SEM os dados do
 *    negócio no prompt (buildSystemPrompt(null) em ai-chat.ts) — a resposta
 *    não pode conter nomes, valores, datas, telefones ou e-mails reais.
 * 2. Guard: isSafeForSharedCache() bloqueia (redireciona para cache por
 *    usuário) qualquer resposta que ainda contenha padrões sensíveis.
 * A chave do cache por usuário inclui o userId — nenhum dado de um usuário
 * pode ser servido a outro.
 *
 * TTL curto (5 min) + LRU limitado (300 entradas) — a memória não cresce
 * sem controle. Este arquivo tem sufixo `.server.ts`: nunca chega ao
 * navegador.
 */

// ─── Config ────────────────────────────────────────────────────────────────

const TTL_MS = 5 * 60 * 1000; // 5 minutos ("alguns minutos")
const MAX_ENTRIES = 300;
const MIN_TEXT_LENGTH = 30; // respostas muito curtas provavelmente são erros

export type CachedAiResponse = { text: string; suggestions?: string[] };

export type CacheScope = "shared" | "user";

type CacheEntry = {
  value: CachedAiResponse;
  expiresAt: number;
  /** userId que originou a resposta (usado no escopo shared) */
  ownerId?: string;
};

// ─── Guard de segurança para o escopo compartilhado ────────────────────────

// 🔒 NUNCA colocar no cache compartilhado respostas que contenham:
//   nomes de clientes/funcionárias/serviços cadastrados, telefones, e-mails,
//   valores, percentuais, datas ou QUALQUER dado originado do banco.
// O cache compartilhado serve APENAS para conhecimento geral do sistema.
//
// Camada 1 (arquitetural): perguntas de conhecimento geral NÃO recebem os
// dados do negócio no prompt (buildSystemPrompt(null) em ai-chat.ts) — a
// resposta já nasce sem dados de ninguém.
// Camada 2 (este guard): se mesmo assim a resposta contiver padrões de dados
// sensíveis (ex: o modelo citou um exemplo com telefone/email/data), ela é
// redirecionada para o cache por usuário.

// Palavras de métricas do negócio: se a resposta as citar JUNTO com números,
// ela contém dados pessoais e NÃO pode ser compartilhada entre usuários.
const BUSINESS_METRIC_WORDS =
  /\b(faturamento|lucro|receita|despesa|gasto|gastou|ticket|ocupa[içc][ãa]o|estoque|clientes?|agendamentos?|produtos?|metas?|ranking|aniversariantes?|funcion[aá]rias?)\b/i;

/**
 * Detecta se uma resposta contém dados sensíveis (emails, telefones, datas,
 * valores, percentuais, nomes próprios, métricas do negócio com números).
 * Se sim, NÃO pode ser servida a outro usuário via cache compartilhado.
 */
export function containsSensitiveData(text: string): boolean {
  // E-mails
  if (/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.test(text)) return true;
  // Telefones (BR): (11) 98765-4321, 11 98765-4321, +55 11 98765-4321
  if (/\(?\+?\d{1,2}\)?\s*\d{4,5}[\s.-]?\d{4}/.test(text)) return true;
  // Datas: dd/mm/aaaa, dd-mm-aaaa, dd.mm.aaaa, aaaa-mm-dd
  if (/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/.test(text)) return true;
  if (/\b\d{4}-\d{2}-\d{2}\b/.test(text)) return true;
  // Valores em reais / dólares
  if (/R\$\s*[\d.,]+/i.test(text)) return true;
  if (/US\$\s*[\d.,]+/i.test(text)) return true;
  if (/[\d.,]+\s*(reais|d[oó]lares)/i.test(text)) return true;
  // Percentuais
  if (/\d[\d.,]*\s*%/.test(text)) return true;
  // Nomes próprios em contexto de negócio (heurística): palavra capitalizada
  // logo após cliente/funcionária/serviço/produto/salão
  if (
    /\b(clientes?|funcion[aá]rias?|servi[cç]os?|produtos?|sal[aã]o)\s+[A-ZÀ-Ú][a-zà-úç]+\b/.test(
      text,
    )
  )
    return true;
  // Métrica do negócio + número
  if (/\d/.test(text) && BUSINESS_METRIC_WORDS.test(text)) return true;
  return false;
}

/**
 * Só pode ser compartilhada entre usuários se NÃO contiver dados sensíveis.
 * Toda resposta que passa por aqui também já foi gerada SEM dados do banco
 * (buildSystemPrompt(null) para perguntas de conhecimento geral).
 */
export function isSafeForSharedCache(text: string): boolean {
  return text.length >= MIN_TEXT_LENGTH && !containsSensitiveData(text);
}

// ─── Classificação da pergunta ──────────────────────────────────────────────

// Perguntas que pedem DADOS do negócio → cache por usuário (conservador).
const BUSINESS_DATA_PATTERNS: RegExp[] = [
  /faturamento|faturei|receita|despesa|lucro|gastei|gastou|gasto/i,
  /estoque/i,
  /produto.*(acabando|faltando|baixo)|(acabando|faltando).*produto/i,
  /mais\s+(gastou|vendeu|comprou)|qual\s+cliente|quais\s+clientes/i,
  /ranking|ticket|ocupa[içc][ãa]o|aniversariante|clientes?\s+inativas?/i,
  /hor[aá]rios?\s+livres/i,
  /^quanto/i,
  /^qual/i,
  /^quais/i,
  /^quantos?/i,
  /metas?/i,
];

// Perguntas genéricas de "como fazer" no app → cache compartilhado.
const GENERIC_HOWTO_PATTERNS: RegExp[] = [
  /^como\s+(cadastr|agendar|registrar|fazer|funciona|usar|criar|editar|excluir|gerar|acessar|configurar|marcar|pagar|exportar|adicionar|alterar|remover|atualizar|concluir|limpar|bloquear)/i,
  /^o que\s+(é|são|faz|fazem)/i,
  /^onde\s+(fica|encontro|acesso)/i,
  /^para que serve/i,
  /^como\s+(funciona|usar)\s+o sistema/i,
];

/**
 * Decide se a pergunta pode ter resposta COMPARTILHADA entre usuários
 * (conhecimento geral do sistema) ou deve ser cacheada POR USUÁRIO (dados
 * do negócio). O padrão conservador é por usuário.
 *
 * 1º GENERIC: perguntas de conhecimento geral do sistema ("Como funciona o
 * estoque?", "Como cadastrar uma cliente?", "O que é DRE?") → compartilhadas.
 * A resposta é gerada SEM os dados do banco (buildSystemPrompt(null)), então
 * é segura para todos. A pergunta pode citar uma palavra de negócio (ex:
 * "estoque") desde que o objetivo seja ENTENDER o sistema, não pedir dados.
 * 2º BUSINESS: perguntas que pedem DADOS do negócio ("Quanto faturei?",
 * "Qual cliente mais gastou?", "Meu estoque está baixo?") → por usuário.
 */
export function classifyQuestionScope(message: string): CacheScope {
  const text = message.toLowerCase();
  // 1º: "como fazer" / "o que é" / "onde fica" genérico → compartilhado
  if (GENERIC_HOWTO_PATTERNS.some((p) => p.test(text))) return "shared";
  // 2º: pede dados do negócio → por usuário
  if (BUSINESS_DATA_PATTERNS.some((p) => p.test(text))) return "user";
  // Padrão seguro: por usuário
  return "user";
}

// ─── Chave de cache ─────────────────────────────────────────────────────────

export function buildCacheKey(
  message: string,
  history: { role: string; text: string }[],
): string {
  const histStr = history
    .slice(-4)
    .map((h) => `${h.role}:${h.text.trim().slice(0, 80)}`)
    .join("|");
  const raw = `${message.trim().toLowerCase()}|${histStr}`;
  // djb2 hash → chave compacta e determinística
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

// ─── Cache LRU + TTL ────────────────────────────────────────────────────────

class AiServerCache {
  private shared = new Map<string, CacheEntry>();
  private perUser = new Map<string, CacheEntry>();

  private getEntry(map: Map<string, CacheEntry>, key: string): CacheEntry | null {
    const entry = map.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      map.delete(key);
      return null;
    }
    // LRU: move para o fim (mais recente)
    map.delete(key);
    map.set(key, entry);
    return entry;
  }

  private setIn(
    map: Map<string, CacheEntry>,
    key: string,
    value: CachedAiResponse,
    ownerId?: string,
  ): void {
    if (value.text.length < MIN_TEXT_LENGTH) return;
    if (map.size >= MAX_ENTRIES) {
      const oldest = map.keys().next().value;
      if (oldest !== undefined) map.delete(oldest);
    }
    map.set(key, { value, expiresAt: Date.now() + TTL_MS, ownerId });
  }

  get(scope: CacheScope, userId: string, key: string): CachedAiResponse | null {
    if (scope === "shared") {
      const entry = this.getEntry(this.shared, key);
      if (!entry) return null;
      // 🔒 SEGURANÇA: se a resposta foi gerada para OUTRO usuário e contém
      // dados sensíveis, NÃO é servida — tratada como cache miss e a pergunta
      // vai para o Gemini normalmente (resultado cacheado por usuário). A
      // entrada original é preservada para o dono (TTL curto de 5min).
      if (
        entry.ownerId !== undefined &&
        entry.ownerId !== userId &&
        !isSafeForSharedCache(entry.value.text)
      ) {
        return null;
      }
      return entry.value;
    }
    // Por usuário: a chave inclui o userId — um usuário nunca recebe a
    // resposta cacheada de outro.
    return this.getEntry(this.perUser, `${userId}|${key}`)?.value ?? null;
  }

  set(scope: CacheScope, userId: string, key: string, value: CachedAiResponse): void {
    if (scope === "shared") {
      // Só entra no cache COMPARTILHADO se a resposta não contiver dados
      // sensíveis; caso contrário, guarda por usuário (segurança).
      if (isSafeForSharedCache(value.text)) {
        this.setIn(this.shared, key, value, userId);
      } else {
        this.setIn(this.perUser, `${userId}|${key}`, value);
      }
      return;
    }
    this.setIn(this.perUser, `${userId}|${key}`, value);
  }

  stats(): { shared: number; perUser: number } {
    return { shared: this.shared.size, perUser: this.perUser.size };
  }
}

// Singleton (server-side)
export const aiServerCache = new AiServerCache();
