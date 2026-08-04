-- =============================================================================
-- Migration: Controle de Acesso SaaS (preparação para Kirvano)
-- Date: 2026-08-04
--
-- OBJETIVOS:
--   1. Status de conta (ativo/inativo/bloqueado/suspenso) com validação NO BANCO
--   2. Bloqueio imediato: qualquer conta não-'ativo' perde acesso aos dados
--      instantaneamente via RLS (verificar_acesso em todas as políticas own_*)
--   3. Corrigir VAZAMENTOS críticos de RLS (dados de todos os usuários legíveis
--      publicamente) e inserts anônimos sem validação
--   4. Estrutura pronta para Kirvano (plano, fonte, transação, trial, renovação)
--   5. Reconstruir vw_dre_mensal com security_invoker (antes ignorava RLS)
--   6. Funções de agendamento/avaliação públicas agora exigem conta ativa
--
-- NOTA: Nenhuma política pública (anon) é necessária: a página pública de
-- agendamento passou a usar server functions (service_role) no backend.
-- =============================================================================

-- =============================================================================
-- 1. STATUS DE CONTA (enum)
-- =============================================================================
CREATE TYPE public.conta_status AS ENUM ('ativo', 'inativo', 'bloqueado', 'suspenso');

-- =============================================================================
-- 2. TABELA DE CONTAS (acesso / plano / trial / renovação)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.contas (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Status de acesso: 'ativo' = pode usar o sistema
  status public.conta_status NOT NULL DEFAULT 'inativo',
  -- Administradora do SaaS (dona do produto)
  is_admin BOOLEAN NOT NULL DEFAULT false,
  -- Plano/assinatura futura (ex.: 'mensal', 'anual', 'vitalicio')
  plano TEXT,
  -- Origem da conta: 'kirvano' | 'admin' | 'email'
  fonte TEXT NOT NULL DEFAULT 'admin',
  -- ID da transação Kirvano (futuro webhook)
  kirvano_transacao_id TEXT,
  -- Período de teste gratuito (opcional)
  trial_inicio TIMESTAMPTZ,
  trial_fim TIMESTAMPTZ,
  -- Fim do acesso (renovação). NULL = sem expiração
  acesso_termina_em TIMESTAMPTZ,
  -- Motivo de bloqueio/suspensão (visível para o usuário)
  motivo_bloqueio TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contas_status ON public.contas(status);
CREATE INDEX IF NOT EXISTS idx_contas_fonte ON public.contas(fonte);

GRANT SELECT ON public.contas TO authenticated;
GRANT ALL ON public.contas TO service_role;

-- Defesa em profundidade: os privilégios padrão do Supabase concedem ALL ao
-- authenticated em tabelas novas; o RLS já nega escrita (sem política), mas
-- deixamos a negação explícita.
REVOKE INSERT, UPDATE, DELETE ON public.contas FROM authenticated;

ALTER TABLE public.contas ENABLE ROW LEVEL SECURITY;

-- O usuário pode LER apenas a PRÓPRIA linha de contas (necessário para exibir
-- status/motivo de bloqueio). NÃO pode inserir/atualizar (só service_role).
-- Obs.: esta política NÃO usa verificar_acesso() de propósito — um usuário
-- bloqueado precisa conseguir ver o próprio status.
CREATE POLICY "contas_own_select" ON public.contas
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- =============================================================================
-- 3. FUNÇÃO verificar_acesso() — fonte da verdade de acesso
-- =============================================================================
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

-- =============================================================================
-- 4. BACKFILL: usuários existentes continuam ativos (dados já existentes)
-- =============================================================================
-- Após aplicar, promova-se a admin:
--   SELECT public.definir_admin('seu-email@exemplo.com');
INSERT INTO public.contas (user_id, status)
SELECT id, 'ativo'::public.conta_status
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- =============================================================================
-- 5. TRIGGER handle_new_user: cria a linha de contas (status 'inativo')
-- =============================================================================
-- Novos usuários (convidados) NASCEM sem acesso. A liberação é feita pelo
-- painel admin ou pelo futuro webhook da Kirvano.
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

  -- Conta nasce SEM acesso (status 'inativo') até ser liberada
  INSERT INTO public.contas (user_id, status, fonte)
  VALUES (NEW.id, 'inativo'::public.conta_status, 'admin')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================================
-- 6. REMOVER POLÍTICAS PÚBLICAS (anon) — VAZAMENTOS DE DADOS
-- =============================================================================
-- A página pública /agendar/:id agora usa server functions (service_role).
-- Nenhum acesso anon é necessário em tabelas com dados de clientes.

DROP POLICY IF EXISTS "allow public select profiles" ON public.profiles;
DROP POLICY IF EXISTS "allow public select servicos" ON public.servicos;
DROP POLICY IF EXISTS "allow public select clientes" ON public.clientes;
DROP POLICY IF EXISTS "public_select_clientes_by_user_id" ON public.clientes;
DROP POLICY IF EXISTS "public_insert_clientes_for_booking" ON public.clientes;
DROP POLICY IF EXISTS "allow public select agendamentos" ON public.agendamentos;
DROP POLICY IF EXISTS "public_select_agendamentos_for_availability" ON public.agendamentos;
DROP POLICY IF EXISTS "public_insert_agendamentos_for_booking" ON public.agendamentos;
DROP POLICY IF EXISTS "public_insert_avaliacoes" ON public.avaliacoes;
DROP POLICY IF EXISTS "public_select_avaliacoes" ON public.avaliacoes;
DROP POLICY IF EXISTS "public_select_portfolio" ON public.portfolio;
DROP POLICY IF EXISTS "public_select_promocoes" ON public.promocoes;
DROP POLICY IF EXISTS "public_select_fidelidade_config_limited" ON public.fidelidade_config;

-- Reforço: o papel anon NÃO deve ter NENHUM privilégio nas tabelas de dados.
-- O Supabase aplica privilégios padrão (GRANT ALL) ao anon em tabelas novas,
-- então revogamos explicitamente em TODAS as tabelas (defesa em profundidade;
-- a ausência de políticas RLS já nega o acesso, isto torna a negação explícita).
REVOKE ALL ON public.contas FROM anon;
REVOKE ALL ON public.clientes FROM anon;
REVOKE ALL ON public.agendamentos FROM anon;
REVOKE ALL ON public.servicos FROM anon;
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.fidelidade_config FROM anon;
REVOKE ALL ON public.fidelidade_pontos FROM anon;
REVOKE ALL ON public.fidelidade_historico FROM anon;
REVOKE ALL ON public.avaliacoes FROM anon;
REVOKE ALL ON public.portfolio FROM anon;
REVOKE ALL ON public.promocoes FROM anon;
REVOKE ALL ON public.vendas FROM anon;
REVOKE ALL ON public.venda_itens FROM anon;
REVOKE ALL ON public.produtos FROM anon;
REVOKE ALL ON public.movimentacoes_estoque FROM anon;
REVOKE ALL ON public.metas_mensais FROM anon;
REVOKE ALL ON public.despesas FROM anon;
REVOKE ALL ON public.horarios_trabalho FROM anon;
REVOKE ALL ON public.bloqueios_agenda FROM anon;
REVOKE ALL ON public.configuracoes FROM anon;
REVOKE ALL ON public.notificacoes_internas FROM anon;
REVOKE ALL ON public.recorrencias FROM anon;
REVOKE ALL ON public.audit_log FROM anon;
REVOKE ALL ON public.backup_log FROM anon;

-- =============================================================================
-- 7. REFORÇAR POLÍTICAS own_* COM verificar_acesso() (BLOQUEIO IMEDIATO)
-- =============================================================================
-- Qualquer conta com status != 'ativo' (ou expirada) deixa de ENXERGAR e
-- MODIFICAR os próprios dados no mesmo instante, mesmo com sessão ativa.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clientes', 'servicos', 'agendamentos', 'produtos',
    'movimentacoes_estoque', 'fidelidade_config', 'fidelidade_pontos',
    'fidelidade_historico', 'promocoes', 'portfolio', 'vendas',
    'venda_itens', 'metas_mensais', 'despesas', 'horarios_trabalho',
    'configuracoes', 'notificacoes_internas', 'recorrencias'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS own_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY own_%I ON public.%I FOR ALL TO authenticated
         USING (auth.uid() = user_id AND public.verificar_acesso())
         WITH CHECK (auth.uid() = user_id AND public.verificar_acesso())',
      t, t
    );
  END LOOP;
END $$;

-- profiles (coluna id, não user_id)
DROP POLICY IF EXISTS "own_profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "own_profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "own_profiles_update" ON public.profiles;
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

-- bloqueios_agenda (nome de política own_bloqueios)
DROP POLICY IF EXISTS "own_bloqueios" ON public.bloqueios_agenda;
CREATE POLICY "own_bloqueios" ON public.bloqueios_agenda
  FOR ALL TO authenticated
  USING (auth.uid() = user_id AND public.verificar_acesso())
  WITH CHECK (auth.uid() = user_id AND public.verificar_acesso());

-- backup_log (nome de política own_backup_log)
DROP POLICY IF EXISTS "own_backup_log" ON public.backup_log;
CREATE POLICY "own_backup_log" ON public.backup_log
  FOR ALL TO authenticated
  USING (auth.uid() = user_id AND public.verificar_acesso())
  WITH CHECK (auth.uid() = user_id AND public.verificar_acesso());

-- audit_log (duas políticas)
DROP POLICY IF EXISTS "own_audit_log_insert" ON public.audit_log;
DROP POLICY IF EXISTS "own_audit_log_select" ON public.audit_log;
CREATE POLICY "own_audit_log_insert" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.verificar_acesso());
CREATE POLICY "own_audit_log_select" ON public.audit_log
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND public.verificar_acesso());

-- =============================================================================
-- 8. RECONSTRUIR vw_dre_mensal COM security_invoker (ANTES IGNORAVA RLS!)
-- =============================================================================
DROP VIEW IF EXISTS public.vw_dre_mensal;

CREATE VIEW public.vw_dre_mensal
WITH (security_invoker = true)
AS
SELECT
  a.user_id,
  DATE_TRUNC('month', a.data_hora)::date AS mes,
  'Receita de Serviços' AS conta,
  SUM(a.valor) AS valor,
  'receita' AS tipo
FROM public.agendamentos a
WHERE a.status = 'concluido'
GROUP BY a.user_id, DATE_TRUNC('month', a.data_hora)
UNION ALL
SELECT
  d.user_id,
  DATE_TRUNC('month', d.data_vencimento)::date AS mes,
  CASE
    WHEN d.categoria = 'aluguel' THEN 'Aluguel'
    WHEN d.categoria = 'energia' THEN 'Energia Elétrica'
    WHEN d.categoria = 'agua' THEN 'Água'
    WHEN d.categoria = 'salario' THEN 'Salários'
    WHEN d.categoria = 'comissao' THEN 'Comissões'
    WHEN d.categoria = 'produto' THEN 'Insumos e Produtos'
    WHEN d.categoria = 'marketing' THEN 'Marketing e Publicidade'
    WHEN d.categoria = 'imposto' THEN 'Impostos e Taxas'
    WHEN d.categoria = 'internet' THEN 'Internet e Telefone'
    WHEN d.categoria = 'manutencao' THEN 'Manutenção'
    WHEN d.categoria = 'prolabore' THEN 'Pró-labore'
    WHEN d.categoria = 'seguro' THEN 'Seguros'
    ELSE 'Outras Despesas'
  END AS conta,
  d.valor,
  'despesa' AS tipo
FROM public.despesas d
WHERE d.pago = true;

GRANT SELECT ON public.vw_dre_mensal TO authenticated;
-- Com security_invoker, as políticas RLS de agendamentos/despesas se aplicam
-- ao usuário que consulta a view: cada um vê APENAS os próprios dados.

-- =============================================================================
-- 9. FUNÇÕES PÚBLICAS: exigir conta ATIVA
-- =============================================================================
-- agendar_servico: agora recusa agendamentos para contas bloqueadas/inativas
CREATE OR REPLACE FUNCTION public.agendar_servico(
  p_user_id UUID,
  p_cliente_nome TEXT,
  p_cliente_telefone TEXT,
  p_cliente_email TEXT DEFAULT NULL,
  p_cliente_data_nascimento DATE DEFAULT NULL,
  p_cliente_observacoes TEXT DEFAULT NULL,
  p_servico_id UUID DEFAULT NULL,
  p_data_hora TIMESTAMPTZ DEFAULT NULL,
  p_observacoes TEXT DEFAULT NULL,
  -- Preço final calculado NO SERVIDOR (descontos). O cliente nunca controla valores.
  p_valor_final NUMERIC(10,2) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cliente_id UUID;
  v_servico RECORD;
  v_agendamento_id UUID;
  v_conflito BOOLEAN;
  v_valor_final NUMERIC(10,2);
BEGIN
  -- Conta da manicure deve estar ATIVA para receber agendamentos
  IF NOT EXISTS (
    SELECT 1 FROM public.contas c
    WHERE c.user_id = p_user_id
      AND c.status = 'ativo'
      AND (c.acesso_termina_em IS NULL OR c.acesso_termina_em > now())
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agenda indisponível no momento');
  END IF;

  -- Validações básicas
  IF p_cliente_nome IS NULL OR trim(p_cliente_nome) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nome do cliente é obrigatório');
  END IF;

  IF p_cliente_telefone IS NULL OR trim(p_cliente_telefone) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Telefone do cliente é obrigatório');
  END IF;

  IF p_servico_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Serviço não informado');
  END IF;

  IF p_data_hora IS NULL OR p_data_hora < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Data/hora inválida ou no passado');
  END IF;

  -- Verifica se o serviço existe e está ativo
  SELECT id, nome, valor, custo, duracao_min, ativo
  INTO v_servico
  FROM public.servicos
  WHERE id = p_servico_id AND user_id = p_user_id AND ativo = true;

  IF v_servico.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Serviço não encontrado ou inativo');
  END IF;

  -- Verifica conflito de horário
  SELECT EXISTS (
    SELECT 1 FROM public.agendamentos
    WHERE user_id = p_user_id
      AND status != 'cancelado'
      AND data_hora < p_data_hora + (v_servico.duracao_min || ' minutes')::INTERVAL
      AND data_hora + (duracao_min || ' minutes')::INTERVAL > p_data_hora
  ) INTO v_conflito;

  IF v_conflito THEN
    RETURN jsonb_build_object('success', false, 'error', 'Conflito de horário');
  END IF;

  -- Preço final: usa o calculado no servidor se informado, senão o valor do serviço
  v_valor_final := ROUND(COALESCE(p_valor_final, v_servico.valor), 2);
  IF v_valor_final < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valor inválido');
  END IF;

  -- Busca ou cria cliente
  SELECT id INTO v_cliente_id
  FROM public.clientes
  WHERE user_id = p_user_id AND telefone = p_cliente_telefone
  LIMIT 1;

  IF v_cliente_id IS NULL THEN
    INSERT INTO public.clientes (user_id, nome, telefone, email, data_nascimento, observacoes)
    VALUES (p_user_id, p_cliente_nome, p_cliente_telefone, p_cliente_email, p_cliente_data_nascimento, p_cliente_observacoes)
    RETURNING id INTO v_cliente_id;
  END IF;

  -- Cria o agendamento
  INSERT INTO public.agendamentos (
    user_id, cliente_id, servico_id, data_hora, duracao_min,
    valor, custo, status, pagamento, observacoes
  ) VALUES (
    p_user_id, v_cliente_id, p_servico_id, p_data_hora, v_servico.duracao_min,
    v_valor_final, v_servico.custo, 'agendado', 'pendente', p_observacoes
  )
  RETURNING id INTO v_agendamento_id;

  -- Registra no audit log
  INSERT INTO public.audit_log (user_id, acao, entidade, entidade_id, detalhes)
  VALUES (p_user_id, 'create', 'agendamento', v_agendamento_id::TEXT,
    jsonb_build_object(
      'source', 'public_booking',
      'cliente_nome', p_cliente_nome,
      'servico', v_servico.nome,
      'valor', v_servico.valor
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'agendamento_id', v_agendamento_id,
    'message', 'Agendamento realizado com sucesso'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.agendar_servico FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agendar_servico TO service_role;

-- criar_avaliacao: idem
CREATE OR REPLACE FUNCTION public.criar_avaliacao(
  p_user_id UUID,
  p_cliente_nome TEXT,
  p_nota INTEGER,
  p_comentario TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.contas c
    WHERE c.user_id = p_user_id
      AND c.status = 'ativo'
      AND (c.acesso_termina_em IS NULL OR c.acesso_termina_em > now())
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Conta indisponível');
  END IF;

  IF p_cliente_nome IS NULL OR trim(p_cliente_nome) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nome é obrigatório');
  END IF;

  IF p_nota IS NULL OR p_nota < 1 OR p_nota > 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nota deve ser entre 1 e 5');
  END IF;

  IF p_comentario IS NOT NULL AND length(trim(p_comentario)) > 1000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Comentário muito longo (máx. 1000 caracteres)');
  END IF;

  INSERT INTO public.avaliacoes (user_id, cliente_nome, nota, comentario, publico)
  VALUES (p_user_id, p_cliente_nome, p_nota, p_comentario, true)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'avaliacao_id', v_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.criar_avaliacao FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_avaliacao TO service_role;

-- =============================================================================
-- 10. UTILITÁRIOS DE ADMINISTRAÇÃO
-- =============================================================================

-- Promove um usuário a admin (chamar via SQL console ou service_role)
CREATE OR REPLACE FUNCTION public.definir_admin(p_email TEXT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.contas c
  SET is_admin = true, atualizado_em = now()
  FROM auth.users u
  WHERE u.id = c.user_id AND lower(u.email) = lower(p_email);
$$;

-- SECURITY DEFINER proposital, mas INEXECUTÁVEL por anon/authenticated:
REVOKE EXECUTE ON FUNCTION public.definir_admin FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.definir_admin TO service_role;

-- Expira automaticamente contas cujo acesso terminou (chamar via cron futuro:
-- SELECT public.atualizar_status_expirados();)
CREATE OR REPLACE FUNCTION public.atualizar_status_expirados()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_contador integer;
BEGIN
  UPDATE public.contas
  SET status = 'inativo'::public.conta_status, atualizado_em = now()
  WHERE status = 'ativo'::public.conta_status
    AND acesso_termina_em IS NOT NULL
    AND acesso_termina_em <= now();
  GET DIAGNOSTICS v_contador = ROW_COUNT;
  RETURN v_contador;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.atualizar_status_expirados FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_status_expirados TO service_role;
