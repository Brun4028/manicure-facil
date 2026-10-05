/**
 * Gerador de notificações internas (o "sino" da barra superior).
 *
 * Antes deste arquivo existir, nada no sistema inseria linhas em
 * `notificacoes_internas` — o sino ficava permanentemente vazio e os switches
 * de "lembrete" em Configurações não faziam efeito algum.
 *
 * O que é gerado:
 *  1. Resumo do dia — 1 notificação por dia com os horários de hoje;
 *  2. Lembrete de horário — quando o atendimento está dentro da janela
 *     configurada em Configurações (`lembrete_antecipacao_min`);
 *  3. Aniversário — clientes que fazem aniversário hoje;
 *  4. Reativação — clientes que não voltam há mais de 60 dias.
 *
 * Tudo é idempotente (não duplica) e com throttle (no máximo 1 execução a
 * cada 5 minutos), então pode ser chamado à vontade na abertura do app.
 * Sem cron/pg_cron obrigatório: funciona em qualquer hospedagem.
 */
import { supabase } from "@/integrations/supabase/client";
import { linkWhatsApp, mensagens } from "@/lib/whatsapp";
import { format, startOfDay, subDays } from "date-fns";

type NotificacaoNova = {
  user_id: string;
  titulo: string;
  mensagem: string;
  tipo: "lembrete" | "aniversario" | "info";
  acao_texto: string | null;
  acao_link: string | null;
  entidade: string;
  entidade_id: string;
};

const CHAVE_THROTTLE = "mf_notificacoes_ultima_geracao";
const THROTTLE_MS = 5 * 60 * 1000;
const MAX_POR_GERACAO = 20;
const DIAS_SEM_VISITA = 60;

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
    /* modo privado / storage indisponível — segue sem throttle */
  }
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

type ResultadoGeracao = {
  /** Quantidade de notificações criadas nesta execução. */
  criadas: number;
  /** Preferência "Som de notificação" de Configurações. */
  som: boolean;
};

/**
 * Gera as notificações do momento. Nunca lança exceção: é uma funcionalidade
 * de conforto e não pode quebrar a abertura da barra de notificações.
 */
export async function gerarNotificacoes(forcar = false): Promise<ResultadoGeracao> {
  const vazio: ResultadoGeracao = { criadas: 0, som: true };
  try {
    if (!forcar && Date.now() - lerUltimaGeracao() < THROTTLE_MS) return vazio;
    gravarUltimaGeracao();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return vazio;

    const [configResult, clientesResult, agendaHojeResult, historicoResult, existentesResult] =
      await Promise.all([
        supabase
          .from("configuracoes")
          .select(
            "lembrete_ativo, lembrete_whatsapp, lembrete_antecipacao_min, notificacao_sonora, empresa_nome",
          )
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("clientes")
          .select("id, nome, data_nascimento")
          .not("nome", "is", null)
          .limit(3000),
        supabase
          .from("agendamentos")
          .select("id, cliente_id, data_hora, clientes(nome, telefone), servicos(nome)")
          .gte("data_hora", startOfDay(new Date()).toISOString())
          .in("status", ["agendado", "confirmado"])
          .order("data_hora", { ascending: true })
          .limit(200),
        supabase
          .from("agendamentos")
          .select("cliente_id, data_hora")
          .eq("status", "concluido")
          .gte("data_hora", subDays(new Date(), DIAS_SEM_VISITA).toISOString())
          .order("data_hora", { ascending: false })
          .limit(3000),
        supabase
          .from("notificacoes_internas")
          .select("tipo, entidade, entidade_id")
          .gte("created_at", subDays(new Date(), 31).toISOString())
          .limit(500),
      ]);

    const config = configResult.data;
    const lembreteAtivo = config?.lembrete_ativo ?? true;
    const comWhatsapp = config?.lembrete_whatsapp ?? true;
    const somAtivo = config?.notificacao_sonora ?? true;
    const janelaMin = Number(config?.lembrete_antecipacao_min ?? 60);
    const salao = config?.empresa_nome ?? null;

    const jaExistentes = new Set(
      (existentesResult.data ?? []).map((n) => `${n.tipo}|${n.entidade}|${n.entidade_id}`),
    );

    const candidatas: NotificacaoNova[] = [];
    const hojeKey = format(new Date(), "yyyy-MM-dd");
    const mesKey = format(new Date(), "yyyy-MM");
    const agora = Date.now();

    // ── 1. Lembrete de cada horário dentro da janela configurada ──────────
    const agsHoje = agendaHojeResult.data ?? [];
    if (lembreteAtivo) {
      const limite = agora + janelaMin * 60 * 1000;
      for (const ag of agsHoje) {
        const inicio = new Date(ag.data_hora).getTime();
        if (Number.isNaN(inicio) || inicio < agora || inicio > limite) continue;
        const nome = ag.clientes?.nome ?? "cliente";
        const servico = ag.servicos?.nome ?? null;
        const telefone = ag.clientes?.telefone ?? null;
        const dados = { cliente: nome, dataHora: ag.data_hora, servico, salao };
        candidatas.push({
          user_id: user.id,
          titulo: "Horário chegando",
          mensagem:
            `${format(new Date(ag.data_hora), "HH'h'mm")} — ${nome}` +
            (servico ? ` (${servico})` : "") +
            ` daqui a ${janelaMin} min. Deixe tudo pronto! 💅`,
          tipo: "lembrete",
          acao_texto: comWhatsapp ? "Avisar no WhatsApp" : "Ver agenda",
          // Com o switch "Notificação WhatsApp" ligado, a ação já abre a
          // conversa com o lembrete escrito — é só apertar enviar.
          acao_link:
            (comWhatsapp ? linkWhatsApp(telefone, mensagens.lembrete(dados)) : null) ??
            "/agendamentos",
          entidade: "agendamento",
          entidade_id: ag.id,
        });
      }
    }

    // ── 2. Resumo da agenda de hoje (1 por dia) ───────────────────────────
    if (agsHoje.length > 0) {
      const lista = agsHoje
        .slice(0, 4)
        .map((ag) => `${format(new Date(ag.data_hora), "HH'h'mm")} ${ag.clientes?.nome ?? ""}`)
        .join(" • ");
      const resto = agsHoje.length > 4 ? ` e mais ${agsHoje.length - 4}` : "";
      candidatas.push({
        user_id: user.id,
        titulo: `Agenda de hoje: ${agsHoje.length} horário${agsHoje.length > 1 ? "s" : ""}`,
        mensagem: `${lista}${resto}`,
        tipo: "lembrete",
        acao_texto: "Abrir agenda",
        acao_link: "/agendamentos",
        entidade: "agenda_dia",
        entidade_id: `dia#${hojeKey}`,
      });
    }

    // ── 3. Aniversariantes do dia ─────────────────────────────────────────
    const hojeDia = format(new Date(), "dd");
    const hojeMes = format(new Date(), "MM");
    for (const cliente of clientesResult.data ?? []) {
      if (!cliente.data_nascimento) continue;
      const nascimento = new Date(`${cliente.data_nascimento}T00:00:00`);
      if (Number.isNaN(nascimento.getTime())) continue;
      if (pad(nascimento.getDate()) !== hojeDia || pad(nascimento.getMonth() + 1) !== hojeMes) {
        continue;
      }
      candidatas.push({
        user_id: user.id,
        titulo: `🎂 Aniversário: ${cliente.nome}`,
        mensagem:
          "É aniversário hoje! Enviar uma mensagem já com uma surpresinha é a forma mais fácil de fidelizar. 💜",
        tipo: "aniversario",
        acao_texto: "Enviar parabéns",
        acao_link: "/clientes",
        entidade: "cliente",
        entidade_id: `aniv#${cliente.id}#${mesKey}`,
      });
    }

    // ── 4. Clientes que não voltam há mais de 60 dias ─────────────────────
    const ultimaVisita = new Map<string, number>();
    for (const ag of historicoResult.data ?? []) {
      if (!ag.cliente_id) continue;
      const t = new Date(ag.data_hora).getTime();
      if (!Number.isNaN(t) && !ultimaVisita.has(ag.cliente_id)) {
        ultimaVisita.set(ag.cliente_id, t); // ordenado do mais recente
      }
    }
    const cutoff = agora - DIAS_SEM_VISITA * 24 * 60 * 60 * 1000;
    const sumidos = (clientesResult.data ?? []).filter((c) => {
      const ultima = ultimaVisita.get(c.id);
      return ultima !== undefined && ultima < cutoff;
    });
    for (const cliente of sumidos.slice(0, 3)) {
      candidatas.push({
        user_id: user.id,
        titulo: `${cliente.nome} está sumida`,
        mensagem: `Não volta há mais de ${DIAS_SEM_VISITA} dias. Uma mensagem carinhosa costuma trazer ela de volta. 💅`,
        tipo: "info",
        acao_texto: "Ver cliente",
        acao_link: "/clientes",
        entidade: "cliente",
        entidade_id: `reativ#${cliente.id}#${mesKey}`,
      });
    }

    // ── Filtra duplicadas e insere ────────────────────────────────────────
    const novas = candidatas
      .filter((c) => !jaExistentes.has(`${c.tipo}|${c.entidade}|${c.entidade_id}`))
      .slice(0, MAX_POR_GERACAO);

    if (novas.length === 0) return { criadas: 0, som: somAtivo };

    const { error } = await supabase.from("notificacoes_internas").insert(novas);
    if (error) {
      console.warn("[Notificações] Falha ao inserir:", error.message);
      return { criadas: 0, som: somAtivo };
    }
    return { criadas: novas.length, som: somAtivo };
  } catch (e) {
    console.warn("[Notificações] Geração ignorada:", e instanceof Error ? e.message : e);
    return { criadas: 0, som: true };
  }
}

/**
 * Bipe curto para chamar a atenção quando nasce um lembrete.
 * Respeita a preferência "Som de notificação" e nunca derruba a interface
 * (browsers podem exigir um gesto do usuário antes de liberar o áudio).
 */
export function tocarNotificacao(): void {
  try {
    const Contexto =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Contexto) return;
    const ctx = new Contexto();
    const agora = ctx.currentTime;
    [880, 1174.66].forEach((frequencia, i) => {
      const osc = ctx.createOscillator();
      const ganho = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequencia;
      ganho.gain.setValueAtTime(0.0001, agora + i * 0.16);
      ganho.gain.exponentialRampToValueAtTime(0.15, agora + i * 0.16 + 0.02);
      ganho.gain.exponentialRampToValueAtTime(0.0001, agora + i * 0.16 + 0.15);
      osc.connect(ganho);
      ganho.connect(ctx.destination);
      osc.start(agora + i * 0.16);
      osc.stop(agora + i * 0.16 + 0.16);
    });
    window.setTimeout(() => ctx.close().catch(() => undefined), 800);
  } catch {
    /* áudio bloqueado pelo navegador — segue sem som */
  }
}
