// =============================================================================
// AUDITORIA DE USUÁRIOS — SOMENTE LEITURA
// =============================================================================
// Lista todos os usuários em auth.users, cruza com public.contas / profiles e
// conta quantos registros cada usuário possui em cada tabela de negócio.
//
// NÃO ALTERA NADA: apenas SELECTs via service_role. Não gera SQL de limpeza.
//
// USO (da raiz do projeto):
//   cd nail-boss-suite && node scripts/auditar-test-users.mjs
// =============================================================================

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env", "utf8");
const get = (k) => {
  const m = env.match(new RegExp("^" + k + "=\\s*\"?([^\"\\r\\n]+)", "m"));
  return m ? m[1].replace(/"/g, "").trim() : null;
};

const SUPABASE_URL = get("SUPABASE_URL");
const SERVICE_ROLE = get("SUPABASE_SERVICE_ROLE_KEY");
const ADMIN_EMAILS = (get("ADMIN_EMAILS") || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("❌ Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Tabelas de negócio com coluna de dono (user_id, ou id no caso de profiles).
const TABELAS = [
  ["profiles", "id"],
  ["contas", "user_id"],
  ["clientes", "user_id"],
  ["servicos", "user_id"],
  ["agendamentos", "user_id"],
  ["produtos", "user_id"],
  ["movimentacoes_estoque", "user_id"],
  ["fidelidade_config", "user_id"],
  ["fidelidade_pontos", "user_id"],
  ["fidelidade_historico", "user_id"],
  ["promocoes", "user_id"],
  ["portfolio", "user_id"],
  ["vendas", "user_id"],
  ["venda_itens", "user_id"],
  ["avaliacoes", "user_id"],
  ["metas_mensais", "user_id"],
  ["despesas", "user_id"],
  ["horarios_trabalho", "user_id"],
  ["bloqueios_agenda", "user_id"],
  ["configuracoes", "user_id"],
  ["notificacoes_internas", "user_id"],
  ["recorrencias", "user_id"],
  ["backup_log", "user_id"],
  ["audit_log", "user_id"],
];

// Padrões que indicam provável usuário de teste (e-mail do E2E e afins)
const TEST_PATTERNS = [/cliente-e2e-/i, /^test/i, /teste/i, /@test\./i, /e2e/i, /qa[0-9]*@/i, /demo/i, /exemplo/i, /fake/i, /dev[0-9]*@/i];

function ehProvalTeste(email, conta) {
  const e = email || "";
  if (TEST_PATTERNS.some((re) => re.test(e))) return "e-mail parece de teste";
  if (conta && conta.status === "inativo") return "conta inativa (nunca liberada)";
  if (!conta) return "sem linha em contas (órfã)";
  return null;
}

async function listarUsuarios() {
  const users = [];
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 1000) break;
    page++;
    if (page > 20) break; // trava de segurança (máx 20.000 usuários)
  }
  return users;
}

async function main() {
  console.log("🔍 AUDITORIA DE USUÁRIOS — SOMENTE LEITURA\n");

  const users = await listarUsuarios();
  console.log(`Total de usuários em auth.users: ${users.length}\n`);

  // Carrega contas (service_role ignora RLS) e profiles (nome)
  const { data: contas, error: errContas } = await admin.from("contas").select("user_id,status,is_admin,plano,fonte,acesso_termina_em,kirvano_transacao_id,motivo_bloqueio,criado_em");
  if (errContas) console.log(`⚠ contas (detalhe): erro ${errContas.message}`);
  const { data: perfis } = await admin.from("profiles").select("id,nome,telefone,email");
  const contasPorUser = new Map((contas ?? []).map((c) => [c.user_id, c]));
  const perfisPorUser = new Map((perfis ?? []).map((p) => [p.id, p]));

  // Conta registros por usuário em cada tabela (1 SELECT por tabela)
  const contagem = {}; // userId -> { tabela: n }
  const tabelasComDados = {};
  for (const [tabela, col] of TABELAS) {
    let rows;
    try {
      const { data, error } = await admin.from(tabela).select(col);
      if (error) { tabelasComDados[tabela] = `erro: ${error.message.slice(0, 60)}`; continue; }
      rows = data ?? [];
    } catch (e) {
      tabelasComDados[tabela] = `erro: ${e.message.slice(0, 60)}`;
      continue;
    }
    tabelasComDados[tabela] = rows.length;
    const porUser = new Map();
    for (const r of rows) {
      const uid = r[col];
      if (!uid) continue;
      porUser.set(uid, (porUser.get(uid) ?? 0) + 1);
    }
    for (const [uid, n] of porUser) {
      if (!contagem[uid]) contagem[uid] = {};
      contagem[uid][tabela] = n;
    }
  }

  const admins = [];
  const provaveisTeste = [];
  const outros = [];

  for (const u of users) {
    const conta = contasPorUser.get(u.id);
    const perfil = perfisPorUser.get(u.id);
    const email = u.email ?? perfil?.email ?? "(sem e-mail)";
    const isAdmin = conta?.is_admin === true || ADMIN_EMAILS.includes((u.email ?? "").toLowerCase());
    const motivoTeste = ehProvalTeste(email, conta);
    const item = { u, conta, perfil, email, isAdmin, motivoTeste, tabelas: contagem[u.id] ?? {} };
    if (isAdmin) admins.push(item);
    else if (motivoTeste) provaveisTeste.push(item);
    else outros.push(item);
  }

  const formatarItem = (item) => {
    const { u, conta, perfil, email, isAdmin, motivoTeste, tabelas } = item;
    const linhas = [];
    linhas.push(`• ${email}`);
    linhas.push(`  id: ${u.id}`);
    linhas.push(`  criado em: ${u.created_at} | último login: ${u.last_sign_in_at ?? "nunca"}`);
    if (perfil?.nome) linhas.push(`  nome no perfil: ${perfil.nome}`);
    if (conta) {
      linhas.push(`  conta: status=${conta.status}${conta.is_admin ? ", is_admin=TRUE" : ""}${conta.plano ? `, plano=${conta.plano}` : ""}${conta.fonte ? `, fonte=${conta.fonte}` : ""}${conta.acesso_termina_em ? `, acesso termina em ${conta.acesso_termina_em}` : ""}${conta.motivo_bloqueio ? `, motivo: ${conta.motivo_bloqueio}` : ""}`);
    } else {
      linhas.push(`  conta: (nenhuma linha em public.contas)`);
    }
    const totais = Object.entries(tabelas).map(([t, n]) => `${t}=${n}`).join(", ");
    linhas.push(`  registros por tabela: ${totais || "(nenhum)"}`);
    if (isAdmin) linhas.push(`  ▶ ADMINISTRADOR — NÃO remover`);
    else if (motivoTeste) linhas.push(`  ▶ PROVÁVEL TESTE — motivo: ${motivoTeste}`);
    return linhas.join("\n");
  };

  console.log("── ADMINISTRADOR(ES) (não tocar) ──");
  if (admins.length === 0) console.log("  (nenhum admin via contas.is_admin ou ADMIN_EMAILS)");
  admins.forEach((a) => console.log(formatarItem(a)));

  console.log("\n── PROVÁVEIS USUÁRIOS DE TESTE ──");
  if (provaveisTeste.length === 0) console.log("  (nenhum)");
  provaveisTeste.forEach((a) => console.log(formatarItem(a)));

  console.log("\n── OUTROS USUÁRIOS (não admin, sem padrão de teste) ──");
  if (outros.length === 0) console.log("  (nenhum)");
  outros.forEach((a) => console.log(formatarItem(a)));

  console.log("\n── RESUMO ──");
  console.log(`Total: ${users.length} | Admins: ${admins.length} | Prováveis teste: ${provaveisTeste.length} | Outros: ${outros.length}`);
  const comDados = Object.entries(contagem).filter(([, t]) => Object.keys(t).length > 0);
  console.log(`Usuários com QUALQUER registro em tabelas: ${comDados.length}`);
  console.log("\nLinhas por tabela (total no banco):");
  for (const [t, n] of Object.entries(tabelasComDados)) console.log(`  ${t}: ${n}`);
  console.log("\nObservação: todas as tabelas de negócio possuem ON DELETE CASCADE para auth.users; audit_log usa SET NULL (mantém histórico sem o dono). Nada foi alterado — auditoria somente leitura.");
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exitCode = 1;
});
