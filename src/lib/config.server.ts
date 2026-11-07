import process from "node:process";
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

// ─── Fallback: leitura direta do arquivo .env (apenas Node em dev) ─────────
// Em Cloudflare Workers (workerd), não há sistema de arquivos e as variáveis
// chegam diretamente via bindings / env. Em dev no Node, usamos o módulo fs
// resolvido dinamicamente via process.getBuiltinModule sem importar estaticamente
// node:fs (evitando quebrar o bundle na borda).
function getFsModule(): { statSync: Function; readFileSync: Function } | null {
  try {
    if (typeof process !== "undefined" && typeof (process as any).getBuiltinModule === "function") {
      return (process as any).getBuiltinModule("node:fs") ?? null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

let cachedDotEnv: Record<string, string> | null | undefined;
let cachedDotEnvMtime = 0;

function loadDotEnvFile(): Record<string, string> | null {
  try {
    const fs = getFsModule();
    if (!fs) return null;
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
 * 1. process.env (produção — Cloudflare, Vercel, Docker, VPS)
 * 2. globalThis.__env__ (Cloudflare Workers bindings / secrets via Nitro)
 * 3. import.meta.env (Vite define apenas as vars VITE_* no build)
 * 4. Arquivo .env na raiz do projeto (garante o funcionamento em dev no Node)
 *
 * Sempre usar dentro de handlers/funções (nunca em escopo de módulo).
 */
export function getServerEnv(key: string): string | undefined {
  if (typeof process !== "undefined" && process.env && process.env[key]) {
    return process.env[key];
  }
  try {
    const cfEnv = (globalThis as any).__env__;
    if (cfEnv && cfEnv[key]) return cfEnv[key];
  } catch {
    /* ignore */
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
    // ─── Créditos de IA (uso diário por conta) ─────────────────────
    // Limite de perguntas reais à IA por dia (saudações, respostas rápidas
    // e cache NÃO consomem). Reset automático à meia-noite no fuso abaixo.
    iaCreditosDiarios: Number(getServerEnv("IA_CREDITOS_DIARIOS") ?? 50),
    iaCreditosTimezone: getServerEnv("IA_CREDITOS_TIMEZONE") ?? "America/Sao_Paulo",
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
