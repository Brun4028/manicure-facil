/**
 * Rotas internas que podem ser abertas a partir de *dados* (link de uma
 * notificação, passo do onboarding, etc.).
 *
 * Existe por dois motivos:
 *  1. Segurança — nunca navegar para um link vindo do banco sem validar;
 *  2. Tipagem — o `to` do TanStack Router só aceita rotas reais, então esta
 *     união é conferida em tempo de compilação (rota inexistente = erro no
 *     `tsc`), em vez de um `as any` que silencia tudo.
 */
export const ROTAS_INTERNAS = [
  "/dashboard",
  "/agendamentos",
  "/lembretes",
  "/clientes",
  "/servicos",
  "/financeiro",
  "/estoque",
  "/relatorios",
  "/marketing",
  "/portfolio",
  "/configuracoes",
  "/admin",
] as const;

export type RotaInterna = (typeof ROTAS_INTERNAS)[number];

/** `true` quando o caminho é uma rota interna conhecida. */
export function isRotaInterna(caminho: string | null | undefined): caminho is RotaInterna {
  return !!caminho && (ROTAS_INTERNAS as readonly string[]).includes(caminho);
}
