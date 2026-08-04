/**
 * Painel Admin — Server Functions
 *
 * Toda operação administrativa roda NO SERVIDOR com o client service_role
 * (que ignora RLS de propósito, pois é o caminho de administração).
 *
 * Segurança:
 * - Middleware `requireAdminAuth`: valida o JWT, o status da conta ('ativo')
 *   e o papel de admin (coluna `contas.is_admin` OU e-mail na env ADMIN_EMAILS)
 * - As funções nunca são chamáveis por usuários comuns: falham no middleware
 * - Pronto para a Kirvano: `atualizarConta` aceita plano/fonte/transação, e o
 *   futuro webhook só precisa chamar a mesma lógica com service_role
 */

import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { getServerEnv } from "../config.server";

// ─── Middleware: autenticação + conta ativa + admin ─────────────────────────

export const requireAdminAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { createClient } = await import("@supabase/supabase-js");

    const SUPABASE_URL = getServerEnv("SUPABASE_URL");
    const SUPABASE_PUBLISHABLE_KEY = getServerEnv("SUPABASE_PUBLISHABLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      throw new Error("Supabase não configurado no servidor");
    }

    const request = getRequest();
    const authHeader = request?.headers?.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new Error("Não autorizado: token ausente");
    }
    const token = authHeader.replace("Bearer ", "");

    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims?.sub) {
      throw new Error("Não autorizado: token inválido");
    }
    const userId = data.claims.sub;

    // 1) Conta deve estar ATIVA e não expirada
    const { data: conta } = await supabase
      .from("contas")
      .select("status, is_admin, acesso_termina_em")
      .eq("user_id", userId)
      .maybeSingle();
    if (!conta || conta.status !== "ativo") {
      throw new Error("Conta sem acesso ativo");
    }
    if (conta.acesso_termina_em && new Date(conta.acesso_termina_em).getTime() < Date.now()) {
      throw new Error("Acesso expirado");
    }

    // 2) Deve ser admin (flag no banco OU allowlist por e-mail)
    const adminEmails = (getServerEnv("ADMIN_EMAILS") ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const userEmail = typeof data.claims.email === "string" ? data.claims.email.toLowerCase() : "";
    const isAdmin = conta.is_admin === true || adminEmails.includes(userEmail);

    if (!isAdmin) {
      throw new Error("Acesso restrito a administradores");
    }

    return next({
      context: { supabase, userId, claims: data.claims },
    });
  },
);

// ─── Schemas ────────────────────────────────────────────────────────────────

const contaStatusSchema = z.enum(["ativo", "inativo", "bloqueado", "suspenso"]);

const atualizarContaSchema = z.object({
  userId: z.string().uuid(),
  status: contaStatusSchema.optional(),
  plano: z.union([z.literal(""), z.string().trim().max(60)]).optional(),
  trialFim: z.union([z.literal(""), z.string()]).optional(),
  acessoTerminaEm: z.union([z.literal(""), z.string()]).optional(),
  motivoBloqueio: z.union([z.literal(""), z.string().trim().max(300)]).optional(),
});

const convidarSchema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  nome: z.string().trim().min(2, "Informe o nome").max(80),
  plano: z.union([z.literal(""), z.string().trim().max(60)]).optional(),
});

const gerarLinkSchema = z.object({ userId: z.string().uuid() });

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type ContaAdmin = {
  user_id: string;
  email: string | null;
  nome: string | null;
  status: Database["public"]["Enums"]["conta_status"];
  is_admin: boolean;
  plano: string | null;
  fonte: string;
  kirvano_transacao_id: string | null;
  trial_inicio: string | null;
  trial_fim: string | null;
  acesso_termina_em: string | null;
  motivo_bloqueio: string | null;
  criado_em: string;
};

// ─── Listar todas as contas ─────────────────────────────────────────────────

export const listarContas = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .handler(async (): Promise<{ ok: true; data: ContaAdmin[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [contasRes, perfisRes] = await Promise.all([
      supabaseAdmin.from("contas").select("*").order("criado_em", { ascending: false }),
      supabaseAdmin.from("profiles").select("id, nome"),
    ]);

    // 🔧 FIX ESCALABILIDADE: listUsers retorna no máximo 1000 usuários por
    // página. Para um SaaS com centenas/milhares de clientes, percorremos
    // todas as páginas para não "sumir" com contas do painel admin.
    const emailPorId = new Map<string, string | null>();
    const PER_PAGE = 1000;
    let page = 1;
    for (;;) {
      const { data: usuariosRes, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: PER_PAGE,
      });
      if (error) {
        console.error("[Admin] Falha ao listar usuários:", error.message);
        break;
      }
      for (const u of usuariosRes?.users ?? []) {
        emailPorId.set(u.id, u.email ?? null);
      }
      const total = usuariosRes?.users?.length ?? 0;
      if (total < PER_PAGE) break;
      page += 1;
    }

    const nomePorId = new Map<string, string | null>();
    for (const p of perfisRes.data ?? []) {
      nomePorId.set(p.id, p.nome);
    }

    const data: ContaAdmin[] = (contasRes.data ?? []).map((c) => ({
      ...c,
      email: emailPorId.get(c.user_id) ?? null,
      nome: nomePorId.get(c.user_id) ?? null,
    }));

    return { ok: true, data };
  });

// ─── Atualizar status / plano / trial / renovação de uma conta ─────────────

export const atualizarConta = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .validator(atualizarContaSchema)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const update = {} as Database["public"]["Tables"]["contas"]["Update"];
    if (data.status !== undefined) update.status = data.status;
    if (data.plano !== undefined) update.plano = data.plano || null;
    if (data.trialFim !== undefined) update.trial_fim = data.trialFim || null;
    if (data.acessoTerminaEm !== undefined) update.acesso_termina_em = data.acessoTerminaEm || null;
    if (data.motivoBloqueio !== undefined) update.motivo_bloqueio = data.motivoBloqueio || null;
    update.atualizado_em = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from("contas")
      .update(update)
      .eq("user_id", data.userId);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });

// ─── Convidar novo cliente (fluxo Kirvano / liberação manual) ──────────────

export const convidarUsuario = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .validator(convidarSchema)
  .handler(async ({ data }): Promise<{ ok: true; userId: string } | { ok: false; error: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Cria o usuário e envia o e-mail de convite (confirmar e-mail + criar senha).
    // Requer "Confirm email" habilitado em Authentication > Providers > Email.
    const { data: convite, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      data.email,
      { data: { nome: data.nome } },
    );

    if (error) {
      // 422 = usuário já existe com este e-mail
      return { ok: false, error: error.message };
    }

    const userId = convite.user.id;

    // O trigger handle_new_user criou a linha de `contas` com status 'inativo'.
    // Registramos a origem (admin agora; 'kirvano' no futuro) e o plano.
    const { error: updErr } = await supabaseAdmin
      .from("contas")
      .update({
        fonte: "admin",
        plano: data.plano || null,
        status: "inativo",
        atualizado_em: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (updErr) return { ok: false, error: updErr.message };

    return { ok: true, userId };
  });

// ─── Gerar link de convite (para enviar manualmente / futuro e-mail) ───────

export const gerarLinkConvite = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .validator(gerarLinkSchema)
  .handler(async ({ data }): Promise<{ ok: true; link: string } | { ok: false; error: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: usuarios } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const usuario = usuarios?.users?.find((u) => u.id === data.userId);
    if (!usuario?.email) {
      return { ok: false, error: "Usuário não encontrado" };
    }

    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email: usuario.email,
    });

    if (error || !link?.properties?.action_link) {
      return { ok: false, error: error?.message ?? "Não foi possível gerar o link" };
    }

    return { ok: true, link: link.properties.action_link };
  });
