/**
 * Lembretes WhatsApp — geração e controle dos contatos pendentes.
 *
 * Central de organização do salão: reúne os contatos que a manicure PRECISA
 * fazer (agendamentos próximos, confirmados, aniversariantes e clientes
 * inativas) e guarda o estado de cada um (pendente / resolvido / adiado).
 *
 * Princípios:
 * - NÃO envia mensagem nenhuma. Só organiza e prepara o texto; o envio é
 *   manual, pela manicure, pelo botão "Abrir WhatsApp".
 * - Idempotente: cada lembrete tem uma `chave` única por usuário. Rodar a
 *   geração N vezes não duplica — usa upsert pela chave e NUNCA reabre um
 *   lembrete já resolvido (a menos que o dado de origem mude de verdade).
 * - Adiado: volta a aparecer quando `adiado_ate` vence.
 *
 * Roda na abertura da aba (com throttle) e pode ser chamada à vontade.
 */

import { supabase } from "@/integrations/supabase/client";
import { mensagens, numeroWhatsApp } from "@/lib/whatsapp";
import { format, startOfDay, endOfDay, subDays } from "date-fns";

const CHAVE_THROTTLE = "mf_lembretes_ultima_geracao";
const THROTTLE_MS = 5 * 60 * 1000;
/** clientes inativas: sem visita há N dias */
const DIAS_INATIVIDADE = 60;
/** janela de "agendamentos próximos" (dias) */
const JANELA_PROXIMOS_DIAS = 3;
/** no máximo X lembretes de inatividade por geração (evita encher a lista) */
const MAX_INATIVIDADE = 10;
const MAX_POR_GERACAO = 50;

export type TipoLembrete =
  | "agendamento_proximo"
  | "agendamento_confirmado"
  | "aniversario"
  | "inatividade";

export type StatusLembrete = "pendente" | "resolvido" | "adiado";

export type Lembrete = {
  id: string;
  chave: string;
  tipo: TipoLembrete;
  cliente_id: string | null;
  agendamento_id: string | null;
  cliente_nome: string;
  telefone: string | null;
  motivo: string;
  mensagem: string;
  data_referencia: string | null;
  status: StatusLembrete;
  adiado_ate: string | null;
  resolvido_em: string | null;
  created_at: string;
  updated_at: string;
};

type CandidatoLembrete = Omit<
  Lembrete,
  "id" | "status" | "adiado_ate" | "resolvido_em" | "created_at" | "updated_at"
> & { user_id: string };

function lerThrottle(): number {
  try {
    return Number(localStorage.getItem(CHAVE_THROTTLE) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function gravarThrottle(): void {
  try {
    localStorage.setItem(CHAVE_THROTTLE, String(Date.now()));
  } catch {
    /* modo privado — segue sem throttle */
  }
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export type ResultadoLembretes = {
  criados: number;
  reativados: number;
};

/**
 * Gera/atualiza os lembretes do momento. Nunca lança exceção.
 */
export async function gerarLembretes(forcar = false): Promise<ResultadoLembretes> {
  const vazio: ResultadoLembretes = { criados: 0, reativados: 0 };
  try {
    if (!forcar && Date.now() - lerThrottle() < THROTTLE_MS) return vazio;
    gravarThrottle();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return vazio;

    const [configR, clientesR, futurosR, historicoR, existentesR] = await Promise.all([
      supabase
        .from("configuracoes")
        .select("empresa_nome, lembrete_ativo, lembrete_antecipacao_min")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("clientes")
        .select("id, nome, telefone, data_nascimento")
        .not("nome", "is", null)
        .limit(3000),
      supabase
        .from("agendamentos")
        .select("id, cliente_id, data_hora, status, clientes(nome, telefone), servicos(nome)")
        .gte("data_hora", new Date().toISOString())
        .lte("data_hora", endOfDay(addDays(new Date(), JANELA_PROXIMOS_DIAS)).toISOString())
        .in("status", ["agendado", "confirmado"])
        .order("data_hora", { ascending: true })
        .limit(300),
      supabase
        .from("agendamentos")
        .select("cliente_id, data_hora")
        .eq("status", "concluido")
        .gte("data_hora", subDays(new Date(), DIAS_INATIVIDADE).toISOString())
        .order("data_hora", { ascending: false })
        .limit(3000),
      supabase
        .from("lembretes_whatsapp")
        .select("chave, status, adiado_ate")
        .eq("user_id", user.id)
        .limit(2000),
    ]);

    const salao = configR.data?.empresa_nome ?? null;
    const lembreteAtivo = configR.data?.lembrete_ativo ?? true;
    const janelaMin = Number(configR.data?.lembrete_antecipacao_min ?? 60);

    const clientes = clientesR.data ?? [];
    const existentes = new Map(
      (existentesR.data ?? []).map((e) => [
        e.chave,
        { status: e.status, adiado_ate: e.adiado_ate },
      ]),
    );

    const candidatos: CandidatoLembrete[] = [];
    const agora = Date.now();

    // ── 1 & 2. Agendamentos próximos (agendado) e confirmados ──────────────
    if (lembreteAtivo) {
      for (const ag of futurosR.data ?? []) {
        const nome = ag.clientes?.nome ?? "cliente";
        const telefone = ag.clientes?.telefone ?? null;
        const servico = ag.servicos?.nome ?? null;
        const ehConfirmado = ag.status === "confirmado";
        const inicio = new Date(ag.data_hora).getTime();

        // agendado: entra na janela configurada; confirmado: entra já que é
        // um contato de "relembrar/consultar" — ambos respeitam a janela.
        const dentroJanela = inicio <= agora + janelaMin * 60_000;
        const tipo: TipoLembrete = ehConfirmado ? "agendamento_confirmado" : "agendamento_proximo";
        // confirmados ficam visíveis até o horário; próximos, idem
        if (!dentroJanela && !ehConfirmado) continue;

        const dados = { cliente: nome, dataHora: ag.data_hora, servico, salao };
        candidatos.push({
          user_id: user.id,
          chave: `agendamento:${ag.id}:${tipo}`,
          tipo,
          cliente_id: ag.cliente_id,
          agendamento_id: ag.id,
          cliente_nome: nome,
          telefone,
          motivo: ehConfirmado
            ? `Confirmar/relembrar horário de ${format(new Date(ag.data_hora), "dd/MM 'às' HH'h'mm")}`
            : `Relembrar horário de ${format(new Date(ag.data_hora), "dd/MM 'às' HH'h'mm")}${servico ? ` (${servico})` : ""}`,
          mensagem: ehConfirmado ? mensagens.confirmacao(dados) : mensagens.lembrete(dados),
          data_referencia: ag.data_hora,
        });
      }
    }

    // ── 3. Aniversariantes do dia ──────────────────────────────────────────
    const hojeDia = pad(new Date().getDate());
    const hojeMes = pad(new Date().getMonth() + 1);
    const hojeKey = format(new Date(), "yyyy-MM");
    for (const c of clientes) {
      if (!c.data_nascimento) continue;
      const nasc = new Date(`${c.data_nascimento}T00:00:00`);
      if (Number.isNaN(nasc.getTime())) continue;
      if (pad(nasc.getDate()) !== hojeDia || pad(nasc.getMonth() + 1) !== hojeMes) continue;

      candidatos.push({
        user_id: user.id,
        chave: `aniv:${c.id}:${hojeKey}`,
        tipo: "aniversario",
        cliente_id: c.id,
        agendamento_id: null,
        cliente_nome: c.nome,
        telefone: c.telefone,
        motivo: `Aniversário hoje — parabenizar`,
        mensagem: mensagens.aniversario({ cliente: c.nome, salao }),
        data_referencia: null,
      });
    }

    // ── 4. Clientes inativas (sem visita há mais de N dias) ────────────────
    const ultimaVisita = new Map<string, number>();
    for (const ag of historicoR.data ?? []) {
      if (!ag.cliente_id) continue;
      const t = new Date(ag.data_hora).getTime();
      if (!Number.isNaN(t) && !ultimaVisita.has(ag.cliente_id)) {
        ultimaVisita.set(ag.cliente_id, t);
      }
    }
    const corte = agora - DIAS_INATIVIDADE * 24 * 60 * 60 * 1000;
    const inativas = clientes
      .filter((c) => {
        const ultima = ultimaVisita.get(c.id);
        return ultima !== undefined && ultima < corte;
      })
      .sort((a, b) => (ultimaVisita.get(b.id) ?? 0) - (ultimaVisita.get(a.id) ?? 0))
      .slice(0, MAX_INATIVIDADE);

    const mesKey = format(new Date(), "yyyy-MM");
    for (const c of inativas) {
      const diasSemVisitar = Math.floor((agora - (ultimaVisita.get(c.id) ?? agora)) / 86_400_000);
      candidatos.push({
        user_id: user.id,
        chave: `reativ:${c.id}:${mesKey}`,
        tipo: "inatividade",
        cliente_id: c.id,
        agendamento_id: null,
        cliente_nome: c.nome,
        telefone: c.telefone,
        motivo: `Sem visita há ${diasSemVisitar} dias — reativar`,
        mensagem: mensagens.reativacao({ cliente: c.nome, salao }),
        data_referencia: null,
      });
    }

    // ── Filtra duplicados desta geração e respeita estados anteriores ──────
    const vistos = new Set<string>();
    const novos: CandidatoLembrete[] = [];
    let reativados = 0;

    for (const c of candidatos.slice(0, MAX_POR_GERACAO)) {
      if (vistos.has(c.chave)) continue;
      vistos.add(c.chave);
      const anterior = existentes.get(c.chave);
      if (anterior?.status === "resolvido") continue; // não reabre
      if (anterior?.status === "adiado" && anterior.adiado_ate) {
        if (new Date(anterior.adiado_ate).getTime() > agora) continue; // ainda adiado
        reativados++; // adiado venceu → volta a ser pendente
      }
      novos.push(c);
    }

    if (novos.length === 0) return { criados: 0, reativados };

    // Upsert pela chave única: não duplica e atualiza texto/motivo quando
    // o dado de origem muda (ex.: horário remarcado).
    const { error } = await supabase.from("lembretes_whatsapp").upsert(novos, {
      onConflict: "user_id,chave",
      ignoreDuplicates: false,
    });
    if (error) {
      console.warn("[Lembretes] Falha ao gravar:", error.message);
      return { criados: 0, reativados };
    }

    return { criados: novos.filter((n) => !existentes.has(n.chave)).length, reativados };
  } catch (e) {
    console.warn("[Lembretes] Geração ignorada:", e instanceof Error ? e.message : e);
    return { criados: 0, reativados: 0 };
  }
}

/** Lista os lembretes (mais recentes primeiro). */
export async function listarLembretes(): Promise<Lembrete[]> {
  const { data, error } = await supabase
    .from("lembretes_whatsapp")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as Lembrete[];
}

/** Conta os que precisam de atenção (pendentes + adiados vencidos). */
export function contarPendentes(lembretes: Lembrete[]): number {
  const agora = Date.now();
  return lembretes.filter(
    (l) =>
      l.status === "pendente" ||
      (l.status === "adiado" && (!l.adiado_ate || new Date(l.adiado_ate).getTime() <= agora)),
  ).length;
}

export async function marcarResolvido(id: string): Promise<void> {
  const { error } = await supabase
    .from("lembretes_whatsapp")
    .update({ status: "resolvido", resolvido_em: new Date().toISOString(), adiado_ate: null })
    .eq("id", id);
  if (error) throw error;
}

export async function reabrirLembrete(id: string): Promise<void> {
  const { error } = await supabase
    .from("lembretes_whatsapp")
    .update({ status: "pendente", resolvido_em: null, adiado_ate: null })
    .eq("id", id);
  if (error) throw error;
}

export async function adiarLembrete(id: string, ate: Date): Promise<void> {
  const { error } = await supabase
    .from("lembretes_whatsapp")
    .update({ status: "adiado", adiado_ate: ate.toISOString() })
    .eq("id", id);
  if (error) throw error;
}

function addDays(d: Date, dias: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + dias);
  return x;
}

/** Telefone válido para WhatsApp? (mesma regra do módulo whatsapp) */
export function telefoneValido(telefone: string | null | undefined): boolean {
  return numeroWhatsApp(telefone) !== null;
}

export const ROTULOS_TIPO: Record<TipoLembrete, string> = {
  agendamento_proximo: "Agendamento próximo",
  agendamento_confirmado: "Agendamento confirmado",
  aniversario: "Aniversário",
  inatividade: "Cliente inativa",
};

/** Início do dia útil — usado para agrupar por data na UI. */
export function diaDoLembrete(l: Lembrete): string {
  const base = l.data_referencia ?? l.created_at;
  return format(startOfDay(new Date(base)), "yyyy-MM-dd");
}
