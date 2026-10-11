/**
 * AI Créditos — Tipos compartilhados (client-safe)
 *
 * Arquivo sem imports de servidor para poder ser usado tanto pela camada
 * client (ai-service, painel) quanto pela server function (ai-chat) e pela
 * lógica de servidor (ai-creditos.server.ts). Sem dependências → sem ciclo.
 */

export type CreditosInfo = {
  /** Créditos ainda disponíveis hoje */
  restantes: number;
  /** Limite diário vigente (vem de IA_CREDITOS_DIARIOS) */
  limite: number;
  /** Milissegundos até o reset automático (meia-noite no fuso configurado) */
  resetsEmMs: number;
  /** true quando restantes <= 0 */
  semCreditos: boolean;
};

/** Retorna texto amigável de tempo restante (ex: "4h 32min", "25min"). */
export function formatarTempoRestante(ms: number): string {
  if (!ms || ms <= 0) return "em instantes";
  const totalMin = Math.max(1, Math.ceil(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2, "0")}min`;
}
