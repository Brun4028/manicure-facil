/**
 * Regras de cupons/promoções — lógica PURA (sem rede, sem banco).
 *
 * Motivo da existência: a aplicação de desconto precisa ser CONSISTENTE em
 * todas as telas (PDV, agendamento público, agendamento interno) e a
 * validação NÃO pode depender só do navegador. Esta lógica é compartilhada:
 * o servidor usa-a para decidir/aplicar e as telas usam-na para exibir.
 *
 * Conceitos:
 * - "cupom" = linha da tabela `promocoes` (código = `nome`).
 * - Cada cupom tem: tipo (percentual ou valor fixo), valor, período de
 *   validade, valor mínimo de compra, limite de usos e serviços elegíveis.
 * - "acumular" cupons NUNCA é permitido: aplica-se UM cupom (o melhor) OU o
 *   desconto de aniversário — nunca os dois juntos.
 */

export type TipoCupom = "desconto_porcentagem" | "valor_fixo";

export type Cupom = {
  id: string;
  nome: string;
  ativo: boolean;
  tipo: TipoCupom;
  valor: number;
  /** "YYYY-MM-DD" ou null (sem limite) */
  data_inicio: string | null;
  data_fim: string | null;
  /** mínimo em R$ para o cupom valer (0 = sem mínimo) */
  valor_minimo: number;
  /** null = ilimitado */
  limite_usos: number | null;
  /** usos já realizados */
  usos: number;
  /** null = todos os serviços; caso contrário lista de ids */
  servicos_elegiveis: string[] | null;
};

export type ContextoCupom = {
  /** subtotal/base do carrinho ou valor do serviço (R$) */
  base: number;
  /** id do serviço sendo agendado (null quando for venda de produto) */
  servicoId?: string | null;
  /** "YYYY-MM-DD" — dia de referência (padrão: hoje) */
  hoje?: string;
};

export type ResultadoValidacao = {
  elegivel: boolean;
  /** motivo legível quando não elegível */
  motivo: string | null;
  /** desconto em R$ que este cupom geraria (0 quando não elegível) */
  desconto: number;
};

export type MelhorCupom = {
  cupom: Cupom;
  desconto: number;
  /** lista de candidatos rejeitados com o motivo (para exibir na tela) */
  rejeitados: { nome: string; motivo: string }[];
};

/** Formata "YYYY-MM-DD" de um Date local (sem depender de biblioteca). */
export function hojeYYYYMMDD(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Normaliza o código digitado: maiúsculas e sem espaços. */
export function normalizarCodigo(codigo: string): string {
  return (codigo ?? "").toUpperCase().replace(/\s+/g, "");
}

/** Calcula o desconto em R$ de um cupom sobre uma base. Nunca negativo nem > base. */
export function calcularDesconto(cupom: Cupom, base: number): number {
  if (!Number.isFinite(base) || base <= 0) return 0;
  let desconto = 0;
  if (cupom.tipo === "desconto_porcentagem") {
    const pct = Math.min(Math.max(Number(cupom.valor) || 0, 0), 100);
    desconto = (base * pct) / 100;
  } else {
    desconto = Math.max(Number(cupom.valor) || 0, 0);
  }
  // arredonda em 2 casas e limita ao valor base (desconto nunca gera saldo negativo)
  desconto = Math.round(desconto * 100) / 100;
  return Math.min(desconto, Math.round(base * 100) / 100);
}

/** Valida UM cupom em um contexto e informa o motivo quando não vale. */
export function validarCupom(cupom: Cupom, ctx: ContextoCupom): ResultadoValidacao {
  const base = Number(ctx.base) || 0;
  const hoje = ctx.hoje ?? hojeYYYYMMDD();

  if (!cupom.ativo) {
    return { elegivel: false, motivo: "Cupom desativado", desconto: 0 };
  }
  if (cupom.data_inicio && hoje < cupom.data_inicio) {
    return {
      elegivel: false,
      motivo: `Válido a partir de ${formatarData(cupom.data_inicio)}`,
      desconto: 0,
    };
  }
  if (cupom.data_fim && hoje > cupom.data_fim) {
    return {
      elegivel: false,
      motivo: `Expirado em ${formatarData(cupom.data_fim)}`,
      desconto: 0,
    };
  }
  if (cupom.limite_usos != null && cupom.usos >= cupom.limite_usos) {
    return { elegivel: false, motivo: "Limite de usos atingido", desconto: 0 };
  }
  const minimo = Number(cupom.valor_minimo) || 0;
  if (minimo > 0 && base < minimo) {
    return {
      elegivel: false,
      motivo: `Compra mínima de ${brl(minimo)}`,
      desconto: 0,
    };
  }
  if (
    cupom.servicos_elegiveis &&
    cupom.servicos_elegiveis.length > 0 &&
    ctx.servicoId &&
    !cupom.servicos_elegiveis.includes(ctx.servicoId)
  ) {
    return { elegivel: false, motivo: "Não vale para este serviço", desconto: 0 };
  }

  const desconto = calcularDesconto(cupom, base);
  if (desconto <= 0) {
    return { elegivel: false, motivo: "Desconto zerado para esta compra", desconto: 0 };
  }
  return { elegivel: true, motivo: null, desconto };
}

/**
 * Escolhe o MELHOR cupom (maior desconto) entre os candidatos.
 * Nunca acumula: devolve no máximo UM cupom.
 */
export function melhorCupom(candidatos: Cupom[], ctx: ContextoCupom): MelhorCupom | null {
  const rejeitados: { nome: string; motivo: string }[] = [];
  let melhor: { cupom: Cupom; desconto: number } | null = null;

  for (const c of candidatos) {
    const r = validarCupom(c, ctx);
    if (!r.elegivel || r.motivo) {
      rejeitados.push({ nome: c.nome, motivo: r.motivo ?? "Não elegível" });
      continue;
    }
    if (!melhor || r.desconto > melhor.desconto) {
      melhor = { cupom: c, desconto: r.desconto };
    }
  }

  if (!melhor) return null;
  return { cupom: melhor.cupom, desconto: melhor.desconto, rejeitados };
}

/**
 * Combina desconto de aniversário com cupons SEM acumular indevidamente:
 * - se houver cupom elegível e desconto de aniversário, aplica o MAIOR.
 * - nunca soma os dois.
 */
export type FonteDesconto =
  | { origem: "cupom"; cupom: Cupom; desconto: number }
  | { origem: "aniversario"; desconto: number; percentual: number }
  | null;

export function melhorDesconto(
  cupomResultado: MelhorCupom | null,
  descontoAniversario: number,
  percentualAniversario: number,
): FonteDesconto {
  const aniv = Math.round((Number(descontoAniversario) || 0) * 100) / 100;
  if (cupomResultado && cupomResultado.desconto >= aniv) {
    return {
      origem: "cupom",
      cupom: cupomResultado.cupom,
      desconto: cupomResultado.desconto,
    };
  }
  if (aniv > 0) {
    return { origem: "aniversario", desconto: aniv, percentual: percentualAniversario };
  }
  return null;
}

/** Desconto de aniversário (% do valor base) — mesma regra da página pública. */
export function descontoAniversario(
  base: number,
  nascimentoISO: string | null | undefined,
  promoAtiva: boolean,
  percentual: number,
): number {
  if (!promoAtiva || !nascimentoISO) return 0;
  const nasc = new Date(`${nascimentoISO}T00:00:00`);
  if (Number.isNaN(nasc.getTime())) return 0;
  if (nasc.getMonth() !== new Date().getMonth()) return 0;
  const pct = Math.min(Math.max(Number(percentual) || 0, 0), 100);
  return Math.min(Math.round(((base * pct) / 100) * 100) / 100, Math.max(base, 0));
}

function formatarData(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export function brl(v: number): string {
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ─── Conversão de linha do banco → Cupom (compartilhada) ────────────────────
// Mantida aqui, na lógica pura, para que o servidor público E o autenticado
// leiam os cupons exatamente da mesma forma (evita divergência de regra).

/** Colunas necessárias de `promocoes` para montar um Cupom. */
export const COLUNAS_CUPOM =
  "id, nome, ativo, tipo, valor, data_inicio, data_fim, servicos_elegiveis, valor_minimo, limite_usos, usos";

/** Formato mínimo de uma linha de `promocoes` aceito pelo conversor. */
export type LinhaCupom = {
  id: string;
  nome: string;
  ativo: boolean;
  tipo: TipoCupom;
  valor: number | string;
  data_inicio: string | null;
  data_fim: string | null;
  servicos_elegiveis: unknown;
  valor_minimo?: number | string | null;
  limite_usos?: number | string | null;
  usos?: number | string | null;
};

export function paraCupom(r: LinhaCupom): Cupom {
  const elegiveis = Array.isArray(r.servicos_elegiveis)
    ? (r.servicos_elegiveis as unknown[]).filter((x): x is string => typeof x === "string")
    : null;
  return {
    id: r.id,
    nome: r.nome,
    ativo: r.ativo,
    tipo: r.tipo,
    valor: Number(r.valor),
    data_inicio: r.data_inicio,
    data_fim: r.data_fim,
    valor_minimo: Number(r.valor_minimo ?? 0),
    limite_usos: r.limite_usos == null ? null : Number(r.limite_usos),
    usos: Number(r.usos ?? 0),
    servicos_elegiveis: elegiveis && elegiveis.length > 0 ? elegiveis : null,
  };
}
