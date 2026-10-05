/**
 * Mensagens de erro amigáveis (PT-BR) para o usuário final.
 *
 * Nunca exibe a mensagem crua de erros de rede / Supabase / Postgres, que
 * chegam em inglês ou com detalhes técnicos. Regras:
 *   1. Padrões conhecidos (rede, autenticação, RLS, banco, sessão) → traduzidos
 *      para uma mensagem clara em português.
 *   2. Mensagens já em português (criadas pelo próprio app, ex.: validações de
 *      formulário) → preservadas.
 *   3. Qualquer outra coisa → texto genérico amigável (nunca expõe detalhes
 *      técnicos).
 */

import { traduzErroAuth } from "./auth-errors";

// Ordem importa: padrões mais específicos primeiro.
// (Erros de AUTH são resolvidos ANTES por traduzErroAuth() — ver
// mensagemErroAmigavel() — evitando duplicar as regex de auth aqui.)
const PADROES_TECNICOS: Array<[RegExp, string]> = [
  // ── Sessão / token ──────────────────────────────────────────────────────
  [
    /token has expired|jwt (has )?expired|auth session missing|no session found|invalid token|invalid jwt|session.*expired|unauthorized/i,
    "Sua sessão expirou. Faça login novamente.",
  ],
  [
    /too many requests|too many attempts/i,
    "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.",
  ],
  [/invalid api key|invalid credentials/i, "Credenciais inválidas. Saia e entre novamente."],

  // ── Permissão / RLS ─────────────────────────────────────────────────────
  [
    /row-level security|permission denied|violates .*policy|forbidden|not authorized|insufficient/i,
    "Você não tem permissão para realizar esta ação. Se o problema persistir, entre em contato com o suporte.",
  ],

  // ── Rede / conexão ──────────────────────────────────────────────────────
  [
    /failed to fetch|network request failed|fetch failed|load failed|econnrefused|enotfound|etimedout|networkerror|no internet|unable to connect|connection refused/i,
    "Não foi possível conectar ao servidor. Verifique sua conexão com a internet e tente novamente.",
  ],
  [/timed out|timeout|took too long/i, "A operação demorou demais. Tente novamente."],

  // ── Banco de dados / API ────────────────────────────────────────────────
  [
    /database error|db error|error saving|insert.*failed|update.*failed|query failed|pgrst|database connection/i,
    "Ocorreu um erro ao acessar os dados. Tente novamente em instantes.",
  ],
  [/duplicate key|already exists/i, "Este registro já existe. Verifique e tente novamente."],

  // ── Erros técnicos genéricos (JS / serialização) ───────────────────────
  [
    /syntax error|unexpected token|json|typeerror|referenceerror|cannot read|is not a function|undefined/i,
    "Não foi possível concluir a ação. Tente novamente em instantes.",
  ],
];

// Marcas que indicam que a mensagem JÁ está em português (vinda do próprio app).
// ⚠️ Não incluir palavras ambíguas idênticas em inglês (ex.: "email") —
// senão um erro cru do Supabase em inglês passaria como "já em português".
const MARCAS_PT =
  /[ãõçáéíóúâêôàÁÉÍÓÚÂÊÔÃÕÇ]|não |nao |inválid|válid|obrigatóri|selecione|informe|preencha|insira|existe|existente|disponível|indisponível|conflito|agendamento|cliente|serviço|servico|horário|horario|senha|telefone|nome|quantidade|maior|menor|mínim|máxim|tente|verifique|aguarde|falh|sucesso|saldo|estoque|deseja|confirmar|cancelar|descrição|descricao|valor|positivo|nenhum|cupom|título|titulo|exportar|formato|arquivo|pelo menos|conta|sessão|sessao|inicio|fim|duplica/i;

const FALLBACK = "Não foi possível concluir a ação. Tente novamente em instantes.";

export function mensagemErroAmigavel(mensagem?: string | null): string {
  if (!mensagem || !mensagem.trim()) return FALLBACK;

  // 0. Erros de AUTH conhecidos (tradutor dedicado — não duplica regex)
  const traduzidoAuth = traduzErroAuth(mensagem);
  if (traduzidoAuth) return traduzidoAuth;

  // 1. Padrões técnicos/em inglês conhecidos → tradução amigável
  for (const [padrao, traducao] of PADROES_TECNICOS) {
    if (padrao.test(mensagem)) return traducao;
  }

  // 2. Mensagem já em português (validações do próprio app) → preserva
  if (MARCAS_PT.test(mensagem)) return mensagem;

  // 3. Desconhecida → texto genérico (nunca expõe detalhes técnicos)
  return FALLBACK;
}
