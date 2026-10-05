/**
 * Utilitários de WhatsApp — mensagens prontas para lembrar, confirmar e
 * reativar clientes sem sair do sistema.
 *
 * Não usa API paga: apenas abre a conversa (WhatsApp Web ou celular) com o
 * texto já preenchido via `wa.me`. Se no futuro quiser automatizar o envio,
 * basta trocar a implementação de `abrirWhatsApp` por uma chamada de API
 * (Evolution API / WhatsApp Cloud API) — a interface pública não muda.
 */
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export type DadosMensagem = {
  cliente: string;
  dataHora?: string | Date | null;
  servico?: string | null;
  valor?: number | null;
  salao?: string | null;
};

/** Remove tudo que não é dígito (parênteses, traços, espaços, +55...). */
export function somenteDigitos(valor: string | null | undefined): string {
  return (valor ?? "").replace(/\D/g, "");
}

/**
 * Converte um telefone brasileiro qualquer para o formato internacional do
 * WhatsApp (55 + DDD + número). Retorna `null` quando o número não é válido.
 */
export function numeroWhatsApp(telefone: string | null | undefined): string | null {
  let digitos = somenteDigitos(telefone);
  if (!digitos) return null;

  // 0055... (prefixo internacional discado) → remove
  if (digitos.startsWith("0055")) digitos = digitos.slice(4);

  // Se ainda não está no formato internacional (55 + DDD + número), assume
  // que é DDD + número brasileiro e adiciona o 55. O `if` interno evita
  // duplicar o prefixo quando o número já vem completo.
  const jaInternacional =
    digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13);
  if (!jaInternacional && (digitos.length === 10 || digitos.length === 11)) {
    digitos = `55${digitos}`;
  }

  // Precisa de: 55 (2) + DDD (2) + número (8 ou 9)
  if (digitos.length < 12 || digitos.length > 13 || !digitos.startsWith("55")) return null;
  return digitos;
}

/** Monta o link `wa.me` (com o texto já preenchido, se houver). */
export function linkWhatsApp(
  telefone: string | null | undefined,
  mensagem?: string,
): string | null {
  const numero = numeroWhatsApp(telefone);
  if (!numero) return null;
  const base = `https://wa.me/${numero}`;
  const texto = (mensagem ?? "").trim();
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base;
}

/**
 * Abre a conversa no WhatsApp. Retorna `false` quando o número é inválido
 * (para a tela chamar um toast amigável em vez de falhar em silêncio).
 */
export function abrirWhatsApp(telefone: string | null | undefined, mensagem?: string): boolean {
  const link = linkWhatsApp(telefone, mensagem);
  if (!link) return false;
  window.open(link, "_blank", "noopener,noreferrer");
  return true;
}

/** "07/10/2026 às 14h30" — formato natural para mensagem de celular. */
export function formatarDataHora(dataHora: string | Date | null | undefined): string {
  if (!dataHora) return "";
  const data = typeof dataHora === "string" ? new Date(dataHora) : dataHora;
  if (Number.isNaN(data.getTime())) return "";
  const hora = format(data, "HH'h'mm");
  return `${format(data, "dd/MM/yyyy")} às ${hora}`;
}

function valorFormatado(valor: number | null | undefined): string {
  if (!valor && valor !== 0) return "";
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pecaServico(dados: DadosMensagem): string {
  return dados.servico ? ` (${dados.servico})` : "";
}

function assinatura(dados: DadosMensagem): string {
  return dados.salao ? `\n\n— ${dados.salao}` : "";
}

/** Modelos de mensagem prontos. Todos aceitam dados parciais. */
export const mensagens = {
  /** Lembrete de horário que está por vir. */
  lembrete: (d: DadosMensagem) =>
    `Oi, ${d.cliente}! 💅\n` +
    `Lembrete do seu horário: *${formatarDataHora(d.dataHora)}*${pecaServico(d)}.` +
    `\n\nQualquer imprevisto, é só me avisar por aqui que a gente reorganiza. Até lá! 😊` +
    assinatura(d),

  /** Confirmação de um agendamento recém-criado ou alterado. */
  confirmacao: (d: DadosMensagem) =>
    `Oi, ${d.cliente}! 💅\n` +
    `Seu horário está confirmado: *${formatarDataHora(d.dataHora)}*${pecaServico(d)}.` +
    (d.valor ? `\nValor combinado: ${valorFormatado(d.valor)}.` : "") +
    `\n\nSe precisar remarcar, me avise com antecedência, por favor. 💜` +
    assinatura(d),

  /** Mensagem enviada quando o atendimento já foi concluído. */
  agradecimento: (d: DadosMensagem) =>
    `Oi, ${d.cliente}! 💅\n` +
    `Foi um prazer te atender${d.servico ? ` (${d.servico})` : ""}! ` +
    `Espero que tenha amado o resultado. ✨\n` +
    `\nJá estou com horários abertos para a próxima manutenção — é só me chamar por aqui.` +
    assinatura(d),

  /** Cliente que marcou e depois cancelou: convite para reagendar. */
  reagendamento: (d: DadosMensagem) =>
    `Oi, ${d.cliente}! 💅\n` +
    `Notei que não conseguimos seguir com o horário de ${formatarDataHora(d.dataHora)}.` +
    `\n\nPosso te encaixar em um novo horário? Tenho vagas nos próximos dias.` +
    assinatura(d),

  /** Aniversário da cliente — ótimo momento para ofertar um mimo/desconto. */
  aniversario: (d: DadosMensagem) =>
    `🎉 Feliz aniversário, ${d.cliente}! Muita saúde e felicidades! 💜\n` +
    `\nPara comemorar, preparei uma surpresa no seu próximo horário. ` +
    `Quer que eu já reserve um dia pra você? 💅` +
    assinatura(d),

  /** Cliente que não volta há bastante tempo: mensagem de reativação. */
  reativacao: (d: DadosMensagem) =>
    `Oi, ${d.cliente}! 💅\n` +
    `Saudades de cuidar das suas unhas! Faz um tempinho que a gente não se vê, ` +
    `que tal a gente marcar um horário essa semana?` +
    `\n\nTenho alguns encaixes disponíveis. É só responder por aqui 💜` +
    assinatura(d),

  /** Mensagem genérica quando só temos o nome da cliente. */
  conversa: (d: DadosMensagem) => `Oi, ${d.cliente}! Tudo bem? 😊${assinatura(d)}`,
};

export type TipoMensagem = keyof typeof mensagens;

/** Abre o WhatsApp já com um dos modelos preenchido. */
export function enviarMensagem(
  telefone: string | null | undefined,
  tipo: TipoMensagem,
  dados: DadosMensagem,
): boolean {
  return abrirWhatsApp(telefone, mensagens[tipo](dados));
}
