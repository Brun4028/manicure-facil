/**
 * Lógica pura das recorrências de agendamento.
 *
 * Separada do módulo que fala com o Supabase de propósito: estas funções não
 * tocam em rede nem em banco, o que permite testá-las isoladamente
 * (datas, frequências, janelas e conflitos de horário).
 */

/** Frequências aceitas pela coluna `recorrencias.frequencia` (CHECK no banco). */
export const FREQUENCIAS = ["semanal", "quinzenal", "mensal", "a_cada_x_dias"] as const;

/** Dias cobertos por uma única execução do gerador. */
export const JANELA_DIAS = 60;

/** Teto de ocorrências consideradas por recorrência. */
export const MAX_POR_RECORRENCIA = 60;

/** Teto de agendamentos criados por execução (evita inundar a agenda). */
export const MAX_CRIACOES = 200;

/** Duração mínima considerada ao calcular conflito (mesmo piso do formulário). */
const DURACAO_MINIMA_MS = 15 * 60_000;

/** Próxima data de uma recorrência, conforme a frequência. */
export function proximaData(base: Date, frequencia: string, intervaloDias?: number | null): Date {
  switch (frequencia) {
    case "semanal":
      return addDaysSafe(base, 7);
    case "quinzenal":
      return addDaysSafe(base, 14);
    case "mensal":
      return addMonthsSafe(base, 1);
    case "a_cada_x_dias":
      return addDaysSafe(base, Math.max(1, Number(intervaloDias ?? 15)));
    default:
      return addDaysSafe(base, 7);
  }
}

/**
 * Datas (yyyy-MM-dd) que ainda precisam ser criadas, partindo de `proxima`
 * e parando em `data_fim` ou na janela `ate` (o que vier primeiro).
 * Datas anteriores a `hoje` são puladas — não fazemos backfill de passado.
 */
export function gerarDatasPendentes(params: {
  proxima: string;
  hoje: Date;
  ate: Date;
  dataFim?: string | null;
  frequencia: string;
  intervaloDias?: number | null;
}): string[] {
  const datas: string[] = [];
  const limiteFim = params.dataFim ? parseIsoSafe(params.dataFim) : null;
  if (!limiteFim && params.dataFim) return datas;
  const hojeDia = iso(params.hoje);
  let atual = parseIsoSafe(params.proxima);
  if (!atual) return datas;

  for (let i = 0; i < MAX_POR_RECORRENCIA; i++) {
    if (limiteFim && atual > limiteFim) break;
    if (atual > params.ate) break;
    const dia = iso(atual);
    if (dia >= hojeDia && !datas.includes(dia)) datas.push(dia);
    atual = proximaData(atual, params.frequencia, params.intervaloDias);
  }
  return datas;
}

export type HorarioExistente = { data_hora: string; duracao_min: number };

/**
 * Existe sobreposição entre o horário proposto e algum já ocupado?
 * Usa a mesma regra do formulário: dois intervalos se cruzam quando
 * `início < fimDoOutro && outroInício < fim`.
 */
export function haConflito(
  existentes: HorarioExistente[],
  inicio: Date,
  duracaoMin: number,
): boolean {
  const ini = inicio.getTime();
  if (Number.isNaN(ini)) return false;
  const fim = ini + Math.max(DURACAO_MINIMA_MS, toMs(duracaoMin));
  return existentes.some((a) => {
    const outro = new Date(a.data_hora).getTime();
    if (Number.isNaN(outro)) return false;
    const outroFim = outro + Math.max(DURACAO_MINIMA_MS, toMs(a.duracao_min));
    return ini < outroFim && outro < fim;
  });
}

// ─── helpers locais (sem dependência externa: mantêm o módulo testável) ─────
function toMs(minutos: number): number {
  const m = Number(minutos);
  return (Number.isFinite(m) && m > 0 ? m : 60) * 60_000;
}

function iso(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function parseIsoSafe(valor: string): Date | null {
  const d = new Date(`${valor}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDaysSafe(base: Date, dias: number): Date {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + dias);
  return d;
}

/** Avança mantendo o dia do mês (31/jan + 1 mês → 28/fev), como faz o calendário. */
function addMonthsSafe(base: Date, meses: number): Date {
  const d = new Date(base.getTime());
  const diaOriginal = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + meses);
  const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(diaOriginal, ultimoDia));
  return d;
}
