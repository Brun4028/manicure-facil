// =============================================================================
// LIMPEZA DOS USUÁRIOS DE TESTE — remove SOMENTE os 3 IDs abaixo
// =============================================================================
// Remoção exclusiva por ID (nada de filtro por e-mail/like/wildcard).
//
// SEGURANÇA (várias camadas de proteção):
//   1. Lista fixa com exatamente 3 IDs de teste (auditados em scripts/auditar-test-users.mjs).
//   2. PRÉ-VALIDAÇÃO: cada ID é buscado em auth.users e o e-mail encontrado DEVE
//      bater exatamente com o esperado; qualquer divergência ABORTA a execução.
//   3. O ID do administrador (bbdb82f4-...) NÃO pode estar na lista; também
//      verificamos que ele continua existindo antes e depois.
//   4. PÓS-VALIDAÇÃO: sobra exatamente 1 usuário (o admin) e os dados reais do
//      admin (clientes=2, agendamentos=1, servicos=4, horarios_trabalho=5)
//      permanecem intactos. Nenhum resíduo dos IDs removidos em nenhuma tabela.
//
// A exclusão usa auth.admin.deleteUser(id) — as FKs com ON DELETE CASCADE das
// tabelas de negócio (profiles, contas, servicos, horarios_trabalho,
// fidelidade_config, etc.) apagam automaticamente todos os dados dos usuários.
//
// USO (da raiz do projeto):
//   cd nail-boss-suite && node scripts/limpar-test-users.mjs
// =============================================================================

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env", "utf8");
const get = (k) => {
  const m = env.match(new RegExp("^" + k + '=\\s*"?([^"\\r\\n]+)', "m"));
  return m ? m[1].replace(/"/g, "").trim() : null;
};

const SUPABASE_URL = get("SUPABASE_URL");
const SERVICE_ROLE = get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("❌ Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─── ÚNICA lista de remoção: os 3 usuários de teste (ID -> e-mail esperado) ──
const TEST_USERS = [
  { id: "1ee3254e-4fcb-451d-95c8-4d98f21c67f1", email: "buffy-test-1785540006635@teste.ia" },
  { id: "800ab553-bc01-415f-9fb8-0c2da6f00274", email: "teste-final@teste.com.br" },
  { id: "2fb2b722-0b2e-4180-8e15-3340f310da0e", email: "teste-api@teste.com.br" },
];

// ─── Administrador (NUNCA removido) ─────────────────────────────────────────
const ADMIN = { id: "bbdb82f4-a722-4539-a94f-9265738e7524", email: "ronaldoangelica9@gmail.com" };

// Tabelas de negócio com coluna de dono — usadas para checar resíduos.
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

let falhou = false;
const log = (ok, msg) => {
  console.log(`${ok ? "✅" : "❌"} ${msg}`);
  if (!ok) falhou = true;
};

// Fail-CLOSED: se alguma tabela não puder ser consultada, registramos em
// `puladas` para que a pós-validação trate como falha em vez de ignorar.
const puladas = new Set();

async function contarPorUsuario() {
  // Retorna { userId: { tabela: n } } com 1 SELECT por tabela (somente leitura)
  const contagem = {};
  for (const [tabela, col] of TABELAS) {
    let rows;
    try {
      const { data, error } = await admin.from(tabela).select(col);
      if (error) {
        puladas.add(tabela);
        continue;
      }
      rows = data ?? [];
    } catch {
      puladas.add(tabela);
      continue;
    }
    for (const r of rows) {
      const uid = r[col];
      if (!uid) continue;
      if (!contagem[uid]) contagem[uid] = {};
      contagem[uid][tabela] = (contagem[uid][tabela] ?? 0) + 1;
    }
  }
  return contagem;
}

async function main() {
  console.log("🧹 LIMPEZA DE USUÁRIOS DE TESTE\n");

  // ═══ 0. Checagens de integridade da própria lista ═════════════════════════
  log(
    TEST_USERS.length === 3,
    `Lista de remoção contém exatamente 3 usuários (tem ${TEST_USERS.length})`,
  );
  log(
    !TEST_USERS.some((t) => t.id === ADMIN.id),
    "O ID do administrador NÃO está na lista de remoção",
  );

  // ═══ 1. PRÉ-VALIDAÇÃO: IDs → e-mails devem bater exatamente ═══════════════
  console.log("\n── Pré-validação dos IDs ──");
  for (const t of TEST_USERS) {
    const { data, error } = await admin.auth.admin.getUserById(t.id);
    if (error || !data?.user) {
      log(false, `ID ${t.id} não encontrado em auth.users: ${error?.message ?? "não existe"}`);
      continue;
    }
    const encontrado = data.user.email ?? "";
    const ok = encontrado.toLowerCase() === t.email.toLowerCase();
    log(ok, `ID ${t.id} → e-mail "${encontrado}" (esperado "${t.email}")`);
    if (!ok) {
      console.log(`   ⛔ Abortando: e-mail não confere com o esperado para este ID.`);
      process.exit(1);
    }
  }

  // ═══ 2. Pré-validação do admin ════════════════════════════════════════════
  const { data: adminData } = await admin.auth.admin.getUserById(ADMIN.id);
  const adminOk =
    !!adminData?.user && (adminData.user.email ?? "").toLowerCase() === ADMIN.email.toLowerCase();
  log(
    adminOk,
    `Administrador presente e intacto: ${adminData?.user?.email ?? "(não encontrado!)"}`,
  );

  // ═══ 3. Estado antes (dados reais do admin) ═══════════════════════════════
  const antes = await contarPorUsuario();
  const adminAntes = antes[ADMIN.id] ?? {};
  // Referência esperada (auditada em scripts/auditar-test-users.mjs). Se você
  // adicionar dados reais antes de rodar, estes números mudam e a pré-checagem
  // abaixo aborta propositalmente (fail-closed) — basta atualizar aqui.
  const esperadoAdmin = {
    profiles: 1,
    contas: 1,
    clientes: 2,
    servicos: 4,
    agendamentos: 1,
    fidelidade_config: 1,
    horarios_trabalho: 5,
  };
  console.log("\n── Dados reais do admin ANTES da limpeza ──");
  for (const [t, n] of Object.entries(esperadoAdmin)) {
    const v = adminAntes[t] ?? 0;
    log(v === n, `admin.${t} = ${v} (esperado ${n})`);
  }
  if (puladas.size > 0)
    log(false, `Tabelas não consultadas na pré-checagem: ${[...puladas].join(", ")}`);

  if (falhou) {
    console.log("\n⛔ Pré-validação falhou — nada foi removido.");
    process.exit(1);
  }

  // ═══ 4. Executa a remoção (cascade limpa os dados) ════════════════════════
  console.log("\n── Removendo usuários de teste ──");
  for (const t of TEST_USERS) {
    // shouldSoftDelete=false (padrão) = exclusão definitiva com cascade
    const { error } = await admin.auth.admin.deleteUser(t.id, false);
    log(!error, `Removido ${t.email} (${t.id})${error ? ` — ${error.message}` : ""}`);
  }

  // ═══ 5. PÓS-VALIDAÇÃO ═════════════════════════════════════════════════════
  console.log("\n── Pós-validação ──");

  // 5a. Sobrou exatamente 1 usuário e é o admin
  const restantes = [];
  {
    let page = 1;
    let erroList = null;
    for (;;) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) {
        erroList = error;
        break;
      }
      restantes.push(...data.users);
      if (data.users.length < 1000) break;
      page++;
    }
    if (erroList) {
      log(false, `Não foi possível listar usuários na pós-validação: ${erroList.message}`);
    }
  }
  const emailsRestantes = restantes.map((u) => u.email ?? u.id);
  log(restantes.length === 1, `Restou exatamente 1 usuário (tem ${restantes.length})`);
  log(
    restantes.length === 1 && restantes[0].id === ADMIN.id,
    `O usuário restante é o administrador: ${restantes[0]?.email ?? "(nenhum)"}`,
  );

  // 5b. Nenhum resíduo dos IDs removidos em qualquer tabela
  const depois = await contarPorUsuario();
  if (puladas.size > 0)
    log(
      false,
      `Tabelas não consultadas na pós-validação (resíduos não verificados): ${[...puladas].join(", ")}`,
    );
  for (const t of TEST_USERS) {
    const residuos = Object.entries(depois[t.id] ?? {});
    log(
      residuos.length === 0,
      `Nenhum resíduo de ${t.email} (${residuos.length ? JSON.stringify(residuos) : "ok"})`,
    );
  }

  // 5c. Dados reais do admin intactos (comparação antes x depois)
  const adminDepois = depois[ADMIN.id] ?? {};
  for (const [t, n] of Object.entries(adminAntes)) {
    const v = adminDepois[t] ?? 0;
    log(v === n, `admin.${t} = ${v} (igual ao antes: ${n})`);
  }

  // 5d. Nenhum dado sem dono (órfão) criado pela remoção
  const totalSemDono = Object.values(depois).filter((t) => Object.keys(t).length > 0).length;
  log(totalSemDono === 1, `Apenas 1 usuário com registros nas tabelas (tem ${totalSemDono})`);

  console.log(
    "\n" +
      (falhou
        ? "❌ LIMPEZA CONCLUÍDA COM FALHAS — revisar saída acima."
        : "🎉 Limpeza concluída com sucesso. Restou apenas a conta administradora com os dados reais intactos."),
  );
  process.exitCode = falhou ? 1 : 0;
}

main().catch((e) => {
  console.error("\nERRO INESPERADO:", e.message);
  process.exitCode = 1;
});
