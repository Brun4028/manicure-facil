import { useEffect } from "react";

/**
 * Define o título da aba no cliente (document.title).
 *
 * POR QUE USAR nas rotas com `ssr: false` que redirecionam no `beforeLoad`
 * (ex.: /_authenticated/* e /auth):
 *
 * Com `ssr: false`, o servidor ainda renderiza o SHELL e injeta o <title> da
 * rota no HTML. Quando o client executa o redirect (ex.: sem sessão, /admin
 * → /auth), o título muda ANTES da hidratação — o React 19 acusa o erro
 * "Hydration failed" (#418) porque o HTML servido não bate com o que o
 * client renderiza.
 *
 * Ao aplicar o título via useEffect (após montar), o servidor envia sempre o
 * título padrão do root e o título correto é aplicado só depois do guard de
 * rota passar — eliminando qualquer mismatch de hidratação.
 */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
