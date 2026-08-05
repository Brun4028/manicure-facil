-- =============================================================================
-- DIAGNÓSTICO DE PRODUÇÃO — Manicure Fácil (read-only)
-- =============================================================================
-- Como usar: Supabase Dashboard -> SQL Editor -> colar -> Run.
--
-- Este script NÃO altera nada. Ele verifica se o banco está em conformidade
-- com as migrations e reporta qualquer objeto ausente:
--   1. Tabelas esperadas (diff vs migrations)
--   2. RLS habilitado por tabela
--   3. Políticas own_* (controle de acesso por dono + conta ativa)
--   4. Funções-chave (verificar_acesso, agendar_servico, etc.)
--   5. Triggers (updated_at + on_auth_user_created)
--   6. Índices de performance
--   7. Privilégios do papel anon (devem ser NENHUM em tabelas de dados)
--   8. Job do pg_cron (expiração de contas)
--
-- Se a última linha retornar "✅ CONFORME", o banco está pronto.
-- =============================================================================

-- ── 1. TABELAS ESPERADAS ──────────────────────────────────────────────────
SELECT '1. Tabelas ausentes' AS etapa, string_agg(t, ', ') AS resultado
FROM (
  SELECT 'tabela_faltando:' || t AS t
  FROM unnest(ARRAY[
    'profiles','clientes','servicos','agendamentos','produtos',
    'movimentacoes_estoque','fidelidade_config','fidelidade_pontos',
    'fidelidade_historico','promocoes','portfolio','vendas','venda_itens',
    'avaliacoes','metas_mensais','audit_log','backup_log','despesas',
    'horarios_trabalho','bloqueios_agenda','configuracoes',
    'notificacoes_internas','recorrencias','contas'
  ]) AS t
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = t
  )
) sub
HAVING count(*) > 0
UNION ALL
SELECT '1. Tabelas ausentes', '✅ Nenhuma — todas as 24 tabelas existem'
WHERE (
  SELECT count(*) FROM unnest(ARRAY[
    'profiles','clientes','servicos','agendamentos','produtos',
    'movimentacoes_estoque','fidelidade_config','fidelidade_pontos',
    'fidelidade_historico','promocoes','portfolio','vendas','venda_itens',
    'avaliacoes','metas_mensais','audit_log','backup_log','despesas',
    'horarios_trabalho','bloqueios_agenda','configuracoes',
    'notificacoes_internas','recorrencias','contas'
  ]) AS t
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = t
  )
) = 0;

-- ── 2. RLS HABILITADO ─────────────────────────────────────────────────────
SELECT '2. Tabelas SEM RLS' AS etapa,
       string_agg(tablename, ', ') AS resultado
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN ('supabase_migrations')
  AND NOT rowsecurity
HAVING count(*) > 0
UNION ALL
SELECT '2. Tabelas SEM RLS',
       '✅ RLS ativo em todas as tabelas'
WHERE NOT EXISTS (
  SELECT 1 FROM pg_tables
  WHERE schemaname = 'public' AND NOT rowsecurity
);

-- ── 3. POLÍTICAS own_* / verificar_acesso ─────────────────────────────────
SELECT '3. Tabelas sem política de acesso próprio' AS etapa,
       string_agg(relname, ', ') AS resultado
FROM (
  SELECT c.relname
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname NOT LIKE 'supabase_migrations'
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename = c.relname
        AND (p.policyname LIKE 'own_%' OR p.policyname LIKE 'contas_own%')
    )
) sub
HAVING count(*) > 0
UNION ALL
SELECT '3. Tabelas sem política de acesso próprio',
       '✅ Todas possuem políticas own_*'
WHERE NOT EXISTS (
  SELECT 1 FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename = c.relname
        AND (p.policyname LIKE 'own_%' OR p.policyname LIKE 'contas_own%')
    )
);

-- Quantas políticas usam verificar_acesso (esperado: ~todas as own_*)
SELECT '3b. Políticas com verificar_acesso: ' ||
       count(*)::text || ' (total de políticas own_*: ' ||
       (SELECT count(*) FROM pg_policies
        WHERE schemaname = 'public' AND policyname LIKE 'own_%')::text || ')'
AS etapa, '✅ defesa em profundidade' AS resultado
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual LIKE '%verificar_acesso%' OR with_check LIKE '%verificar_acesso%');

-- ── 4. FUNÇÕES-CHAVE ──────────────────────────────────────────────────────
SELECT '4. Funções ausentes' AS etapa,
       string_agg(f, ', ') AS resultado
FROM (
  SELECT 'funcao_faltando:' || f AS f
  FROM unnest(ARRAY[
    'verificar_acesso','agendar_servico','criar_avaliacao',
    'definir_admin','atualizar_status_expirados','fluxo_caixa_projetado',
    'handle_new_user','set_updated_at'
  ]) AS f
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = f
  )
) sub
HAVING count(*) > 0
UNION ALL
SELECT '4. Funções ausentes', '✅ Todas as 8 funções existem'
WHERE (
  SELECT count(*) FROM unnest(ARRAY[
    'verificar_acesso','agendar_servico','criar_avaliacao',
    'definir_admin','atualizar_status_expirados','fluxo_caixa_projetado',
    'handle_new_user','set_updated_at'
  ]) AS f
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = f
  )
) = 0;

-- ── 5. TRIGGERS ───────────────────────────────────────────────────────────
SELECT '5. Triggers ausentes' AS etapa, string_agg(t, ', ') AS resultado
FROM (
  SELECT 'trigger_faltando:' || t AS t
  FROM unnest(ARRAY[
    'on_auth_user_created','trg_profiles_u','trg_clientes_u',
    'trg_servicos_u','trg_agendamentos_u','trg_despesas_u',
    'trg_configuracoes_u','trg_recorrencias_u'
  ]) AS t
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = t AND NOT tgisinternal
  )
) sub
HAVING count(*) > 0
UNION ALL
SELECT '5. Triggers ausentes', '✅ Todos os triggers existem'
WHERE (
  SELECT count(*) FROM unnest(ARRAY[
    'on_auth_user_created','trg_profiles_u','trg_clientes_u',
    'trg_servicos_u','trg_agendamentos_u','trg_despesas_u',
    'trg_configuracoes_u','trg_recorrencias_u'
  ]) AS t
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = t AND NOT tgisinternal
  )
) = 0;

-- ── 6. ÍNDICES DE PERFORMANCE ─────────────────────────────────────────────
SELECT '6. Índices ausentes' AS etapa, string_agg(i, ', ') AS resultado
FROM (
  SELECT 'indice_faltando:' || i AS i
  FROM unnest(ARRAY[
    'idx_agendamentos_user_status_data','idx_agendamentos_user_data_status',
    'idx_clientes_user_telefone','idx_portfolio_user_publico',
    'idx_avaliacoes_user_publico','idx_promocoes_user_ativo',
    'idx_despesas_user','idx_notificacoes_user','idx_recorrencias_proxima',
    'idx_contas_status','idx_contas_fonte'
  ]) AS i
  WHERE NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = i)
) sub
HAVING count(*) > 0
UNION ALL
SELECT '6. Índices ausentes', '✅ Todos os índices existem'
WHERE (
  SELECT count(*) FROM unnest(ARRAY[
    'idx_agendamentos_user_status_data','idx_agendamentos_user_data_status',
    'idx_clientes_user_telefone','idx_portfolio_user_publico',
    'idx_avaliacoes_user_publico','idx_promocoes_user_ativo',
    'idx_despesas_user','idx_notificacoes_user','idx_recorrencias_proxima',
    'idx_contas_status','idx_contas_fonte'
  ]) AS i
  WHERE NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = i)
) = 0;

-- ── 7. PRIVILÉGIOS DO ANON (não deve ter NADA em tabelas de dados) ────────
SELECT '7. Grants anon em tabelas de dados' AS etapa,
       string_agg(table_name || '.' || privilege_type, ', ') AS resultado
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
  AND table_schema = 'public'
  AND table_name IN (
    'profiles','clientes','servicos','agendamentos','produtos',
    'movimentacoes_estoque','fidelidade_config','fidelidade_pontos',
    'fidelidade_historico','promocoes','portfolio','vendas','venda_itens',
    'avaliacoes','metas_mensais','audit_log','backup_log','despesas',
    'horarios_trabalho','bloqueios_agenda','configuracoes',
    'notificacoes_internas','recorrencias','contas'
  )
HAVING count(*) > 0
UNION ALL
SELECT '7. Grants anon em tabelas de dados',
       '✅ anon não tem nenhum privilégio nas tabelas de dados'
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.role_table_grants
  WHERE grantee = 'anon'
    AND table_schema = 'public'
    AND table_name IN (
      'profiles','clientes','servicos','agendamentos','produtos',
      'movimentacoes_estoque','fidelidade_config','fidelidade_pontos',
      'fidelidade_historico','promocoes','portfolio','vendas','venda_itens',
      'avaliacoes','metas_mensais','audit_log','backup_log','despesas',
      'horarios_trabalho','bloqueios_agenda','configuracoes',
      'notificacoes_internas','recorrencias','contas'
    )
);

-- ── 8. PG_CRON (expiração automática de contas) ───────────────────────────
SELECT '8. Cron expirar-contas' AS etapa,
       CASE
         WHEN NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
           THEN '⚠️ pg_cron NÃO habilitado (opcional — RLS já bloqueia expirados; habilite em Database → Extensions se quiser o job)'
         WHEN EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expirar-contas')
           THEN '✅ Job agendado (diário 03:00)'
         ELSE '⚠️ pg_cron habilitado mas job não criado — rode: SELECT cron.schedule(''expirar-contas'', ''0 3 * * *'', $$SELECT public.atualizar_status_expirados()$$);'
       END AS resultado;

-- ── 9. ACESSO ADMIN ───────────────────────────────────────────────────────
SELECT '9. Administradores atuais' AS etapa,
       COALESCE(string_agg(u.email, ', '), '⚠️ NENHUM admin definido — rode: SELECT public.definir_admin(''seu-email@exemplo.com'');') AS resultado
FROM public.contas c
JOIN auth.users u ON u.id = c.user_id
WHERE c.is_admin = true;

-- =============================================================================
-- FIM — Se todas as linhas mostrarem ✅ (ou ⚠️ aceitável), o banco está CONFORME.
-- =============================================================================
