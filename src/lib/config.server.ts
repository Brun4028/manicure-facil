import process from "node:process";
import fs from "node:fs";
import path from "node:path";

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

// ─── Fallback: leitura direta do arquivo .env ──────────────────────────────
// Alguns runtimes (ex.: `npm run dev` em certas configurações, CI) NÃO
// injetam as variáveis não-prefixadas do .env no process.env — o Vite expõe
// apenas as VITE_* via import.meta.env. Este fallback lê o .env da raiz do
// projeto quando a variável não foi encontrada, garantindo que a IA e o
// restante do servidor funcionem em dev SEM depender de como o processo
// foi iniciado. No-op em produção: o .env não é deployado (gitignore +
// dockerignore), então o valor real vem do ambiente (Vercel/Docker/VPS).
//
// ⚠️ PARSER INTENCIONALMENTE MÍNIMO (best-effort): apenas `KEY=valor`,
// comentários com `#` no início da linha e remoção de aspas simples/duplas.
// NÃO suporta variáveis interpoladas, escape de `\n` ou comentários inline
// (`.env` de verdade). Suficiente para chaves de API — não substituir por
// um parser pesado sem necessidade.
let cachedDotEnv: Record<string, string> | null | undefined;
let cachedDotEnvMtime = 0;

function loadDotEnvFile(): Record<string, string> | null {
  try {
    const file = path.resolve(process.cwd(), ".env");
    // Em dev, se o .env mudar (ex.: usuário editou a chave), recarrega —
    // evita cache obsoleto por mtime.
    const stat = fs.statSync(file, { throwIfNoEntry: false });
    if (!stat) {
      cachedDotEnv = null;
      cachedDotEnvMtime = 0;
      return null;
    }
    if (cachedDotEnv !== undefined && stat.mtimeMs === cachedDotEnvMtime) {
      return cachedDotEnv;
    }
    cachedDotEnvMtime = stat.mtimeMs;
    const content = fs.readFileSync(file, "utf8");
    const parsed: Record<string, string> = {};
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      // Remove aspas simples ou duplas ao redor do valor
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key) parsed[key] = value;
    }
    cachedDotEnv = parsed;
    return cachedDotEnv;
  } catch {
    cachedDotEnv = null;
    cachedDotEnvMtime = 0;
    return null;
  }
}

/**
 * Lê uma variável de ambiente de forma robusta:
 * 1. process.env (produção — Vercel, Docker, VPS; dev com shell configurado)
 * 2. import.meta.env (Vite define apenas as vars VITE_* no build)
 * 3. Arquivo .env na raiz do projeto (garante o funcionamento em dev)
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
  // Fallback final: arquivo .env (dev). Injeta no process.env para que as
  // próximas leituras do mesmo processo sejam consistentes.
  const dotenv = loadDotEnvFile();
  if (dotenv && dotenv[key]) {
    if (typeof process !== "undefined" && process.env) {
      process.env[key] = dotenv[key];
    }
    return dotenv[key];
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
