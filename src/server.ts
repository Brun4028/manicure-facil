import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

// ─── Security Headers ─────────────────────────────────────────────────────────
// Content Security Policy, HSTS, e outros headers de segurança
// Aplicados a TODAS as respostas do servidor

const SELF = "'self'";
const UNSAFE_INLINE = "'unsafe-inline'"; // Necessário para estilos inline do Tailwind

const CSP_HEADER = [
  `default-src ${SELF}`,
  `script-src ${SELF} 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com https://vercel.live https://*.supabase.co`,
  `style-src ${SELF} ${UNSAFE_INLINE} https://fonts.googleapis.com https://fonts.gstatic.com`,
  `img-src ${SELF} data: blob: https: https://*.supabase.co`,
  `font-src ${SELF} https://fonts.googleapis.com https://fonts.gstatic.com data:`,
  `connect-src ${SELF} https://*.supabase.co https://api.openai.com https://generativelanguage.googleapis.com https://va.vercel-scripts.com https://vercel.live wss://*.supabase.co`,
  `frame-src ${SELF} https://*.supabase.co`,
  `media-src ${SELF} data: blob:`,
  `object-src 'none'`,
  `base-uri ${SELF}`,
  `form-action ${SELF}`,
  `frame-ancestors 'none'`,
  `upgrade-insecure-requests`,
].join("; ");

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": CSP_HEADER,
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
};

function applySecurityHeaders(response: Response): Response {
  const newHeaders = new Headers(response.headers);
  
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    // Não sobrescreve headers já definidos
    if (!newHeaders.has(key)) {
      newHeaders.set(key, value);
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

// ─── Rate Limiting (In-Memory) ─────────────────────────────────────────────
// NOTA: Para produção com múltiplos servidores, migrar para Redis.

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Limpeza periódica do rate limit store (a cada 5 minutos)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now > entry.resetAt) {
        rateLimitStore.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

type RateLimitConfig = {
  /** Máximo de requisições */
  maxRequests: number;
  /** Janela de tempo em milissegundos */
  windowMs: number;
};

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Autenticação: 5 tentativas por minuto
  auth: { maxRequests: 5, windowMs: 60_000 },
  // Criação de agendamento público: 3 por minuto
  public_booking: { maxRequests: 3, windowMs: 60_000 },
  // API de IA: 20 requisições por minuto
  ai: { maxRequests: 20, windowMs: 60_000 },
  // Geral: 100 requisições por minuto
  general: { maxRequests: 100, windowMs: 60_000 },
};

function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "127.0.0.1"
  );
}

function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): { allowed: boolean; remaining: number; retryAfter: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, remaining: config.maxRequests - 1, retryAfter: 0 };
  }

  entry.count++;

  if (entry.count > config.maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  return { allowed: true, remaining: config.maxRequests - entry.count, retryAfter: 0 };
}

function getRateLimitConfig(pathname: string, method: string): RateLimitConfig {
  // Rate limit em autenticação APENAS para POST (tentativas de login)
  if ((pathname.startsWith("/auth") || pathname === "/api/auth") && method === "POST") {
    return RATE_LIMITS.auth;
  }
  if (pathname.startsWith("/agendar/")) return RATE_LIMITS.public_booking;
  // Server functions do TanStack Start são POSTadas em rotas do tipo /_server-fn/<id>.
  // O id da getAiChatResponse inclui o caminho do arquivo (ai/ai-chat) — detecta
  // tanto pelo prefixo da rota quanto pelo nome da função para aplicar o limite de IA.
  if (
    pathname.includes("/_server-fn/") ||
    pathname.includes("/server-fn/") ||
    pathname.includes("getAiChatResponse") ||
    pathname.includes("ai-chat")
  ) {
    return RATE_LIMITS.ai;
  }
  return RATE_LIMITS.general;
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      
      // ── Rate Limiting ────────────────────────────────────────────
      const ip = getClientIp(request);
      const rateLimitConfig = getRateLimitConfig(url.pathname, request.method);
      const rateLimitKey = `${ip}:${request.method}:${url.pathname}`;
      const rateCheck = checkRateLimit(rateLimitKey, rateLimitConfig);

      if (!rateCheck.allowed) {
        return new Response(
          JSON.stringify({
            error: "Muitas requisições. Aguarde alguns segundos e tente novamente.",
            retryAfter: rateCheck.retryAfter,
          }),
          {
            status: 429,
            headers: {
              "content-type": "application/json; charset=utf-8",
              "retry-after": String(rateCheck.retryAfter),
              "x-ratelimit-limit": String(rateLimitConfig.maxRequests),
              "x-ratelimit-remaining": "0",
              "x-ratelimit-reset": String(Math.ceil((Date.now() + rateLimitConfig.windowMs) / 1000)),
            },
          },
        );
      }

      // ── Processa a requisição ─────────────────────────────────────
      const handler = await getServerEntry();
      let response = await handler.fetch(request, env, ctx);
      
      // ── Normaliza erros catastróficos ───────────────────────
      response = await normalizeCatastrophicSsrResponse(response);
      
      // ── Aplica headers de segurança ─────────────────────────
      response = applySecurityHeaders(response);
      
      return response;
    } catch (error) {
      console.error(error);
      return applySecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};
