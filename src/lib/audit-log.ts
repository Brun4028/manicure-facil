/**
 * Audit Log — Registro de auditoria para operações importantes
 *
 * Registra ações dos usuários para fins de segurança, conformidade LGPD
 * e diagnóstico. Os logs são armazenados no Supabase (tabela audit_log)
 * e também emitidos no console do servidor.
 *
 * Uso:
 *   import { auditLog } from "@/lib/audit-log";
 *   await auditLog.log("create", "cliente", clienteId, { nome: "Maria" });
 */

import { supabase } from "@/integrations/supabase/client";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "login"
  | "logout"
  | "export"
  | "view"
  | "cancel"
  | "confirm"
  | "complete"
  | "backup";

export type AuditEntity =
  | "agendamento"
  | "cliente"
  | "servico"
  | "produto"
  | "movimentacao_estoque"
  | "venda"
  | "venda_item"
  | "promocao"
  | "portfolio"
  | "avaliacao"
  | "fidelidade_config"
  | "fidelidade_pontos"
  | "metas_mensais"
  | "profile"
  | "auth"
  | "backup";

/**
 * Serviço de auditoria - registra operações importantes no sistema.
 * Em caso de falha no Supabase, faz fallback para console.warn
 * para não bloquear a operação principal.
 */
export const auditLog = {
  /**
   * Registra uma entrada no log de auditoria.
   * Esta função NUNCA deve lançar exceções para não interromper
   * a operação principal.
   */
  async log(
    acao: AuditAction,
    entidade: AuditEntity,
    entidade_id?: string,
    detalhes?: Record<string, unknown>,
  ): Promise<void> {
    try {
      // Usamos tipo any porque a tabela audit_log foi adicionada via migration
      // e os tipos TypeScript do Supabase ainda não foram regenerados.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from as any)("audit_log").insert({
        acao,
        entidade,
        entidade_id: entidade_id ?? null,
        detalhes: detalhes ?? null,
        // Nota: o IP real do cliente não está disponível no client-side
        // O servidor (server.ts) é responsável por extrair o IP real via headers
        ip_address: typeof window !== "undefined" ? "client-side" : "server",
        user_agent: typeof navigator !== "undefined"
          ? navigator.userAgent.slice(0, 255)
          : "server",
      });

      if (error) {
        // Não bloqueia a operação principal
        console.warn("[AuditLog] Erro ao registrar auditoria:", error.message);
      }
    } catch (e) {
      // Fallback silencioso — nunca bloquear a operação principal
      console.warn("[AuditLog] Falha ao registrar auditoria:", e);
    }
  },

  /**
   * Versão síncrona para uso em contexts onde async não é adequado.
   * Dispara e esquece (fire-and-forget).
   */
  fireAndForget(
    acao: AuditAction,
    entidade: AuditEntity,
    entidade_id?: string,
    detalhes?: Record<string, unknown>,
  ): void {
    this.log(acao, entidade, entidade_id, detalhes).catch(() => {
      // Ignora erros
    });
  },
};

export default auditLog;
