-- =============================================================================
-- OPCIONAL — Expiração automática de contas via pg_cron
-- =============================================================================
-- COMO USAR: Supabase Dashboard -> SQL Editor -> colar -> Run.
--
-- IMPORTANTE: este script é OPCIONAL (melhoria/higiene de dados).
-- O bloqueio de contas expiradas JÁ funciona sem ele, via RLS
-- (public.verificar_acesso() em todas as políticas own_*): uma conta com
-- acesso_termina_em no passado deixa de enxergar/modificar dados no mesmo
-- instante. Este job apenas atualiza o status para 'inativo' diariamente
-- às 03:00 (limpeza de dados / status correto no painel admin).
--
-- Requisitos:
--   1. Habilitar a extensão pg_cron (Database > Extensions > pg_cron > Enable)
--      — o bloco abaixo já tenta habilitar via SQL, mas o dashboard é o caminho
--        garantido.
--   2. A função public.atualizar_status_expirados() já existe (criada na
--      migration 20260804000000_saas_access_control.sql).
-- =============================================================================

-- 1) Habilita pg_cron (idempotente)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2) Agenda o job (idempotente — não recria se já existir)
-- NOTA: o comando do cron usa a tag $cron$ (não $$) para não conflitar com
-- o delimitador do bloco DO ... $$ ... $$ (dollar-quoting do PostgreSQL).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expirar-contas') THEN
    PERFORM cron.schedule(
      'expirar-contas',            -- nome do job
      '0 3 * * *',                 -- todos os dias às 03:00 (UTC)
      $cron$SELECT public.atualizar_status_expirados();$cron$
    );
  END IF;
END $$;

-- 3) Confirmação: deve listar o job 'expirar-contas'
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname = 'expirar-contas';

-- =============================================================================
-- Para REMOVER o job (se um dia quiser desativar):
--   SELECT cron.unschedule('expirar-contas');
-- =============================================================================
