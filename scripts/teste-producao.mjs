// Teste de produção — valida RPCs, tabelas e políticas reais do Supabase.
// Usa service_role (mesmo caminho que o servidor usa em produção).
//
// USO (executar da raiz do projeto):
//   cd nail-boss-suite && node scripts/teste-producao.mjs
//
// O que verifica:
//   1. RPCs de produção existem e respondem (verificar_acesso, agendar_servico,
//      criar_avaliacao)
//   2. Tabelas-chave acessíveis via service_role
//   3. Chave anon NÃO tem acesso a `contas` (hardening RLS)
import fs from "node:fs";

const env = fs.readFileSync(".env", "utf8");
const get = (k) => {
  const m = env.match(new RegExp("^" + k + '=\\s*"?([^"\\r\\n]+)', "m"));
  return m ? m[1].replace(/"$/, "").trim() : null;
};

const URL = get("SUPABASE_URL");
const SR = get("SUPABASE_SERVICE_ROLE_KEY");
const H = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };
const base = `${URL}/rest/v1`;

const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });

async function main() {
  // 1. RPC verificar_acesso() existe e é executável
  {
    const r = await fetch(`${base}/rpc/verificar_acesso`, {
      method: "POST",
      headers: H,
      body: "{}",
    });
    // Sem sessão, auth.uid() é null → deve retornar false (não erro de função)
    const body = await r.text();
    check("RPC verificar_acesso()", r.status === 200, `HTTP ${r.status}: ${body.slice(0, 120)}`);
  }

  // 2. RPC agendar_servico existe (validar argumentos)
  {
    const r = await fetch(`${base}/rpc/agendar_servico`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        p_user_id: "00000000-0000-0000-0000-000000000000",
        p_cliente_nome: "Teste",
        p_cliente_telefone: "11999999999",
        p_cliente_email: null,
        p_cliente_data_nascimento: null,
        p_cliente_observacoes: null,
        p_servico_id: "00000000-0000-0000-0000-000000000000",
        p_data_hora: "2099-01-01T10:00:00",
        p_observacoes: null,
        p_valor_final: 1,
      }),
    });
    const body = await r.text();
    const okShape =
      body.includes("success") ||
      body.includes("error") ||
      body.includes("Serviço") ||
      body.includes("encontrado");
    check(
      "RPC agendar_servico (assinatura ok)",
      r.status === 200 && okShape,
      `HTTP ${r.status}: ${body.slice(0, 160)}`,
    );
  }

  // 3. RPC criar_avaliacao existe
  {
    const r = await fetch(`${base}/rpc/criar_avaliacao`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        p_user_id: "00000000-0000-0000-0000-000000000000",
        p_cliente_nome: "Teste",
        p_nota: 5,
        p_comentario: null,
      }),
    });
    const body = await r.text();
    const okShape = body.includes("success") || body.includes("error") || body.includes("erro");
    check(
      "RPC criar_avaliacao (assinatura ok)",
      r.status === 200 && okShape,
      `HTTP ${r.status}: ${body.slice(0, 160)}`,
    );
  }

  // 4. Tabelas-chave acessíveis via service_role
  for (const t of ["contas", "servicos", "clientes", "agendamentos", "profiles"]) {
    const r = await fetch(`${base}/${t}?select=*&limit=1`, { headers: H });
    check(`Tabela ${t}`, r.status === 200, `HTTP ${r.status}`);
  }

  // 5. Política anon: contas NÃO deve expor dados ao anon (security hardening)
  {
    const env2 = fs.readFileSync(".env.local", "utf8");
    const get2 = (k) => {
      const m = env2.match(new RegExp("^" + k + '=\\s*"?([^"\\r\\n]+)', "m"));
      return m ? m[1].replace(/"$/, "").trim() : null;
    };
    const ANON = get2("VITE_SUPABASE_PUBLISHABLE_KEY");
    const r = await fetch(`${base}/contas?select=*&limit=1`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    });
    check(
      "anon SEM acesso a contas",
      r.status === 401 || r.status === 403,
      `HTTP ${r.status}: ${(await r.text()).slice(0, 100)}`,
    );
  }

  for (const r of results) {
    console.log(`${r.pass ? "✅" : "❌"} ${r.name} — ${r.detail}`);
  }
  const fails = results.filter((r) => !r.pass);
  console.log(`\n${results.length - fails.length}/${results.length} verificações passaram.`);
  if (fails.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exitCode = 1;
});
