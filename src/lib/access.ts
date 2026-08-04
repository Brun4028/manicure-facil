import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ContaStatus = Database["public"]["Enums"]["conta_status"];

export type MinhaConta = Database["public"]["Tables"]["contas"]["Row"];

export const STATUS_LABELS: Record<ContaStatus, string> = {
  ativo: "Ativa",
  inativo: "Inativa",
  bloqueado: "Bloqueada",
  suspenso: "Suspensa",
};

/** Mensagem amigável exibida ao usuário conforme o status da conta. */
export function statusMensagem(status: ContaStatus | null | undefined, motivo?: string | null): string {
  switch (status) {
    case "inativo":
      return "Sua conta ainda não foi liberada. Assim que seu acesso for ativado, você poderá entrar normalmente.";
    case "bloqueado":
      return motivo?.trim() || "Sua conta foi bloqueada. Entre em contato com o suporte.";
    case "suspenso":
      return motivo?.trim() || "Sua conta está suspensa temporariamente. Entre em contato com o suporte.";
    default:
      return "";
  }
}

/** Busca a linha `contas` do usuário logado (RLS: apenas a própria). */
export async function getMinhaConta(): Promise<MinhaConta | null> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return null;
  const { data } = await supabase
    .from("contas")
    .select("*")
    .eq("user_id", user.user.id)
    .maybeSingle();
  return data ?? null;
}

/** Busca a linha `contas` de um usuário específico (RLS: própria ou service_role). */
export async function getContaDe(userId: string): Promise<MinhaConta | null> {
  const { data } = await supabase
    .from("contas")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}

/** A conta tem acesso liberado? (ativo e não expirada) */
export function contaTemAcesso(conta: Pick<MinhaConta, "status" | "acesso_termina_em"> | null | undefined): boolean {
  if (!conta) return false;
  if (conta.status !== "ativo") return false;
  if (conta.acesso_termina_em && new Date(conta.acesso_termina_em).getTime() < Date.now()) return false;
  return true;
}
