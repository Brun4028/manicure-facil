// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// ── Code splitting (Vite 8 / Rolldown) ──────────────────────────────────────
// O Rolldown (bundler do Vite 8) substituiu o antigo `manualChunks` do Rollup
// pela opção `output.codeSplitting.groups`. Separamos os vendors pesados em
// chunks nomeados para:
//   1. Eliminar o aviso "Some chunks are larger than 500 kB" no build do cliente.
//   2. Melhorar o cache HTTP (chunks de vendor mudam pouco entre deploys).
//   3. Reduzir o bundle inicial: o entry fica só com o código da aplicação.
//
// Ordem de prioridade: grupos com priority maior capturam o módulo primeiro.
// `minShareCount: 2` garante que só virem chunk compartilhado libs usadas em
// 2+ entradas (evita chunks inúteis para libs de uma rota só).

const vendorGroups = [
  {
    name: "react",
    test: /node_modules[\\/](react|react-dom|scheduler)([\\/]|$)/,
    priority: 40,
  },
  {
    name: "supabase",
    test: /node_modules[\\/]@supabase/,
    priority: 30,
  },
  {
    name: "tanstack",
    test: /node_modules[\\/]@tanstack/,
    priority: 30,
  },
  {
    name: "charts",
    // recharts + dependências internas (d3, react-smooth, etc.)
    test: /node_modules[\\/](recharts|d3-[a-z0-9-]+|react-smooth|decimal\.js-light|victory-vendor)([\\/]|$)/,
    priority: 25,
  },
  {
    name: "markdown",
    // react-markdown + pipeline remark/micromark (usado só no Assistente IA)
    test: /node_modules[\\/](react-markdown|remark-gfm|micromark|mdast-|hast-|unified|unist-|vfile|character-entities|decode-named-character-reference|property-information|space-separated-tokens|comma-separated-tokens|bail|ccount|escape-string-regexp|markdown-table|mdurl|zwitch|devlop|trim-lines|longest-streak|is-plain-obj|trough)([\\/]|$)/,
    priority: 25,
  },
  {
    name: "date-fns",
    test: /node_modules[\\/]date-fns/,
    priority: 20,
  },
  {
    name: "ui",
    // shadcn/ui + primitivas radix + utilidades de estilo
    test: /node_modules[\\/](@radix-ui|sonner|class-variance-authority|clsx|tailwind-merge|lucide-react)([\\/]|$)/,
    priority: 15,
  },
  {
    name: "vendor",
    test: /node_modules[\\/]/,
    priority: 10,
    minShareCount: 2,
  },
];

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // ── Preset de deploy (selecionado por ambiente) ──────────────────────────
  // Fora do sandbox Lovable, o plugin nitro NÃO roda por padrão (a config
  // detecta "No Lovable context" e pula o deploy build) — passar `nitro: {...}`
  // força o plugin a rodar no `vite build`.
  //
  // Docker/VPS: o Dockerfile espera `.output/server/index.mjs`, então fora da
  // Vercel o preset padrão é `node-server` (servidor Node standalone que o
  // Docker executa com `bun .output/server/index.mjs`).
  //
  // Vercel: a Vercel define `VERCEL=1` em todo build. Nesse caso usamos o
  // preset oficial `vercel` do Nitro, que gera o Build Output API em
  // `.vercel/output` (mesmo mecanismo zero-config do exemplo oficial
  // Vercel/TanStack Start). `NITRO_PRESET` permite um override explícito
  // (ex.: NITRO_PRESET=vercel) em qualquer ambiente.
  //
  // No sandbox Lovable Cloud o preset é sobrescrito para cloudflare-module
  // automaticamente (comportamento da própria config) — deploy na nuvem
  // continua funcionando sem alterações.
  nitro: {
    preset:
      process.env.NITRO_PRESET ||
      (process.env.VERCEL ? "vercel" : "node-server"),
  },
  vite: {
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: vendorGroups,
          },
        },
      },
    },
  },
});
