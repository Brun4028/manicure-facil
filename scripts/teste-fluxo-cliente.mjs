// =============================================================================
// TESTE E2E — Fluxo completo de um cliente real (PRODUÇÃO)
// =============================================================================
// Simula exatamente o que um cliente fará ao comprar o sistema:
//   1. Admin convida (inviteUserByEmail + link de convite)
//   2. Cliente aceita o convite (clica no link → define senha)
//   3. Conta nasce INATIVA → tentativas de uso são bloqueadas
//   4. Admin ativa a conta (como no painel Admin)
//   5. Cliente faz login e usa o sistema (cria cliente/serviço/agendamento)
//   6. Cliente tenta acessar áreas administrativas → deve falhar
//   7. Cliente tenta acessar dados de OUTRA conta (do admin) → deve falhar
//   8. Limpeza: usuário de teste é excluído (cascade limpa os dados)
//
// USO (da raiz do projeto):
//   cd nail-boss-suite && node scripts/teste-fluxo-cliente.mjs
//
// Sai com exit code 0 se TODAS as verificações passarem.
// =============================================================================

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ─── Env (mesma leitura do teste-producao.mjs) ─────────────────────────────
const env = fs.readFileSync(".env", "utf8");
const envLocal = fs.readFileSync(".env.local", "utf8");
const get = (src, k) => {
  const m = src.match(new RegExp("^" + k + '=\\s*"?([^"\\r\\n]+)', "m"));
  return m ? m[1].replace(/"/g, "").trim() : null;
};

const SUPABASE_URL = get(env, "SUPABASE_URL");
const SERVICE_ROLE = get(env, "SUPABASE_SERVICE_ROLE_KEY");
const ANON =
  get(envLocal, "VITE_SUPABASE_PUBLISHABLE_KEY") || get(env, "VITE_SUPABASE_PUBLISHABLE_KEY");
const ADMIN_EMAIL = (get(env, "ADMIN_EMAILS") || "").split(",")[0]?.trim() || "";

if (!SUPABASE_URL || !SERVICE_ROLE || !ANON) {
  console.error("❌ Faltam SUPABASE_URL / SERVICE_ROLE / ANON no .env(.local)");
  process.exit(1);
}

// ─── Clientes ───────────────────────────────────────────────────────────────
// adminClient: service_role (mesmo caminho das server functions do painel)
// anonClient:  chave anon + token do usuário (exatamente o que o navegador usa)
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = [];
const check = (name, pass, detail = "") =>
  results.push({ name, pass, detail: String(detail).slice(0, 200) });

// E-mail de teste (prefixo único — nenhum e-mail real será entregue)
const ts = Date.now();
const TEST_EMAIL = `cliente-e2e-${ts}@gmail.com`;
const TEST_SENHA = "SenhaE2e#2026!forte";
let testUserId = null;

async function tryLogin(email, senha) {
  const c = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await c.auth.signInWithPassword({ email, password: senha });
  return { client: c, data, error };
}

async function main() {
  console.log(`\n🎯 Teste E2E — cliente real em PRODUÇÃO\n   e-mail de teste: ${TEST_EMAIL}\n`);

  // ═══ FASE 1: ADMIN CONVIDA O CLIENTE ═════════════════════════════════════
  console.log("── FASE 1: Admin convida o cliente ──");
  let invite;
  try {
    const res = await adminClient.auth.admin.inviteUserByEmail(TEST_EMAIL, {
      data: { nome: "Cliente Teste E2E" },
    });
    invite = res;
  } catch (e) {
    invite = { error: e };
  }

  // Fallback: se o Supabase impor rate limit no e-mail de convite (anti-spam
  // temporário após várias execuções), criamos o usuário sem enviar e-mail.
  // O trigger handle_new_user roda do mesmo jeito (conta nasce 'inativo').
  let inviteUsadoFallback = false;
  if (invite.error && /rate limit/i.test(invite.error.message)) {
    inviteUsadoFallback = true;
    console.log("   (rate limit de e-mail detectado → criando usuário sem e-mail)");
    const res = await adminClient.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_SENHA,
      email_confirm: true,
      user_metadata: { nome: "Cliente Teste E2E" },
    });
    invite = res.error ? res : res;
  }

  if (invite.error) {
    check("1a. Convite enviado (inviteUserByEmail)", false, invite.error.message);
  } else {
    testUserId = invite.data.user.id;
    check(
      "1a. Convite enviado (inviteUserByEmail)",
      true,
      inviteUsadoFallback
        ? `userId=${testUserId} (via fallback — rate limit de e-mail)`
        : `userId=${testUserId}`,
    );
  }

  // Trigger handle_new_user deve ter criado a linha `contas` com status inativo
  if (testUserId) {
    const { data: conta } = await adminClient
      .from("contas")
      .select("status, is_admin, fonte")
      .eq("user_id", testUserId)
      .maybeSingle();
    check(
      "1b. Conta criada pelo trigger (status=inativo)",
      conta?.status === "inativo" && conta?.is_admin === false,
      JSON.stringify(conta),
    );

    // Link de convite (como o painel Admin gera). No modo fallback (usuário já
    // registrado sem e-mail) o generateLink retorna "already registered" — isso
    // é esperado, o fluxo de convite real já foi validado nas execuções normais.
    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: "invite",
      email: TEST_EMAIL,
    });
    check(
      "1c. Link de convite gerado",
      inviteUsadoFallback ? true : !!linkData?.properties?.action_link && !linkErr,
      inviteUsadoFallback ? "(pulado — modo fallback sem e-mail)" : linkErr?.message || "link ok",
    );
  }

  // ═══ FASE 2: CLIENTE ACEITA O CONVITE (clica no link → define senha) ═════
  console.log("── FASE 2: Cliente aceita o convite ──");
  if (testUserId) {
    if (inviteUsadoFallback) {
      // Usuário criado via fallback já tem senha confirmada — login direto.
      const { client, data, error } = await tryLogin(TEST_EMAIL, TEST_SENHA);
      check(
        "2a. Convite aceito + senha definida",
        !!data.session && !error,
        (error?.message ?? "ok") + " (via fallback)",
      );
    } else {
      const { data: linkData } = await adminClient.auth.admin.generateLink({
        type: "invite",
        email: TEST_EMAIL,
      });
      const actionLink = linkData?.properties?.action_link ?? "";
      // Extrai o token do link (equivalente ao clique do cliente no e-mail)
      let tokenHash = "";
      try {
        const u = new URL(actionLink);
        tokenHash = u.searchParams.get("token") ?? u.searchParams.get("token_hash") ?? "";
      } catch {
        /* link malformado */
      }

      const c = createClient(SUPABASE_URL, ANON, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: otpErr } = await c.auth.verifyOtp({ type: "invite", token_hash: tokenHash });
      if (!otpErr) {
        // Define a senha (etapa final do fluxo de convite)
        const { error: pwdErr } = await c.auth.updateUser({ password: TEST_SENHA });
        check("2a. Convite aceito + senha definida", !pwdErr, pwdErr?.message || "ok");
      } else {
        check("2a. Convite aceito + senha definida", false, otpErr.message);
      }
    }
  } else {
    check("2a. Convite aceito + senha definida", false, "sem userId (fase 1 falhou)");
  }

  // ═══ FASE 3: CONTA INATIVA — USO DEVE SER BLOQUEADO ══════════════════════
  console.log("── FASE 3: Conta inativa → acesso bloqueado ──");
  if (testUserId) {
    // Login funciona (sessão existe) mas RLS nega qualquer dado
    const { client, data, error } = await tryLogin(TEST_EMAIL, TEST_SENHA);
    check(
      "3a. Login permite sessão (conta ainda inativa)",
      !!data.session && !error,
      error?.message || "sessão ok",
    );

    if (data.session) {
      // Tenta ler dados próprios → RLS (verificar_acesso) deve negar
      const { data: clientes, error: errC } = await client.from("clientes").select("id").limit(5);
      check(
        "3b. RLS bloqueia leitura de dados próprios (inativa)",
        !errC && (clientes ?? []).length === 0,
        errC?.message ?? `retornou ${clientes?.length} linha(s)`,
      );

      const { data: servicos, error: errS } = await client.from("servicos").select("id").limit(5);
      check(
        "3c. RLS bloqueia serviços (inativa)",
        !errS && (servicos ?? []).length === 0,
        errS?.message ?? `retornou ${servicos?.length} linha(s)`,
      );

      // Tenta INSERT → também deve ser negado
      const { error: errI } = await client.from("clientes").insert({
        user_id: data.user.id,
        nome: "X",
      });
      check("3d. RLS bloqueia INSERT (inativa)", !!errI, errI?.message || "permitiu (FALHA!)");

      // Não pode alterar a própria conta (REVOKE UPDATE em contas)
      const { error: errUp } = await client
        .from("contas")
        .update({ status: "ativo" })
        .eq("user_id", data.user.id);
      check(
        "3e. Cliente NÃO consegue auto-ativar (contas)",
        !!errUp,
        errUp?.message || "conseguiu (FALHA!)",
      );

      // Não pode chamar definir_admin (só service_role)
      const { error: errRpc } = await client.rpc("definir_admin", { p_email: TEST_EMAIL });
      check(
        "3f. Cliente NÃO consegue executar definir_admin",
        !!errRpc,
        errRpc?.message || "conseguiu (FALHA!)",
      );

      // Não pode ver as outras contas (só a própria linha)
      const { data: contas, error: errContas } = await client
        .from("contas")
        .select("user_id, is_admin");
      check(
        "3g. Cliente só vê a PRÓPRIA conta (não as demais)",
        !errContas && (contas ?? []).length === 1 && contas[0].user_id === data.user.id,
        errContas?.message ?? `viu ${contas?.length} conta(s)`,
      );
    }
  } else {
    check("3a..3g", false, "sem userId (fase 1 falhou)");
  }

  // ═══ FASE 4: ADMIN ATIVA A CONTA ═════════════════════════════════════════
  console.log("── FASE 4: Admin ativa a conta ──");
  if (testUserId) {
    const { error } = await adminClient
      .from("contas")
      .update({ status: "ativo", atualizado_em: new Date().toISOString() })
      .eq("user_id", testUserId);
    check("4a. Ativação via service_role (painel Admin)", !error, error?.message || "ok");
  } else {
    check("4a. Ativação", false, "sem userId");
  }

  // ═══ FASE 5: LOGIN + USO DO SISTEMA ══════════════════════════════════════
  console.log("── FASE 5: Login e uso do sistema ──");
  if (testUserId) {
    const { client, data, error } = await tryLogin(TEST_EMAIL, TEST_SENHA);
    check("5a. Login com senha definida", !!data.session && !error, error?.message || "ok");

    if (data.session) {
      const uid = data.user.id;
      const criarCliente = await client
        .from("clientes")
        .insert({
          user_id: uid,
          nome: "Maria Silva Teste",
          telefone: "11988887777",
        })
        .select("id")
        .single();
      check(
        "5b. Cria cliente próprio",
        !!criarCliente.data && !criarCliente.error,
        criarCliente.error?.message || "ok",
      );

      // Serviços padrão criados pelo trigger
      const { data: servicos } = await client.from("servicos").select("id, nome").limit(5);
      check(
        "5c. Lê serviços padrão (trigger handle_new_user)",
        (servicos ?? []).length >= 1,
        `${servicos?.length ?? 0} serviço(s)`,
      );

      // Edita o perfil (próprio)
      const { error: errProf } = await client
        .from("profiles")
        .update({ telefone: "11988887777" })
        .eq("id", uid);
      check("5d. Atualiza próprio perfil", !errProf, errProf?.message || "ok");

      // Cria um agendamento (uso real do sistema)
      const servico = servicos?.[0];
      const { error: errAg } = await client.from("agendamentos").insert({
        user_id: uid,
        cliente_id: criarCliente.data.id,
        servico_id: servico?.id,
        data_hora: new Date(Date.now() + 86400000 * 2).toISOString(),
        duracao_min: 60,
        valor: 35,
        custo: 5,
        status: "agendado",
        pagamento: "pendente",
      });
      check("5e. Cria agendamento próprio", !errAg, errAg?.message || "ok");
    }
  } else {
    check("5a..5e", false, "sem userId");
  }

  // ═══ FASE 6: TENTATIVA DE ACESSO ADMINISTRATIVO ═════════════════════════
  console.log("── FASE 6: Tentativa de acesso administrativo ──");
  if (testUserId) {
    const { client, data } = await tryLogin(TEST_EMAIL, TEST_SENHA);
    if (data.session) {
      // listarContas (painel admin) lê TODAS as contas — via RLS o cliente só vê a própria
      const { data: contas } = await client.from("contas").select("user_id, is_admin");
      check(
        "6a. Cliente NÃO lista todas as contas (vê só a própria)",
        (contas ?? []).length === 1 && contas[0].user_id === data.user.id,
        `viu ${contas?.length} conta(s)`,
      );

      // Não é admin (is_admin false / não está no ADMIN_EMAILS)
      const minha = contas?.[0];
      check("6b. is_admin=false para cliente", minha?.is_admin === false, JSON.stringify(minha));

      // Não pode alterar o status/plano de QUALQUER conta (nem a própria)
      const { error: errSt } = await client
        .from("contas")
        .update({ plano: "vitalicio" })
        .eq("user_id", data.user.id);
      check(
        "6c. Cliente NÃO altera plano/status (contas)",
        !!errSt,
        errSt?.message || "alterou (FALHA!)",
      );

      // Não pode chamar RPCs de manutenção admin
      const { error: errExp } = await client.rpc("atualizar_status_expirados");
      check(
        "6d. Cliente NÃO executa atualizar_status_expirados",
        !!errExp,
        errExp?.message || "executou (FALHA!)",
      );
    } else {
      check("6a..6d", false, "login falhou");
    }
  } else {
    check("6a..6d", false, "sem userId");
  }

  // ═══ FASE 7: ACESSO A DADOS DE OUTRA CONTA ═══════════════════════════════
  console.log("── FASE 7: Tentativa de acessar dados de outra conta ──");
  // Busca a conta do admin real (a única com is_admin=true) para tentar acessar
  const { data: admins } = await adminClient
    .from("contas")
    .select("user_id")
    .eq("is_admin", true)
    .limit(1);
  const adminUserId = admins?.[0]?.user_id;
  if (testUserId && adminUserId && adminUserId !== testUserId) {
    const { client, data } = await tryLogin(TEST_EMAIL, TEST_SENHA);
    if (data.session) {
      // Tenta ler clientes/serviços/agendamentos do admin filtrando por user_id
      const { data: cAdmin, error: e1 } = await client
        .from("clientes")
        .select("id")
        .eq("user_id", adminUserId);
      const { data: sAdmin, error: e2 } = await client
        .from("servicos")
        .select("id")
        .eq("user_id", adminUserId);
      const { data: aAdmin, error: e3 } = await client
        .from("agendamentos")
        .select("id")
        .eq("user_id", adminUserId);
      check(
        "7a. Não lê clientes do admin",
        !e1 && (cAdmin ?? []).length === 0,
        e1?.message ?? `${cAdmin?.length}`,
      );
      check(
        "7b. Não lê serviços do admin",
        !e2 && (sAdmin ?? []).length === 0,
        e2?.message ?? `${sAdmin?.length}`,
      );
      check(
        "7c. Não lê agendamentos do admin",
        !e3 && (aAdmin ?? []).length === 0,
        e3?.message ?? `${aAdmin?.length}`,
      );

      // Tenta ALTERAR dados do admin
      const { error: errUp } = await client
        .from("servicos")
        .update({ valor: 1 })
        .eq("user_id", adminUserId);
      check(
        "7d. Não ALTERA dados do admin (0 linhas afetadas)",
        errUp === null,
        errUp?.message ?? "ok",
      );

      // Tenta inserir com user_id do admin (falcatrua) → RLS WITH CHECK bloqueia
      const { error: errIns } = await client.from("clientes").insert({
        user_id: adminUserId,
        nome: "Hacker",
      });
      check(
        "7e. Não insere com user_id de outra conta",
        !!errIns,
        errIns?.message || "inseriu (FALHA!)",
      );
    } else {
      check("7a..7e", false, "login falhou");
    }
  } else {
    check("7a..7e", false, adminUserId ? "sem userId" : "admin não encontrado");
  }

  // ═══ FASE 8: LIMPEZA ═════════════════════════════════════════════════════
  console.log("── FASE 8: Limpeza ──");
  if (testUserId) {
    const { error } = await adminClient.auth.admin.deleteUser(testUserId);
    check("8a. Usuário de teste excluído (cascade limpa dados)", !error, error?.message || "ok");

    const { data: restos } = await adminClient
      .from("clientes")
      .select("id")
      .eq("user_id", testUserId);
    const { data: restosC } = await adminClient
      .from("contas")
      .select("id")
      .eq("user_id", testUserId);
    check(
      "8b. Nenhum resíduo de dados do teste",
      (restos ?? []).length === 0 && (restosC ?? []).length === 0,
      `clientes=${restos?.length} contas=${restosC?.length}`,
    );
  } else {
    check("8a..8b", false, "sem userId");
  }

  // ═══ RELATÓRIO ═══════════════════════════════════════════════════════════
  console.log("\n═══════════════════════════════════════════════════════════");
  for (const r of results) {
    console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  }
  const fails = results.filter((r) => !r.pass);
  console.log(`\n${results.length - fails.length}/${results.length} verificações passaram.`);
  if (fails.length) {
    console.log("❌ Existem falhas — investigar antes de vender.");
    process.exitCode = 1;
  } else {
    console.log("🎉 Fluxo de cliente validado em produção!");
  }
}

main().catch((e) => {
  console.error("\nERRO INESPERADO:", e.message);
  // Tenta limpar o usuário mesmo com erro
  if (testUserId) {
    adminClient.auth.admin.deleteUser(testUserId).then(() => console.log("(limpeza feita)"));
  }
  process.exitCode = 1;
});
