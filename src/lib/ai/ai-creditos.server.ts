/**
 * AI Créditos — Lógica de consumo/reset (server-only)
 *
 * Controla o uso diário da IA por conta. As operações de escrita usam o
 * client `service_role` (supabaseAdmin) para ignorar RLS com segurança e as
 * funções RPC SECURITY DEFINER (consumir/devolver) criadas na migration
 * `20261010000000_ia_creditos.sql`.
 *
 * REGRAS:
 * - Saudações, respostas rápidas e cache NÃO consomem crédito.
 * - Só chamadas reais ao provedor (OpenAI/Gemini) consomem 1 crédito.
 * - Se a chamada ao provedor FALHAR, o crédito é reembolsado.
 * - Reset automático: no primeiro acesso após a virada do dia, o saldo volta
 *   ao limite (sincronizado com a env IA_CREDITOS_DIARIOS).
 */

import { getServerEnv } from "../config.server";
import type { CreditosInfo } from "./ai-creditos";

// Carregado de forma preguiçosa (lazy) para permitir import dinâmico em
// server functions sem custo no módulo raiz.
async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Data de hoje (YYYY-MM-DD) no fuso configurado. */
function dataDeHojeNoFuso(timezone: string, nowMs: number = Date.now()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date(nowMs));
}

/** Milissegundos até a próxima meia-noite no fuso configurado. */
function msAteProximoReset(timezone: string, nowMs: number = Date.now()): number {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const timeOfDay = (ms: number): number => {
    const parts = fmt.formatToParts(new Date(ms));
    const get = (t: Intl.DateTimeFormatPartTypes): number =>
      Number(parts.find((p) => p.type === t)?.value ?? 0);
    return get("hour") * 3_600_000 + get("minute") * 60_000 + get("second") * 1000;
  };
  // ~24h à frente → subtrai o "tempo decorrido do dia" na zona → meia-noite
  const guess = nowMs + 86_350_000;
  return Math.max(0, guess - timeOfDay(guess) - nowMs);
}

/**
 * Lê o status de créditos do usuário. Sinconiza limite/valor com a env e
 * aplica o reset do dia, se necessário. Nunca lança — retorna um estado
 * neutro caso a leitura falhe (o chat não pode quebrar por causa disso).
 */
export async function getCreditosInfo(userId: string): Promise<CreditosInfo> {
  const limiteEnv = Number(getServerEnv("IA_CREDITOS_DIARIOS") ?? 50);
  const limite = Number.isFinite(limiteEnv) && limiteEnv > 0 ? limiteEnv : 50;
  const timezone = getServerEnv("IA_CREDITOS_TIMEZONE") ?? "America/Sao_Paulo";
  const hoje = dataDeHojeNoFuso(timezone);
  const resetsEmMs = msAteProximoReset(timezone);

  // Indisponibilidade do banco nunca deve travar o assistente
  const onUnavailable = (): CreditosInfo => ({
    restantes: limite,
    limite,
    resetsEmMs,
    semCreditos: false,
  });

  try {
    const supabase = await getAdmin();

    // Reset + sincronização da env num único UPDATE condicional.
    // Só atualiza se o dia mudou OU o limite da env mudou.
    const { data: sincronizado } = await supabase
      .from("ia_creditos")
      .update({
        dia: hoje,
        limite_diario: limite,
        creditos_restantes: limite,
        atualizado_em: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .or(`dia.lt.${hoje},limite_diario.neq.${limite}`)
      .select("creditos_restantes")
      .maybeSingle();

    if (sincronizado?.creditos_restantes !== undefined) {
      return {
        restantes: sincronizado.creditos_restantes,
        limite,
        resetsEmMs,
        semCreditos: sincronizado.creditos_restantes <= 0,
      };
    }

    // Linha já atualizada para hoje e com limite vigente → apenas lê.
    const { data: leitura } = await supabase
      .from("ia_creditos")
      .select("creditos_restantes, limite_diario")
      .eq("user_id", userId)
      .maybeSingle();

    if (leitura) {
      return {
        restantes: leitura.creditos_restantes,
        limite: leitura.limite_diario,
        resetsEmMs,
        semCreditos: leitura.creditos_restantes <= 0,
      };
    }

    // Linha não existe (conta criada fora do trigger) → cria e devolve cheia.
    await supabase
      .from("ia_creditos")
      .upsert({
        user_id: userId,
        creditos_restantes: limite,
        limite_diario: limite,
        dia: hoje,
        atualizado_em: new Date().toISOString(),
      })
      .select("creditos_restantes")
      .maybeSingle();

    return { restantes: limite, limite, resetsEmMs, semCreditos: false };
  } catch (error) {
    console.error(`[AI CREDITOS] Falha ao ler status de ${userId}:`, error);
    return onUnavailable();
  }
}

/**
 * Consome 1 crédito (SÓ chamar antes de uma chamada real ao provedor).
 * Retorna o saldo restante — 0 indica que acabaram os créditos.
 */
export async function consumirCredito(userId: string): Promise<number> {
  try {
    const supabase = await getAdmin();
    const timezone = getServerEnv("IA_CREDITOS_TIMEZONE") ?? "America/Sao_Paulo";
    const hoje = dataDeHojeNoFuso(timezone);
    const { data } = await supabase.rpc("consumir_ia_credito", {
      p_user_id: userId,
      p_dia: hoje,
    });
    return typeof data === "number" ? data : 0;
  } catch (error) {
    console.error(`[AI CREDITOS] Falha ao consumir crédito de ${userId}:`, error);
    // Se não conseguiu verificar, libera a chamada (nunca pode travar a IA)
    return 1;
  }
}

/** Reembolsa 1 crédito quando a chamada ao provedor falhou. */
export async function devolverCredito(userId: string): Promise<void> {
  try {
    const supabase = await getAdmin();
    await supabase.rpc("devolver_ia_credito", { p_user_id: userId });
  } catch (error) {
    console.error(`[AI CREDITOS] Falha ao devolver crédito de ${userId}:`, error);
  }
}
