import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Evita refetches redundantes ao navegar entre telas: os dados são
        // considerados frescos por 30s. Toda mutation invalida a query
        // correspondente, então o funcionamento e a visualização não mudam —
        // apenas reduzimos a carga no Supabase quando há muitos usuários.
        staleTime: 30_000,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
