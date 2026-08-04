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

// NOTA CSP:
// - 'unsafe-inline' é necessário para os scripts inline de hidratação do SSR
//   (TanStack Start). Removê-lo exigiria nonces — deixado como melhoria futura.
// - 'unsafe-eval' foi REMOVIDO: o bundle de produção (React 19 + Vite +
//   TanStack) não usa eval/new Function. Verificado no build.
// - As chamadas de IA (OpenAI/Gemini) são feitas APENAS no servidor (server
//   functions) — o navegador nunca conecta direto nas APIs de IA, então elas
//   não precisam estar em connect-src.
// - Domínios do Vercel (va.vercel-scripts.com / vercel.live) removidos: o app
//   não usa Vercel Analytics.
// - Cross-Origin-Embedder-Policy: require-corp REMOVIDO — quebrava o
//   carregamento de recursos cross-origin legítimos (fontes do Google, fotos
//   do Supabase Storage sem header CORP) sem benefício real para este app.
const CSP_HEADER = [
  `default-src ${SELF}`,
  `script-src ${SELF} 'unsafe-inline' https://*.supabase.co`,
  `style-src ${SELF} ${UNSAFE_INLINE} https://fonts.googleapis.com https://fonts.gstatic.com`,
  `img-src ${SELF} data: blob: https: https://*.supabase.co`,
  `font-src ${SELF} https://fonts.googleapis.com https://fonts.gstatic.com data:`,
  `connect-src ${SELF} https://*.supabase.co wss://*.supabase.co`,
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
  // Cross-Origin-Resource-Policy same-origin é seguro aqui: todos os assets
  // do app são servidos pelo próprio origin.
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
  // Autenticação: 5 tentativas por minuto (anti brute-force)
  auth: { maxRequests: 5, windowMs: 60_000 },
  // Página pública /agendar/:id (GETs do HTML + assets)
  public_booking_page: { maxRequests: 10, windowMs: 60_000 },
  // Server functions (TODAS, autenticadas ou não): 15/min por função por IP.
  // O bucket é por função (o pathname /_server-fn/<id> é único por função).
  // NÃO diferenciamos por header Authorization (controlado pelo cliente — um
  // atacante poderia adicionar um Bearer falso para trocar de bucket).
  // Para as funções públicas (agendamento/avaliação), a defesa primária
  // anti-spam é a validação no banco (conflito de horário, conta ativa); o
  // rate limit é o backstop.
  server_fn: { maxRequests: 15, windowMs: 60_000 },
  // Geral: 100 requisições por minuto
  general: { maxRequests: 100, windowMs: 60_000 },
};

// ─── IP confiável (anti-spoofing de X-Forwarded-For) ───────────────────────
// NENHUM header de proxy é confiável se a aplicação estiver exposta direto
// (sem proxy reverso): o atacante controla cf-connecting-ip, x-real-ip e
// x-forwarded-for. Em produção o proxy confiável (Cloudflare/Nginx) DEVE
// sobrescrever (não apenas acrescentar) estes headers.
//
// Opcional: fixar o header confiável via env RATE_LIMIT_TRUSTED_HEADER
// (ex.: "cf-connecting-ip" se atrás do Cloudflare, "x-real-ip" se atrás de
// Nginx). Padrão: cascata conservadora — cf-connecting-ip → x-real-ip →
// ÚLTIMO elemento de x-forwarded-for (o proxy confiável apenda o IP real ao
// final da cadeia; os elementos anteriores são do cliente).
function getClientIp(request: Request): string {
  const trustedHeader = process.env.RATE_LIMIT_TRUSTED_HEADER;
  if (trustedHeader) {
    const v = request.headers.get(trustedHeader);
    if (v) return v.trim();
  }

  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }

  return "127.0.0.1";
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

function isServerFnRequest(request: Request, pathname: string): boolean {
  // TanStack Start marca TODAS as chamadas de server function com o header
  // `x-tsr-serverFn: true` (independente do ID da função no pathname, que é
  // ofuscado em produção). Fallback pelo pathname cobre SSR interno.
  return (
    request.headers.get("x-tsr-serverFn") === "true" ||
    pathname.includes("/_server-fn/") ||
    pathname.includes("/server-fn/")
  );
}

function getRateLimitConfig(request: Request, pathname: string, method: string): RateLimitConfig {
  // Rate limit em autenticação APENAS para POST (tentativas de login)
  if ((pathname.startsWith("/auth") || pathname === "/api/auth") && method === "POST") {
    return RATE_LIMITS.auth;
  }
  if (pathname.startsWith("/agendar/")) return RATE_LIMITS.public_booking_page;

  if (isServerFnRequest(request, pathname)) {
    // Bucket único por função (pathname com ID único). Não confiamos na
    // presença do header Authorization (controlado pelo cliente).
    return RATE_LIMITS.server_fn;
  }

  return RATE_LIMITS.general;
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      
      // ── Rate Limiting ────────────────────────────────────────────
      // NOTA: limite por IP em memória. Para múltiplas instâncias em
      // produção, migrar para um store distribuído (ex.: Redis/Upstash) —
      // ver README/relatório de auditoria.
      const ip = getClientIp(request);
      const rateLimitConfig = getRateLimitConfig(request, url.pathname, request.method);
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
