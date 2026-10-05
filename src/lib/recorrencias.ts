/**
 * Geração automática de agendamentos a partir das recorrências cadastradas.
 *
 * O formulário de agendamento já gravava uma linha em `recorrencias`
 * (frequência, hora, data_inicio/data_fim, proxima_geracao), mas **nada no
 * sistema a consumia**: o registro ficava salvo e nenhum horário futuro era
 * criado — a cliente marcava "repetir agendamento" e nunca via a repetição.
 *
 * Esta rotina roda na abertura do app (com throttle), cria os horários
 * futuros e avança o cursor `proxima_geracao`. Regras de segurança:
 *  - nunca cria horário no passado (ocorrências vencidas são puladas);
 *  - nunca cria duplicado (confere horários já existentes antes de inserir);
 *  - nunca invade horário ocupado (mesma regra de conflito do formulário);
 *  - respeita `data_fim` e limita a janela a 60 dias por execução;
 *  - idempotente: rodar duas vezes não duplica nada.
 *
 * A lógica de datas/conflitos vive em `recorrencias-logica.ts` (pura e
 * testável sem rede/banco).
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  JANELA_DIAS,
  MAX_CRIACOES,
  gerarDatasPendentes,
  haConflito,
  proximaData,
  type HorarioExistente,
} from "@/lib/recorrencias-logica";
import { addDays, format, parseISO } from "date-fns";

const THROTTLE_MS = 15 * 60 * 1000;
const CHAVE_THROTTLE = "mf_recorrencias_ultima_geracao";

/** Payload de inserção gerado a partir do schema (evita casts). */
type NovoAgendamento = Database["public"]["Tables"]["agendamentos"]["Insert"];

type RecorrenciaLinha = {
  id: string;
  cliente_id: string | null;
  servico_id: string | null;
  frequencia: string;
  intervalo_dias: number | null;
  hora: string;
  duracao_min: number;
  valor: number | null;
  custo: number | null;
  observacoes: string | null;
  data_inicio: string;
  data_fim: string | null;
  proxima_geracao: string | null;
};

function lerUltimaGeracao(): number {
  try {
    return Number(localStorage.getItem(CHAVE_THROTTLE) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function gravarUltimaGeracao(): void {
  try {
    localStorage.setItem(CHAVE_THROTTLE, String(Date.now()));
  } catch {
    /* armazenamento indisponível — segue sem throttle */
  }
}

export type ResultadoRecorrencias = { criadas: number; recorrencias: number };

/**
 * Cria os próximos agendamentos de todas as recorrências ativas.
 * Nunca lança exceção: é uma rotina de conveniência que roda junto com a
 * geração de notificações na abertura do app.
 */
export async function gerarRecorrenciasPendentes(forcar = false): Promise<ResultadoRecorrencias> {
  const vazio: ResultadoRecorrencias = { criadas: 0, recorrencias: 0 };
  try {
    if (!forcar && Date.now() - lerUltimaGeracao() < THROTTLE_MS) return vazio;
    gravarUltimaGeracao();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return vazio;

    const hoje = new Date();
    const hojeStr = format(hoje, "yyyy-MM-dd");
    const janelaFim = addDays(hoje, JANELA_DIAS);
    const janelaFimStr = format(janelaFim, "yyyy-MM-dd");

    const [recsResult, agsResult] = await Promise.all([
      supabase
        .from("recorrencias")
        .select(
          "id, cliente_id, servico_id, frequencia, intervalo_dias, hora, duracao_min, valor, custo, observacoes, data_inicio, data_fim, proxima_geracao",
        )
        .eq("ativo", true)
        .not("proxima_geracao", "is", null)
        .lte("proxima_geracao", hojeStr)
        .limit(50),
      supabase
        .from("agendamentos")
        .select("data_hora, duracao_min")
        .gte("data_hora", `${hojeStr}T00:00:00`)
        .lte("data_hora", `${janelaFimStr}T23:59:59`)
        .neq("status", "cancelado")
        .limit(2000),
    ]);

    if (recsResult.error) {
      console.warn("[Recorrências] Falha ao listar:", recsResult.error.message);
      return vazio;
    }

    const recorrencias = (recsResult.data ?? []) as RecorrenciaLinha[];
    if (recorrencias.length === 0) return vazio;

    const existentes: HorarioExistente[] = (agsResult.data ?? []) as HorarioExistente[];
    const novos: NovoAgendamento[] = [];
    let processadas = 0;
    let limiteAtingido = false;

    for (const rec of recorrencias) {
      if (limiteAtingido) break;
      if (!rec.cliente_id || !rec.servico_id || !rec.proxima_geracao) continue;

      // Sempre partimos do cursor; `gerarDatasPendentes` pula o que já passou
      // e corta em data_fim/janela.
      const limiteRec =
        rec.data_fim && parseISO(rec.data_fim) < janelaFim ? parseISO(rec.data_fim) : janelaFim;
      const datas = gerarDatasPendentes({
        proxima: rec.proxima_geracao,
        hoje,
        ate: limiteRec,
        dataFim: rec.data_fim,
        frequencia: rec.frequencia,
        intervaloDias: rec.intervalo_dias,
      });

      let ultimaConsiderada: string | null = null;
      for (const dia of datas) {
        // Se bateu o teto de criações, paramos ANTES de marcar a data:
        // o cursor fica parado e a próxima execução continua dali.
        if (novos.length >= MAX_CRIACOES) {
          limiteAtingido = true;
          break;
        }
        const inicio = new Date(`${dia}T${rec.hora}`);
        if (Number.isNaN(inicio.getTime())) continue;
        ultimaConsiderada = dia;
        if (haConflito(existentes, inicio, rec.duracao_min)) continue;

        novos.push({
          user_id: user.id,
          cliente_id: rec.cliente_id,
          servico_id: rec.servico_id,
          data_hora: inicio.toISOString(),
          duracao_min: rec.duracao_min,
          valor: Number(rec.valor ?? 0),
          custo: Number(rec.custo ?? 0),
          status: "agendado",
          pagamento: "pendente",
          observacoes: rec.observacoes,
        });
        // Considera o horário criado como ocupado para as demais desta execução.
        existentes.push({ data_hora: inicio.toISOString(), duracao_min: rec.duracao_min });
      }

      if (ultimaConsiderada === null && limiteAtingido) {
        // Não chegamos a olhar nenhuma data desta recorrência: não mexemos
        // no cursor para não pular nenhuma ocorrência.
        break;
      }

      // Avança o cursor: próxima data depois da última considerada.
      const base = ultimaConsiderada ? parseISO(ultimaConsiderada) : parseISO(rec.proxima_geracao);
      const proxima = format(proximaData(base, rec.frequencia, rec.intervalo_dias), "yyyy-MM-dd");
      const vencida = !!rec.data_fim && proxima > rec.data_fim;
      const { error } = await supabase
        .from("recorrencias")
        .update({ proxima_geracao: proxima, ativo: !vencida })
        .eq("id", rec.id);
      if (error) console.warn("[Recorrências] Falha ao avançar cursor:", error.message);
      processadas++;
    }

    // Insere em lotes pequenos (limite de linhas por requisição do PostgREST)
    let criadas = 0;
    for (let i = 0; i < novos.length; i += 50) {
      const lote = novos.slice(i, i + 50);
      const { error } = await supabase.from("agendamentos").insert(lote);
      if (error) {
        console.warn("[Recorrências] Falha ao inserir:", error.message);
        break;
      }
      criadas += lote.length;
    }

    return { criadas, recorrencias: processadas };
  } catch (e) {
    console.warn("[Recorrências] Geração ignorada:", e instanceof Error ? e.message : e);
    return { criadas: 0, recorrencias: 0 };
  }
}
