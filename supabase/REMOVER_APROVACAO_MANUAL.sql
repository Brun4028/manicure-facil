-- =============================================================================
-- REMOVER_APROVACAO_MANUAL.sql
-- -----------------------------------------------------------------------------
-- COMO USAR:
--   1) Abra o SQL Editor do Supabase: https://supabase.com/dashboard
--      project xirthhekebwmnldrefbx → SQL Editor → New query.
--   2) Cole TODO este arquivo e execute (Run). Pode rodar mais de uma vez
--      com segurança (idempotente).
--   3) Depois faça o deploy do app e teste: cadastro por e-mail, login por
--      e-mail e login com Google entram direto no painel.
--
-- O QUE FAZ (remoção total da aprovação manual):
--   1. Toda conta nova (e-mail, Google, convite do admin, qualquer método)
--      nasce ATIVA — o trigger handle_new_user não diferencia mais origem.
--   2. Todas as contas existentes com status 'inativo' (aguardando liberação)
--      passam a 'ativo' automaticamente — ninguém precisa mais de aprovação.
--   3. public.verificar_acesso() passa a retornar sempre true: as políticas
--      RLS own_* (que a referenciam) deixam de bloquear por status.
--   4. O DEFAULT da coluna status vira 'ativo'.
--
-- NÃO altera layouts, rotas nem funcionalidades do app. Os status
-- 'bloqueado'/'suspenso' existentes não são mexidos (nenhuma regra de acesso
-- depende mais de status).
-- =============================================================================

-- 1) Contas novas já nascem 'ativo' por padrão
ALTER TABLE public.contas
  ALTER COLUMN status SET DEFAULT 'ativo';

-- 2) Backfill: contas aguardando liberação manual passam a ativas
UPDATE public.contas
   SET status = 'ativo'::public.conta_status, atualizado_em = now()
 WHERE status = 'inativo';

-- 3) verificar_acesso() sempre true (mantida por compatibilidade das
--    políticas own_*; bloqueio por status removido)
CREATE OR REPLACE FUNCTION public.verificar_acesso()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT true;
$$;

REVOKE EXECUTE ON FUNCTION public.verificar_acesso() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verificar_acesso() TO authenticated;

-- 4) Trigger handle_new_user: toda conta nasce ATIVA (sem diferenciação de
--    origem — e-mail, Google, convite do admin etc.)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nome)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));

  INSERT INTO public.servicos (user_id, nome, valor, custo, duracao_min) VALUES
    (NEW.id, 'Unha Simples', 35, 5, 45),
    (NEW.id, 'Unha em Gel', 90, 20, 90),
    (NEW.id, 'Pé e Mão', 70, 10, 90),
    (NEW.id, 'Alongamento', 150, 40, 120);

  INSERT INTO public.fidelidade_config (user_id, ativo, pontos_por_real, pontos_resgate, premio_resgate, niver_promo_ativa, niver_desconto_porcentagem, niver_dias_validade)
  VALUES (NEW.id, false, 1.00, 100, 'Pé e Mão Simples', false, 10.00, 7);

  INSERT INTO public.configuracoes (user_id, empresa_nome)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', 'Meu Salão'));

  INSERT INTO public.horarios_trabalho (user_id, dia_semana, hora_inicio, hora_fim)
  VALUES
    (NEW.id, 1, '08:00', '18:00'),
    (NEW.id, 2, '08:00', '18:00'),
    (NEW.id, 3, '08:00', '18:00'),
    (NEW.id, 4, '08:00', '18:00'),
    (NEW.id, 5, '08:00', '18:00')
  ON CONFLICT (user_id, dia_semana) DO NOTHING;

  -- Conta nasce ATIVA para qualquer método de cadastro. Sem aprovação manual.
  INSERT INTO public.contas (user_id, status)
  VALUES (NEW.id, 'ativo'::public.conta_status)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -----------------------------------------------------------------------------
-- VERIFICACAO (opcional)
-- -----------------------------------------------------------------------------
-- 1) Não deve existir nenhuma conta 'inativo':
-- SELECT status, count(*) AS total
--   FROM public.contas
--  GROUP BY status
--  ORDER BY status;

-- 2) verificar_acesso() deve retornar true para qualquer usuário:
-- SELECT public.verificar_acesso();
