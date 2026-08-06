/**
 * Tradução de erros do Supabase Auth.
 *
 * O Supabase retorna mensagens de erro em inglês (ex.: "Invalid login
 * credentials"). Para que a manicure nunca veja um erro em inglês, mapeamos
 * as mensagens mais comuns para o português e usamos um texto genérico como
 * fallback (nunca exibimos a mensagem crua do backend).
 */
const AUTH_ERROR_MAP: Array<[RegExp, string]> = [
  [/invalid login credentials/i, "E-mail ou senha incorretos. Verifique e tente novamente."],
  [/email not confirmed/i, "Seu e-mail ainda não foi confirmado. Confira o link enviado para sua caixa de entrada."],
  [/user already registered/i, "Este e-mail já está cadastrado. Faça login ou recupere sua senha."],
  [/password should be at least/i, "A senha precisa ter pelo menos 6 caracteres."],
  [/rate limit exceeded/i, "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente."],
  [/token has expired or is invalid/i, "Este link expirou ou é inválido. Solicite um novo."],
  [/unable to validate email address/i, "E-mail inválido. Verifique o endereço digitado."],
  [/invalid email/i, "E-mail inválido. Verifique o endereço digitado."],
  [/user not found/i, "Nenhuma conta encontrada com este e-mail."],
  [/for security purposes/i, "Por segurança, aguarde alguns minutos antes de tentar novamente."],
  [/database error saving new user/i, "Não foi possível criar a conta. Tente novamente em instantes."],
];

/**
 * Retorna a tradução se a mensagem for um erro de auth conhecido; caso
 * contrário retorna null (permite que outros tradutores tentem antes do
 * fallback genérico — evita duplicar as regex de auth em user-errors.ts).
 */
export function traduzErroAuth(mensagem?: string | null): string | null {
  if (!mensagem) return null;
  for (const [padrao, traducao] of AUTH_ERROR_MAP) {
    if (padrao.test(mensagem)) return traducao;
  }
  return null;
}

export function mensagemErroAuth(mensagem?: string | null): string {
  return traduzErroAuth(mensagem) ?? "Não foi possível concluir a operação. Tente novamente.";
}
