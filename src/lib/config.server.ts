import process from "node:process";

// Server-only config. The .server.ts suffix prevents Vite from bundling
// this file into the client — values here never reach the browser.
//
// On Cloudflare Workers, env binds at REQUEST time. Module-scope reads
// (e.g. `const x = process.env.X`) resolve to undefined — always read
// process.env INSIDE a function or handler.
//
// When to use which env-access pattern:
//   - .server.ts module (this file): server-only helpers reused across
//     handlers. Wrap reads in a function so they run per-request.
//   - inline process.env inside a createServerFn handler: one-off reads
//     not reused elsewhere.
//   - import.meta.env.VITE_FOO: PUBLIC config readable from both client
//     and server (analytics IDs, public URLs). Define in .env with the
//     VITE_ prefix. Never put secrets here — they ship to the browser.

/**
 * Lê uma variável de ambiente de forma robusta:
 * 1. process.env (produção, Docker, VPS, dev com shell configurado)
 * 2. import.meta.env (Vite define env vars do arquivo .env no build)
 *
 * Sempre usar dentro de handlers/funções (nunca em escopo de módulo).
 */
export function getServerEnv(key: string): string | undefined {
  if (typeof process !== "undefined" && process.env && process.env[key]) {
    return process.env[key];
  }
  try {
    const meta = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    if (meta && meta[key]) return meta[key];
  } catch {
    /* ignore */
  }
  return undefined;
}

export function getServerConfig() {
  return {
    nodeEnv: getServerEnv("NODE_ENV"),
    // ─── AI Provider Configuration ──────────────────────────────────
    // Define qual provedor de IA usar: "openai" (default) ou "gemini"
    aiProvider: getServerEnv("AI_PROVIDER") ?? "openai",
    // OpenAI
    openAiApiKey: getServerEnv("OPENAI_API_KEY"),
    openAiModel: getServerEnv("OPENAI_MODEL") ?? "gpt-4o-mini",
    // Google Gemini
    geminiApiKey: getServerEnv("GEMINI_API_KEY"),
    geminiModel: getServerEnv("GEMINI_MODEL") ?? "gemini-flash-latest",
    // ─── Rate Limiting Configuration ────────────────────────────────
    // Define limites de rate limiting por categoria
    rateLimit: {
      authMaxRequests: Number(getServerEnv("RATE_LIMIT_AUTH_MAX") ?? 5),
      authWindowMs: Number(getServerEnv("RATE_LIMIT_AUTH_WINDOW_MS") ?? 60_000),
      aiMaxRequests: Number(getServerEnv("RATE_LIMIT_AI_MAX") ?? 20),
      aiWindowMs: Number(getServerEnv("RATE_LIMIT_AI_WINDOW_MS") ?? 60_000),
      generalMaxRequests: Number(getServerEnv("RATE_LIMIT_GENERAL_MAX") ?? 100),
      generalWindowMs: Number(getServerEnv("RATE_LIMIT_GENERAL_WINDOW_MS") ?? 60_000),
    },
  };
}
