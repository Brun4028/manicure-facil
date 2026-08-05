-- =============================================================================
-- CORREÇÃO URGENTE — Políticas RLS (validação E2E encontrou falhas reais)
-- =============================================================================
-- Data: 2026-08-05
--
-- PROBLEMA ENCONTRADO NA VALIDAÇÃO E2E EM PRODUÇÃO:
--   1. Conta INATIVA consegue LER e ESCREVER dados próprios (clientes, serviços,
--      etc.) — as políticas own_* NÃO estão aplicando public.verificar_acesso().
--   2. Qualquer usuário consegue INSERT com user_id de OUTRA conta (falcatrua) —
--      existe política antiga/permissiva de INSERT que não valida o dono.
--   3. No teste, um atacante simulando isso inseriu "Hacker"/"HackerProbe" na
--      conta do admin (dados já removidos).
--
-- ESTE SCRIPT CORRIGE DE FORMA DEFINITIVA:
--   A. DROPA TODAS as políticas de TODAS as tabelas de dados (independente do
--      nome — antigas "own clientes", "public_select_*", "allow public *", etc.)
--   B. Recria APENAS as políticas corretas:
--        - Tabelas com user_id → own_<tabela> com verificar_acesso() + dono
--        - profiles        → select/insert/update próprios + verificar_acesso()
--        - contas          → contas_own_select (usuário vê o PRÓPRIO status,
--                            mesmo bloqueado — de propósito)
--   C. Garante grants corretos (authenticated = mínimo, anon = NADA, service_role = ALL)
--
-- 100% idempotente — pode rodar de novo sem quebrar nada.
-- =============================================================================

-- ── 0. Garantir que a função verificar_acesso() existe (fonte da verdade) ──
CREATE OR REPLACE FUNCTION public.verificar_acesso()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contas c
    WHERE c.user_id = auth.uid()
      AND c.status = 'ativo'
      AND (c.acesso_termina_em IS NULL OR c.acesso_termina_em > now())
  );
$$;

REVOKE EXECUTE ON FUNCTION public.verificar_acesso() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verificar_acesso() TO authenticated;

-- ── A. DROPAR TODAS AS POLÍTICAS EXISTENTES (limpeza total) ────────────────
-- Remove QUALQUER política de qualquer nome nas tabelas de dados, para que o
-- PostgreSQL não combine políticas antigas permissivas com OR.
DO $$
DECLARE
  t text;
  pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clientes','servicos','agendamentos','produtos',
    'movimentacoes_estoque','fidelidade_config','fidelidade_pontos',
    'fidelidade_historico','promocoes','portfolio','vendas',
    'venda_itens','metas_mensais','despesas','horarios_trabalho',
    'bloqueios_agenda','configuracoes','notificacoes_internas',
    'recorrencias','audit_log','backup_log','contas','profiles'
  ]
  LOOP
    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- ── B1. POLÍTICAS own_* COM verificar_acesso() (tabelas com user_id) ───────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clientes','servicos','agendamentos','produtos',
    'movimentacoes_estoque','fidelidade_config','fidelidade_pontos',
    'fidelidade_historico','promocoes','portfolio','vendas',
    'venda_itens','metas_mensais','despesas','horarios_trabalho',
    'configuracoes','notificacoes_internas','recorrencias'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY own_%I ON public.%I FOR ALL TO authenticated
         USING (auth.uid() = user_id AND public.verificar_acesso())
         WITH CHECK (auth.uid() = user_id AND public.verificar_acesso())',
      t, t
    );
  END LOOP;
END $$;

-- bloqueios_agenda (mesma regra, nome de política próprio)
CREATE POLICY "own_bloqueios" ON public.bloqueios_agenda
  FOR ALL TO authenticated
  USING (auth.uid() = user_id AND public.verificar_acesso())
  WITH CHECK (auth.uid() = user_id AND public.verificar_acesso());

-- backup_log (mesma regra, nome próprio)
CREATE POLICY "own_backup_log" ON public.backup_log
  FOR ALL TO authenticated
  USING (auth.uid() = user_id AND public.verificar_acesso())
  WITH CHECK (auth.uid() = user_id AND public.verificar_acesso());

-- audit_log (INSERT + SELECT próprios com verificar_acesso)
CREATE POLICY "own_audit_log_insert" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.verificar_acesso());
CREATE POLICY "own_audit_log_select" ON public.audit_log
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND public.verificar_acesso());

-- ── B2. profiles (coluna id, não user_id) ───────────────────────────────────
CREATE POLICY "own_profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id AND public.verificar_acesso());
CREATE POLICY "own_profiles_insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id AND public.verificar_acesso());
CREATE POLICY "own_profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id AND public.verificar_acesso())
  WITH CHECK (auth.uid() = id AND public.verificar_acesso());

-- ── B3. contas (usuário vê APENAS a própria linha — SEM verificar_acesso, ──
-- ──     de propósito: usuário bloqueado precisa ver o próprio status) ──────
CREATE POLICY "contas_own_select" ON public.contas
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ── C. GRANTS (mínimo para authenticated; NADA para anon; ALL p/ service_role)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clientes','servicos','agendamentos','produtos',
    'movimentacoes_estoque','fidelidade_config','fidelidade_pontos',
    'fidelidade_historico','promocoes','portfolio','vendas',
    'venda_itens','metas_mensais','despesas','horarios_trabalho',
    'bloqueios_agenda','configuracoes','notificacoes_internas','recorrencias'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

REVOKE ALL ON public.contas FROM anon;
GRANT SELECT ON public.contas TO authenticated;
GRANT ALL ON public.contas TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.contas FROM authenticated;

REVOKE ALL ON public.profiles FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

REVOKE ALL ON public.audit_log FROM anon;
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

REVOKE ALL ON public.backup_log FROM anon;
GRANT SELECT ON public.backup_log TO authenticated;
GRANT ALL ON public.backup_log TO service_role;

-- ── VERIFICAÇÃO ─────────────────────────────────────────────────────────────
SELECT 'Políticas criadas' AS etapa, count(*) AS total
FROM pg_policies
WHERE schemaname = 'public';

-- Deve listar: own_* com verificar_acesso em todas as tabelas de dados
SELECT tablename, policyname, qual
FROM pg_policies
WHERE schemaname = 'public' AND policyname LIKE 'own_%'
ORDER BY tablename;

-- =============================================================================
-- FIM. Após rodar, execute novamente o teste E2E:
--   cd nail-boss-suite && node scripts/teste-fluxo-cliente.mjs
-- =============================================================================
