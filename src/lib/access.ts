import type { Database } from "@/integrations/supabase/types";

export type ContaStatus = Database["public"]["Enums"]["conta_status"];

export const STATUS_LABELS: Record<ContaStatus, string> = {
  ativo: "Ativa",
  inativo: "Inativa",
  bloqueado: "Bloqueada",
  suspenso: "Suspensa",
};
