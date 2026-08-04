/**
 * Agendamento Público — Server Functions (SEM autenticação, mas SEM chave anon)
 *
 * A página pública /agendar/:userId NUNCA mais consulta o banco direto com a
 * chave anon. Todas as leituras e escritas passam por estas funções, que usam
 * o client service_role NO SERVIDOR.
 *
 * Segurança:
 * - Apenas contas com status 'ativo' (e não expiradas) têm dados expostos
 * - Serviços expostos SEM o campo `custo` (dado comercial sensível)
 * - Criação de agendamento delega para a função SQL `agendar_servico`
 *   (valida conta ativa, conflito de horário, serviço ativo etc.)
 * - Criação de avaliação delega para `criar_avaliacao`
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// ─── Schemas ────────────────────────────────────────────────────────────────

const userIdSchema = z.object({
  userId: z.string().uuid("Identificador inválido"),
});

const agendamentoSchema = z.object({
  userId: z.string().uuid("Identificador inválido"),
  nome: z.string().trim().min(2, "Informe seu nome").max(120),
  telefone: z.string().trim().min(8, "Telefone inválido").max(20),
  email: z.union([z.literal(""), z.string().trim().email("E-mail inválido").max(255)]).optional(),
  dataNascimento: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")]).optional(),
  observacoes: z.string().trim().max(1000).optional(),
  servicoId: z.string().uuid("Serviço inválido"),
  dataHora: z.string().min(1, "Data/hora inválida"),
});

const avaliacaoSchema = z.object({
  userId: z.string().uuid("Identificador inválido"),
  nome: z.string().trim().min(2, "Informe seu nome").max(120),
  nota: z.number().int().min(1).max(5),
  comentario: z.string().trim().max(1000).optional(),
});

// ─── Envelope tipado de resposta ────────────────────────────────────────────

export type PublicoManicure = {
  perfil: { nome: string | null; avatar_url: string | null };
  servicos: { id: string; nome: string; valor: number; duracao_min: number }[];
  agendamentos: { data_hora: string; duracao_min: number; status: string }[];
  portfolio: { id: string; titulo: string; imagem_url: string; tags: string[] | null }[];
  avaliacoes: { id: string; cliente_nome: string; nota: number; comentario: string | null; data: string }[];
  fidelidade: { niver_promo_ativa: boolean; niver_desconto_porcentagem: number } | null;
  // 🔧 NOVO: expediente e bloqueios da manicure — usados pela página pública
  // para desabilitar slots fora do horário de trabalho / em dias bloqueados
  // (antes a página oferecia 08h-18h em TODOS os dias e o banco rejeitava no
  // final). Incluídos apenas horários ativos e bloqueios a partir de hoje.
  horarios: { dia_semana: number; hora_inicio: string; hora_fim: string }[];
  bloqueios: {
    data_inicio: string;
    data_fim: string | null;
    hora_inicio: string | null;
    hora_fim: string | null;
  }[];
};

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: string };

// ─── Leitura dos dados públicos da manicure ─────────────────────────────────

export const getDadosPublicosManicure = createServerFn({ method: "POST" })
  .validator(userIdSchema)
  .handler(async ({ data }): Promise<Ok<PublicoManicure> | Err> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = data;

    // 1. Conta deve existir e estar ATIVA
    const { data: conta } = await supabaseAdmin
      .from("contas")
      .select("status")
      .eq("user_id", userId)
      .maybeSingle();

    if (!conta || conta.status !== "ativo") {
      return { ok: false, error: "Perfil indisponível no momento." };
    }

    // 2. Busca os dados públicos (nunca `custo`, telefones ou observações)
    // 🔒 PRIVACIDADE: só agendamentos FUTUROS e não cancelados são expostos
    // (necessários para mostrar disponibilidade). O histórico passado da
    // agenda (dias/horários já atendidos) permanece privado.
    // 🔒 PERFORMANCE: limites máximos por coleção evitam respostas gigantes
    // para manicures com muitos registros.
    const agora = new Date().toISOString();
    // Filtro de bloqueios: usa a data de ONTEM (UTC) como limite inferior para
    // não excluir bloqueios que terminam "hoje" no fuso local do cliente
    // (ex.: Brasil UTC-3 — à noite, a data UTC já é o dia seguinte). O check
    // client-side/DB faz a comparação exata por dia.
    const hoje = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const [perfil, servicos, agendamentos, portfolio, avaliacoes, fidelidade, horarios, bloqueios] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("nome, avatar_url")
        .eq("id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("servicos")
        .select("id, nome, valor, duracao_min")
        .eq("user_id", userId)
        .eq("ativo", true)
        .order("nome"),
      supabaseAdmin
        .from("agendamentos")
        .select("data_hora, duracao_min, status")
        .eq("user_id", userId)
        .neq("status", "cancelado")
        .gte("data_hora", agora)
        .order("data_hora", { ascending: true })
        .limit(500),
      supabaseAdmin
        .from("portfolio")
        .select("id, titulo, imagem_url, tags")
        .eq("user_id", userId)
        .eq("publico", true)
        .order("created_at", { ascending: false })
        .limit(60),
      supabaseAdmin
        .from("avaliacoes")
        .select("id, cliente_nome, nota, comentario, data")
        .eq("user_id", userId)
        .eq("publico", true)
        .order("data", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("fidelidade_config")
        .select("niver_promo_ativa, niver_desconto_porcentagem")
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("horarios_trabalho")
        .select("dia_semana, hora_inicio, hora_fim")
        .eq("user_id", userId)
        .eq("ativo", true),
      supabaseAdmin
        .from("bloqueios_agenda")
        .select("data_inicio, data_fim, horario_inicio, horario_fim")
        .eq("user_id", userId)
        .or(`data_fim.is.null,data_fim.gte.${hoje}`)
        .order("data_inicio", { ascending: true })
        .limit(100),
    ]);

    // NOTE: no banco real, bloqueios_agenda usa horario_inicio/horario_fim
    // (o nome na migration original divergiu — ver relatório de auditoria).
    const bloqueiosMapeados = (bloqueios.data ?? []).map((b) => ({
      data_inicio: b.data_inicio,
      data_fim: b.data_fim,
      hora_inicio: b.horario_inicio,
      hora_fim: b.horario_fim,
    }));

    return {
      ok: true,
      data: {
        perfil: perfil.data ?? { nome: null, avatar_url: null },
        servicos: servicos.data ?? [],
        agendamentos: agendamentos.data ?? [],
        portfolio: portfolio.data ?? [],
        avaliacoes: avaliacoes.data ?? [],
        fidelidade: fidelidade.data ?? null,
        horarios: (horarios.data ?? []).map((h) => ({
          dia_semana: Number(h.dia_semana),
          hora_inicio: h.hora_inicio,
          hora_fim: h.hora_fim,
        })),
        bloqueios: bloqueiosMapeados,
      },
    };
  });

// ─── Criar agendamento (delega para a função SQL validada) ─────────────────

export const criarAgendamentoPublico = createServerFn({ method: "POST" })
  .validator(agendamentoSchema)
  .handler(async ({ data }): Promise<Ok<{ agendamento_id: string | null }> | Err> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // ── Preço final calculado NO SERVIDOR (o cliente nunca controla valores) ──
    const { data: servico } = await supabaseAdmin
      .from("servicos")
      .select("valor")
      .eq("id", data.servicoId)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (!servico) {
      return { ok: false, error: "Serviço não encontrado." };
    }

    let descontoPct = 0;
    if (data.dataNascimento) {
      const { data: fid } = await supabaseAdmin
        .from("fidelidade_config")
        .select("niver_promo_ativa, niver_desconto_porcentagem")
        .eq("user_id", data.userId)
        .maybeSingle();
      const nascimento = new Date(`${data.dataNascimento}T00:00:00`);
      if (
        fid?.niver_promo_ativa &&
        !isNaN(nascimento.getTime()) &&
        nascimento.getMonth() === new Date().getMonth()
      ) {
        descontoPct = Number(fid.niver_desconto_porcentagem ?? 0);
      }
    }
    const valorFinal = Math.round(servico.valor * (100 - descontoPct)) / 100;

    const result = await supabaseAdmin.rpc("agendar_servico", {
      p_user_id: data.userId,
      p_cliente_nome: data.nome,
      p_cliente_telefone: data.telefone,
      p_cliente_email: data.email || null,
      p_cliente_data_nascimento: data.dataNascimento || null,
      p_cliente_observacoes: data.observacoes || null,
      p_servico_id: data.servicoId,
      p_data_hora: data.dataHora,
      p_observacoes: null,
      p_valor_final: valorFinal,
    });

    const payload = (result.data ?? {}) as {
      success?: boolean;
      error?: string;
      agendamento_id?: string | null;
    };

    if (result.error || payload.success !== true) {
      return { ok: false, error: payload.error ?? "Não foi possível realizar o agendamento." };
    }

    return { ok: true, data: { agendamento_id: payload.agendamento_id ?? null } };
  });

// ─── Criar avaliação (delega para a função SQL validada) ───────────────────

export const criarAvaliacaoPublica = createServerFn({ method: "POST" })
  .validator(avaliacaoSchema)
  .handler(async ({ data }): Promise<Ok<{ avaliacao_id: string | null }> | Err> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const result = await supabaseAdmin.rpc("criar_avaliacao", {
      p_user_id: data.userId,
      p_cliente_nome: data.nome,
      p_nota: data.nota,
      p_comentario: data.comentario || null,
    });

    const payload = (result.data ?? {}) as {
      success?: boolean;
      error?: string;
      avaliacao_id?: string | null;
    };

    if (result.error || payload.success !== true) {
      return { ok: false, error: payload.error ?? "Não foi possível enviar a avaliação." };
    }

    return { ok: true, data: { avaliacao_id: payload.avaliacao_id ?? null } };
  });
