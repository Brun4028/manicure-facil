// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // ── Build de produção (Docker/VPS) ───────────────────────────────────────
  // Fora do sandbox Lovable, o plugin nitro NÃO roda por padrão (a config
  // detecta "No Lovable context" e pula o deploy build). Isso quebraria o
  // Dockerfile, que espera `.output/server/index.mjs`. Forçamos o preset
  // node-server para que `vite build` gere o servidor Node standalone que o
  // Docker executa (`bun .output/server/index.mjs`).
  // No sandbox Lovable Cloud o preset é sobrescrito para cloudflare-module
  // automaticamente (comportamento da própria config) — deploy na nuvem
  // continua funcionando sem alterações.
  nitro: {
    preset: "node-server",
  },
});
