/**
 * Cupons — Server Functions (validação e uso NO SERVIDOR)
 *
 * Motivo: o desconto NÃO pode depender só do navegador. Toda decisão de
 * elegibilidade, cálculo do melhor desconto e consumo de limite de uso
 * acontece aqui, usando a mesma lógica pura compartilhada (cupons-logica).
 *
 * Fluxos:
 * - Público (/agendar/:id): `avaliarCuponsPublico` (leitura) +
 *   `consumirCupomPublico` (consumo atômico dentro do agendamento).
 * - Interno (agenda + PDV): `avaliarCuponsInterno` (leitura) +
 *   `consumirCupomInterno` (consumo).
 *
 * Consumo de limite: usa um UPDATE condicional (guarda "usos < limite")
 * para evitar dois consumos simultâneos estourarem o limite.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  melhorCupom,
  validarCupom,
  paraCupom,
  COLUNAS_CUPOM,
  type Cupom,
  type LinhaCupom,
  type MelhorCupom,
} from "@/lib/cupons-logica";

type ResultadoAvaliacao = {
  cupom: MelhorCupom | null;
  /** todos os candidatos rejeitados (mesmo quando há um elegível) */
  rejeitados: { nome: string; motivo: string }[];
};

function avaliarCandidatos(
  rows: LinhaCupom[],
  base: number,
  servicoId: string | null,
): ResultadoAvaliacao {
  const candidatos = rows.map(paraCupom);
  const resultado = melhorCupom(candidatos, { base, servicoId });
  return {
    cupom: resultado,
    rejeitados: resultado?.rejeitados ?? candidatosRejeitados(candidatos, base, servicoId),
  };
}

function candidatosRejeitados(
  candidatos: Cupom[],
  base: number,
  servicoId: string | null,
): { nome: string; motivo: string }[] {
  return candidatos
    .map((c) => {
      const r = validarCupom(c, { base, servicoId });
      return r.elegivel && !r.motivo ? null : { nome: c.nome, motivo: r.motivo ?? "Não elegível" };
    })
    .filter((x): x is { nome: string; motivo: string } => x !== null);
}

// ─── PÚBLICO: avaliar cupons na página de agendamento ──────────────────────

const avaliarPublicoSchema = z.object({
  userId: z.string().uuid("Identificador inválido"),
  servicoId: z.string().uuid("Serviço inválido"),
  base: z.number().min(0),
});

export const avaliarCuponsPublico = createServerFn({ method: "POST" })
  .validator(avaliarPublicoSchema)
  .handler(
    async ({
      data,
    }): Promise<{ ok: true; data: ResultadoAvaliacao } | { ok: false; error: string }> => {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: rows } = await supabaseAdmin
          .from("promocoes")
          .select(COLUNAS_CUPOM)
          .eq("user_id", data.userId)
          .order("valor", { ascending: false });
        return { ok: true, data: avaliarCandidatos(rows ?? [], data.base, data.servicoId) };
      } catch {
        return { ok: false, error: "Não foi possível avaliar cupons no momento." };
      }
    },
  );

// ─── INTERNO (autenticado): avaliar cupons para agenda/PDV ─────────────────

const avaliarInternoSchema = z.object({
  base: z.number().min(0),
  servicoId: z.string().uuid().nullable().optional(),
});

export const avaliarCuponsInterno = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(avaliarInternoSchema)
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true; data: ResultadoAvaliacao } | { ok: false; error: string }> => {
      try {
        const { supabase, userId } = context;
        const { data: rows, error } = await supabase
          .from("promocoes")
          .select(COLUNAS_CUPOM)
          .eq("user_id", userId)
          .order("valor", { ascending: false });
        if (error) throw error;
        return {
          ok: true,
          data: avaliarCandidatos(rows ?? [], data.base, data.servicoId ?? null),
        };
      } catch {
        return { ok: false, error: "Não foi possível avaliar cupons no momento." };
      }
    },
  );

// ─── Consumo (interno, autenticado) ─────────────────────────────────────────

const consumirInternoSchema = z.object({
  cupomId: z.string().uuid("Cupom inválido"),
  base: z.number().min(0),
  clienteId: z.string().uuid().nullable().optional(),
  origem: z.enum(["pdv", "agendamento"]),
  entidadeId: z.string().uuid().nullable().optional(),
});

export const consumirCupomInterno = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(consumirInternoSchema)
  .handler(
    async ({ data, context }): Promise<{ ok: boolean; error?: string; desconto?: number }> => {
      const { supabase, userId } = context;

      const { data: row } = await supabase
        .from("promocoes")
        .select(COLUNAS_CUPOM)
        .eq("user_id", userId)
        .eq("id", data.cupomId)
        .maybeSingle();
      if (!row) return { ok: false, error: "Cupom não encontrado." };

      const cupom = paraCupom(row);
      const validacao = validarCupom(cupom, { base: data.base });
      if (!validacao.elegivel) {
        return { ok: false, error: validacao.motivo ?? "Cupom não é válido para esta compra." };
      }

      // UPDATE condicional: só consome se ainda há limite disponível.
      const { data: atualizado, error: updErr } = await supabase
        .from("promocoes")
        .update({ usos: cupom.usos + 1 })
        .eq("id", cupom.id)
        .eq("user_id", userId)
        .lt("usos", cupom.limite_usos ?? 2147483647)
        .select("id")
        .maybeSingle();
      if (updErr) return { ok: false, error: "Não foi possível consumir o cupom." };
      if (!atualizado) return { ok: false, error: "Limite de usos do cupom atingido." };

      await supabase.from("cupom_usos").insert({
        user_id: userId,
        promocao_id: cupom.id,
        cliente_id: data.clienteId ?? null,
        origem: data.origem,
        entidade_id: data.entidadeId ?? null,
        valor_desconto: validacao.desconto,
      });

      return { ok: true, desconto: validacao.desconto };
    },
  );

// ─── Consumo (público, service_role) — chamado pelo agendamento público ─────

const consumirPublicoSchema = z.object({
  userId: z.string().uuid("Identificador inválido"),
  cupomId: z.string().uuid("Cupom inválido"),
  base: z.number().min(0),
  entidadeId: z.string().uuid().nullable().optional(),
});

export const consumirCupomPublico = createServerFn({ method: "POST" })
  .validator(consumirPublicoSchema)
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; desconto?: number }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row } = await supabaseAdmin
      .from("promocoes")
      .select(COLUNAS_CUPOM)
      .eq("user_id", data.userId)
      .eq("id", data.cupomId)
      .maybeSingle();
    if (!row) return { ok: false, error: "Cupom não encontrado." };

    const cupom = paraCupom(row);
    const validacao = validarCupom(cupom, { base: data.base });
    if (!validacao.elegivel) {
      return { ok: false, error: validacao.motivo ?? "Cupom não é válido para esta compra." };
    }

    const { data: atualizado } = await supabaseAdmin
      .from("promocoes")
      .update({ usos: cupom.usos + 1 })
      .eq("id", cupom.id)
      .eq("user_id", data.userId)
      .lt("usos", cupom.limite_usos ?? 2147483647)
      .select("id")
      .maybeSingle();
    if (!atualizado) return { ok: false, error: "Limite de usos do cupom atingido." };

    await supabaseAdmin.from("cupom_usos").insert({
      user_id: data.userId,
      promocao_id: cupom.id,
      origem: "agendamento",
      entidade_id: data.entidadeId ?? null,
      valor_desconto: validacao.desconto,
    });

    return { ok: true, desconto: validacao.desconto };
  });
