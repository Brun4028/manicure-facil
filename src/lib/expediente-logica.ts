/**
 * Expediente — lógica PURA de geração de horários disponíveis.
 *
 * Antes desta lógica existir, a agenda interna usava 08:00–18:00 fixo e a
 * página pública também, ignorando o que a manicure cadastrava. Agora os
 * dois lugares usam estas funções, que consideram:
 *   - expediente por dia da semana (horarios_trabalho)
 *   - intervalos/pausas (expediente_intervalos)
 *   - bloqueios/feriados (bloqueios_agenda)
 *   - duração do serviço (um slot só é válido se o serviço CABE no horário)
 *   - agendamentos já ocupados (conflito de sobreposição)
 *
 * Sem rede e sem bibliotecas externas — testável isoladamente.
 */

export type HorarioTrabalho = {
  /** 0=domingo ... 6=sábado */
  dia_semana: number;
  /** "HH:mm" */
  hora_inicio: string;
  /** "HH:mm" */
  hora_fim: string;
  ativo: boolean;
};

export type IntervaloExpediente = {
  dia_semana: number;
  nome: string;
  hora_inicio: string;
  hora_fim: string;
};

export type BloqueioAgenda = {
  /** "YYYY-MM-DD" */
  data_inicio: string;
  /** "YYYY-MM-DD" ou null (bloqueio de dia único) */
  data_fim: string | null;
  /** "HH:mm" ou null (null = dia inteiro) */
  hora_inicio: string | null;
  hora_fim: string | null;
};

export type AgendamentoOcupado = {
  /** ISO completo */
  data_hora: string;
  duracao_min: number;
};

export type EntradaSlot = {
  /** "HH:mm" */
  hora: string;
  disponivel: boolean;
  /** motivo legível quando indisponível (ex.: "Fora do expediente") */
  motivo?: string;
};

export type GerarSlotsArgs = {
  /** data do slot (Date local) */
  data: Date;
  duracaoMin: number;
  expediente: HorarioTrabalho[];
  intervalos: IntervaloExpediente[];
  bloqueios: BloqueioAgenda[];
  ocupados: AgendamentoOcupado[];
  /** intervalo entre slots em minutos (padrão 30) */
  passoMin?: number;
  /** "HH:mm" — janela padrão quando o dia NÃO tem expediente cadastrado */
  janelaPadraoInicio?: string;
  janelaPadraoFim?: string;
  /** "HH:mm" — slots antes disso são descartados (agenda interna: agora) */
  ignoraAntesDe?: string;
};

export function paraMinutos(hhmm: string): number {
  const [h, m] = (hhmm ?? "").split(":").map((n) => Number(n));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

export function paraHHMM(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" no fuso local (sem depender de biblioteca). */
export function dataLocalKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function minutosDoDia(iso: string): number {
  // Converte ISO (com timezone) para minutos desde 00:00 no fuso LOCAL.
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function hhmmParaDataLocal(data: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(data);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * Gera os slots de um dia. Um slot está disponível quando:
 *  - o serviço cabe inteiro dentro do expediente do dia;
 *  - não cai dentro de intervalo/pausa;
 *  - não cai dentro de bloqueio (dia inteiro ou janela);
 *  - não sobrepõe agendamento existente.
 *
 * Se o dia não tem expediente cadastrado, usa a janela padrão (08:00–18:00).
 */
export function gerarSlots(args: GerarSlotsArgs): EntradaSlot[] {
  const {
    data,
    duracaoMin,
    expediente,
    intervalos,
    bloqueios,
    ocupados,
    passoMin = 30,
    janelaPadraoInicio = "08:00",
    janelaPadraoFim = "18:00",
    ignoraAntesDe,
  } = args;

  const diaSemana = data.getDay();
  const diaKey = dataLocalKey(data);

  // Se a manicure cadastrou expediente, dias SEM expediente ativo são dias
  // FECHADOS (sem slots). A janela padrão só vale quando não há NENHUM
  // expediente cadastrado (preserva o comportamento antigo de contas novas).
  const temExpediente = expediente.some((h) => h.ativo);
  const horarioDia = expediente.find((h) => h.dia_semana === diaSemana && h.ativo);
  if (temExpediente && !horarioDia) return [];

  const inicio = horarioDia?.hora_inicio ?? janelaPadraoInicio;
  const fim = horarioDia?.hora_fim ?? janelaPadraoFim;

  const iniMin = paraMinutos(inicio);
  const fimMin = paraMinutos(fim);
  const dur = Math.max(1, Number(duracaoMin) || 30);
  const passo = Math.max(5, Number(passoMin) || 30);

  if (!Number.isFinite(iniMin) || !Number.isFinite(fimMin) || fimMin <= iniMin) return [];

  const intervalosDia = intervalos.filter((i) => i.dia_semana === diaSemana);
  const bloqueiosDoDia = bloqueios.filter(
    (b) => diaKey >= b.data_inicio && diaKey <= (b.data_fim ?? b.data_inicio),
  );
  const diaInteiroBloqueado = bloqueiosDoDia.some((b) => b.hora_inicio === null);
  if (diaInteiroBloqueado) return [];

  const slots: EntradaSlot[] = [];

  for (let start = iniMin; start + dur <= fimMin; start += passo) {
    const fimSlot = start + dur;
    const hora = paraHHMM(start);
    const iniData = hhmmParaDataLocal(data, hora);
    const fimData = new Date(iniData.getTime() + dur * 60_000);

    if (ignoraAntesDe && start < paraMinutos(ignoraAntesDe)) continue;

    let motivo: string | null = null;

    // intervalos/pausas (ex.: almoço)
    for (const iv of intervalosDia) {
      const ivIni = paraMinutos(iv.hora_inicio);
      const ivFim = paraMinutos(iv.hora_fim);
      if (Number.isFinite(ivIni) && Number.isFinite(ivFim) && start < ivFim && fimSlot > ivIni) {
        motivo = iv.nome ? `Intervalo: ${iv.nome}` : "Intervalo/pausa";
        break;
      }
    }

    // bloqueios (janela de hora dentro do dia)
    if (!motivo) {
      for (const b of bloqueiosDoDia) {
        if (b.hora_inicio === null) continue;
        const bIni = paraMinutos(b.hora_inicio);
        const bFim = paraMinutos(b.hora_fim ?? b.hora_inicio);
        if (start < bFim && fimSlot > bIni) {
          motivo = "Bloqueado pela profissional";
          break;
        }
      }
    }

    // conflito com agendamento existente
    if (!motivo) {
      for (const ag of ocupados) {
        const agIni = new Date(ag.data_hora).getTime();
        const agFim = agIni + Math.max(15, ag.duracao_min || 60) * 60_000;
        if (iniData.getTime() < agFim && agIni < fimData.getTime()) {
          motivo = "Horário ocupado";
          break;
        }
      }
    }

    slots.push({ hora, disponivel: !motivo, motivo: motivo ?? undefined });
  }

  return slots;
}

/**
 * Verifica se um horário específico é permitido e, se não for, explica por quê.
 * Usado pela agenda interna para exibir o motivo antes de bloquear — e para
 * permitir salvar mesmo assim quando a manicure autoriza explicitamente.
 */
export function avaliarHorario(args: {
  data: Date;
  hora: string;
  duracaoMin: number;
  expediente: HorarioTrabalho[];
  intervalos: IntervaloExpediente[];
  bloqueios: BloqueioAgenda[];
  ocupados: AgendamentoOcupado[];
  /** id de um agendamento sendo editado (ignora a si mesmo no conflito) */
  ignorarAgendamentoId?: string;
}): { permitido: boolean; motivo: string | null } {
  const {
    data,
    hora,
    duracaoMin,
    expediente,
    intervalos,
    bloqueios,
    ocupados,
    ignorarAgendamentoId,
  } = args;

  const diaSemana = data.getDay();
  const diaKey = dataLocalKey(data);
  const dur = Math.max(1, Number(duracaoMin) || 30);
  const start = paraMinutos(hora);
  if (!Number.isFinite(start)) return { permitido: false, motivo: "Horário inválido" };
  const fimSlot = start + dur;

  const horarioDia = expediente.find((h) => h.dia_semana === diaSemana && h.ativo);
  const temExpediente = expediente.some((h) => h.ativo);
  if (temExpediente && !horarioDia) {
    return {
      permitido: false,
      motivo: `${nomeDia(diaSemana)} é dia fechado no seu expediente`,
    };
  }
  if (!horarioDia) {
    // sem NENHUM expediente cadastrado → não restringe (comportamento antigo)
    // mas ainda respeita bloqueios abaixo
  } else {
    const ini = paraMinutos(horarioDia.hora_inicio);
    const fim = paraMinutos(horarioDia.hora_fim);
    if (start < ini || fimSlot > fim) {
      return {
        permitido: false,
        motivo: `Fora do expediente de ${nomeDia(diaSemana)} (${horarioDia.hora_inicio} às ${horarioDia.hora_fim})`,
      };
    }
  }

  for (const iv of intervalos.filter((i) => i.dia_semana === diaSemana)) {
    const ivIni = paraMinutos(iv.hora_inicio);
    const ivFim = paraMinutos(iv.hora_fim);
    if (Number.isFinite(ivIni) && Number.isFinite(ivFim) && start < ivFim && fimSlot > ivIni) {
      return {
        permitido: false,
        motivo: `Cai em intervalo/pausa (${iv.nome || "intervalo"}: ${iv.hora_inicio} às ${iv.hora_fim})`,
      };
    }
  }

  for (const b of bloqueios) {
    if (diaKey < b.data_inicio || diaKey > (b.data_fim ?? b.data_inicio)) continue;
    if (b.hora_inicio === null) {
      return { permitido: false, motivo: "Dia totalmente bloqueado (folga/feriado)" };
    }
    const bIni = paraMinutos(b.hora_inicio);
    const bFim = paraMinutos(b.hora_fim ?? b.hora_inicio);
    if (start < bFim && fimSlot > bIni) {
      return {
        permitido: false,
        motivo: `Dentro de um bloqueio (${b.hora_inicio} às ${b.hora_fim ?? b.hora_inicio})`,
      };
    }
  }

  const iniData = hhmmParaDataLocal(data, hora);
  const fimData = new Date(iniData.getTime() + dur * 60_000);
  for (const ag of ocupados) {
    if (ignorarAgendamentoId && agAgendamentoIdEquals(ag, ignorarAgendamentoId)) continue;
    const agIni = new Date(ag.data_hora).getTime();
    const agFim = agIni + Math.max(15, ag.duracao_min || 60) * 60_000;
    if (iniData.getTime() < agFim && agIni < fimData.getTime()) {
      return { permitido: false, motivo: "Conflito com outro agendamento" };
    }
  }

  return { permitido: true, motivo: null };
}

// AgendamentoOcupado não carrega id no tipo base; a agenda interna injeta
// `_id` dinamicamente. Compatibilizamos sem quebrar quem não informa.
type ComId = AgendamentoOcupado & { id?: string };
function agAgendamentoIdEquals(ag: AgendamentoOcupado, id: string): boolean {
  return (ag as ComId).id === id;
}

export function nomeDia(dia: number): string {
  return (
    ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][dia] ?? `dia ${dia}`
  );
}
