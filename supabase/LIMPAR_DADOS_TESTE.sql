-- =============================================================================
-- LIMPAR_DADOS_TESTE.sql — Remover dados de teste antes de vender
-- =============================================================================
-- Execute este script NO SQL EDITOR do Supabase ANTES de entregar o projeto.
-- Ele remove todos os dados de demonstração, mantendo apenas a estrutura
-- (tabelas, funções, triggers, políticas RLS).
--
-- ⚠️ ATENÇÃO: Esta ação é IRREVERSÍVEL. Faça um backup antes se necessário.
-- =============================================================================

-- ─── 1. Dados de clientes, agendamentos, vendas ─────────────────────────────
-- Remove todos os registros de demonstração

DELETE FROM public.venda_itens;
DELETE FROM public.vendas;
DELETE FROM public.agendamentos;
DELETE FROM public.clientes;
DELETE FROM public.avaliacoes;

-- ─── 2. Estoque e movimentações ─────────────────────────────────────────────

DELETE FROM public.movimentacoes_estoque;
DELETE FROM public.produtos;

-- ─── 3. Financeiro ──────────────────────────────────────────────────────────

DELETE FROM public.despesas;
DELETE FROM public.metas_mensais;

-- ─── 4. Fidelidade ──────────────────────────────────────────────────────────

DELETE FROM public.fidelidade_historico;
DELETE FROM public.fidelidade_pontos;

-- ─── 5. Marketing e portfólio ───────────────────────────────────────────────

DELETE FROM public.promocoes;
DELETE FROM public.portfolio;

-- ─── 6. Configurações e horários (mantém padrões do trigger) ────────────────

DELETE FROM public.horarios_trabalho;
DELETE FROM public.bloqueios_agenda;
DELETE FROM public.configuracoes;
DELETE FROM public.notificacoes_internas;

-- ─── 7. Recorrências e auditoria ────────────────────────────────────────────

DELETE FROM public.recorrencias;
DELETE FROM public.audit_log;
DELETE FROM public.backup_log;

-- ─── 8. Contas (mantém apenas a sua como admin) ────────────────────────────
-- ⚠️ NÃO delete sua própria conta! Substitua o email abaixo.

-- Primeiro, identifique seu user_id:
-- SELECT id, email FROM auth.users WHERE email = 'SEU_EMAIL_AQUI';

-- Depois, delete todas as contas EXETO a sua:
-- DELETE FROM public.contas WHERE user_id NOT IN (
--   SELECT id FROM auth.users WHERE email = 'SEU_EMAIL_AQUI'
-- );

-- ─── 9. Usuários de teste (OPCIONAL - requer service_role) ──────────────────
-- ⚠️ Só execute se tiver certeza que quer remover outros usuários criados

-- Liste todos os usuários primeiro:
-- SELECT id, email, created_at FROM auth.users ORDER BY created_at;

-- Para remover um usuário específico (use o service_role key):
-- SELECT auth.admin.delete_user('ID_DO_USUARIO_AQUI');

-- ⚠️ NÃO delete sua própria conta admin!

-- ─── 10. Profiles de teste ──────────────────────────────────────────────────
-- Mantém apenas o profile do admin

-- DELETE FROM public.profiles WHERE id NOT IN (
--   SELECT id FROM auth.users WHERE email = 'SEU_EMAIL_AQUI'
-- );

-- =============================================================================
-- VERIFICAÇÃO: Rode estas queries para confirmar que tudo foi limpo
-- =============================================================================

SELECT 'clientes' as tabela, COUNT(*) as registros FROM public.clientes
UNION ALL
SELECT 'agendamentos', COUNT(*) FROM public.agendamentos
UNION ALL
SELECT 'vendas', COUNT(*) FROM public.vendas
UNION ALL
SELECT 'produtos', COUNT(*) FROM public.produtos
UNION ALL
SELECT 'despesas', COUNT(*) FROM public.despesas
UNION ALL
SELECT 'avaliacoes', COUNT(*) FROM public.avaliacoes
UNION ALL
SELECT 'portfolio', COUNT(*) FROM public.portfolio
UNION ALL
SELECT 'promocoes', COUNT(*) FROM public.promocoes
UNION ALL
SELECT 'fidelidade_pontos', COUNT(*) FROM public.fidelidade_pontos
UNION ALL
SELECT 'contas', COUNT(*) FROM public.contas
UNION ALL
SELECT 'profiles', COUNT(*) FROM public.profiles;

-- Esperado: todas as tabelas devem ter 0 registros (exceto contas e profiles
-- que terão apenas sua conta admin).
