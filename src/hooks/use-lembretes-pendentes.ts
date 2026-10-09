/**
 * useLembretesPendentes — contador de lembretes que precisam de contato.
 *
 * Usado no menu lateral para mostrar quantos WhatsApp ainda faltam fazer.
 * Gera os lembretes (com throttle interno de 5 min) antes de contar, para
 * que o número apareça atualizado sem custo a cada render. Nunca lança.
 */
import { useQuery } from "@tanstack/react-query";
import { contarPendentes, gerarLembretes, listarLembretes } from "@/lib/lembretes";

export const CHAVE_LEMBRETES_PENDENTES = ["lembretes-pendentes"] as const;

export function useLembretesPendentes() {
  return useQuery({
    queryKey: CHAVE_LEMBRETES_PENDENTES,
    queryFn: async () => {
      try {
        await gerarLembretes();
        const lembretes = await listarLembretes();
        return contarPendentes(lembretes);
      } catch {
        // Tabela ainda não criada / sem sessão → não quebra o menu
        return 0;
      }
    },
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });
}
