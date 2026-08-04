-- =============================================================================
-- MANICURE FÁCIL — APLICAÇÃO COMPLETA (v4 FINAL — cria TODAS as tabelas faltantes)
-- =============================================================================
-- COMO USAR: Supabase Dashboard -> SQL Editor -> colar TUDO -> Run.
-- 100% idempotente: pode rodar de novo sem quebrar nada.
--
-- ESTE SCRIPT CRIA (se não existirem) E CONFIGURA:
--   Parte A: contas, audit_log, backup_log, despesas, horarios_trabalho,
--            bloqueios_agenda, configuracoes, notificacoes_internas, recorrencias
--   Parte B: handle_new_user completo + backfill (usuários atuais ficam ATIVOS)
--   Parte C: remove vazamentos públicos de RLS + políticas own_* com
--            verificar_acesso() (bloqueio instantâneo de contas inativas)
--   Parte D: vw_dre_mensal segura + fluxo_caixa_projetado
--   Parte E: agendar_servico/criar_avaliacao seguros (expediente + bloqueios)
--   Parte F: definir_admin, atualizar_status_expirados, CHECKs, índices, cron
-- =============================================================================

-- ── 1. ENUM conta_status ───────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'conta_status') THEN
    CREATE TYPE public.conta_status AS ENUM ('ativo', 'inativo', 'bloqueado', 'suspenso');
  END IF;
END $$;

-- ── 2. TABELA contas ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contas (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.conta_status NOT NULL DEFAULT 'inativo',
  is_admin BOOLEAN NOT NULL DEFAULT false,
  plano TEXT,
  fonte TEXT NOT NULL DEFAULT 'admin',
  kirvano_transacao_id TEXT,
  trial_inicio TIMESTAMPTZ,
  trial_fim TIMESTAMPTZ,
  acesso_termina_em TIMESTAMPTZ,
  motivo_bloqueio TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contas_status ON public.contas(status);
CREATE INDEX IF NOT EXISTS idx_contas_fonte ON public.contas(fonte);

GRANT SELECT ON public.contas TO authenticated;
GRANT ALL ON public.contas TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.contas FROM authenticated;

ALTER TABLE public.contas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contas_own_select" ON public.contas;
CREATE POLICY "contas_own_select" ON public.contas
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ── 3. verificar_acesso() — fonte da verdade de acesso ─────────────────────
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

-- ── 4. TABELA audit_log ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  acao TEXT NOT NULL,
  entidade TEXT NOT NULL,
  entidade_id TEXT,
  detalhes JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON public.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_acao ON public.audit_log(acao);
CREATE INDEX IF NOT EXISTS idx_audit_log_entidade ON public.audit_log(entidade);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at DESC);

GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_audit_log_insert" ON public.audit_log;
CREATE POLICY "own_audit_log_insert" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.verificar_acesso());

DROP POLICY IF EXISTS "own_audit_log_select" ON public.audit_log;
CREATE POLICY "own_audit_log_select" ON public.audit_log
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND public.verificar_acesso());

-- ── 5. TABELA backup_log ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.backup_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('manual', 'automatico', 'schedule')),
  status TEXT NOT NULL CHECK (status IN ('iniciado', 'concluido', 'falhou')),
  tamanho_bytes BIGINT,
  tabelas_incluidas TEXT[],
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.backup_log TO authenticated;
GRANT ALL ON public.backup_log TO service_role;

ALTER TABLE public.backup_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_backup_log" ON public.backup_log;
CREATE POLICY "own_backup_log" ON public.backup_log
  FOR ALL TO authenticated
  USING (auth.uid() = user_id AND public.verificar_acesso())
  WITH CHECK (auth.uid() = user_id AND public.verificar_acesso());

-- ── 6. TABELA despesas (Financeiro) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.despesas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL DEFAULT 'outros',
  subcategoria TEXT,
  descricao TEXT NOT NULL,
  valor NUMERIC(10,2) NOT NULL CHECK (valor > 0),
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  pago BOOLEAN NOT NULL DEFAULT false,
  forma_pagamento TEXT DEFAULT 'pix',
  recorrente BOOLEAN NOT NULL DEFAULT false,
  recorrencia_tipo TEXT CHECK (recorrencia_tipo IN ('mensal', 'semanal', 'trimestral', 'anual')),
  anexo_url TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_despesas_user ON public.despesas(user_id);
CREATE INDEX IF NOT EXISTS idx_despesas_user_data ON public.despesas(user_id, data_vencimento);
CREATE INDEX IF NOT EXISTS idx_despesas_categoria ON public.despesas(user_id, categoria);
CREATE INDEX IF NOT EXISTS idx_despesas_pago ON public.despesas(user_id, pago);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.despesas TO authenticated;
GRANT ALL ON public.despesas TO service_role;

ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_despesas_u ON public.despesas;
CREATE TRIGGER trg_despesas_u BEFORE UPDATE ON public.despesas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 7. TABELA horarios_trabalho (Agenda) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.horarios_trabalho (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio TIME NOT NULL,
  hora_fim TIME NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, dia_semana)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.horarios_trabalho TO authenticated;
GRANT ALL ON public.horarios_trabalho TO service_role;

ALTER TABLE public.horarios_trabalho ENABLE ROW LEVEL SECURITY;

-- Horários padrão para os usuários existentes (seg-sex 08h-18h)
INSERT INTO public.horarios_trabalho (user_id, dia_semana, hora_inicio, hora_fim)
SELECT
  u.id AS user_id,
  d.dia_semana,
  '08:00'::time AS hora_inicio,
  '18:00'::time AS hora_fim
FROM auth.users u
CROSS JOIN (VALUES (1), (2), (3), (4), (5)) AS d(dia_semana)
WHERE NOT EXISTS (
  SELECT 1 FROM public.horarios_trabalho ht WHERE ht.user_id = u.id AND ht.dia_semana = d.dia_semana
)
ON CONFLICT (user_id, dia_semana) DO NOTHING;

-- ── 8. TABELA bloqueios_agenda (Feriados/folgas) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.bloqueios_agenda (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('feriado', 'ferias', 'almoco', 'pessoal', 'folga')),
  titulo TEXT NOT NULL,
  data_inicio DATE NOT NULL,
  data_fim DATE,
  horario_inicio TIME,
  horario_fim TIME,
  recorrente_anual BOOLEAN NOT NULL DEFAULT false,
  cor TEXT DEFAULT '#EF4444',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bloqueios_user_data ON public.bloqueios_agenda(user_id, data_inicio);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bloqueios_agenda TO authenticated;
GRANT ALL ON public.bloqueios_agenda TO service_role;

ALTER TABLE public.bloqueios_agenda ENABLE ROW LEVEL SECURITY;

-- ── 9. TABELA configuracoes (Settings) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.configuracoes (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  empresa_nome TEXT,
  empresa_logo_url TEXT,
  empresa_endereco TEXT,
  empresa_telefone TEXT,
  empresa_email TEXT,
  empresa_documento TEXT,
  cor_primaria TEXT DEFAULT '#D946EF',
  cor_secundaria TEXT DEFAULT '#A855F7',
  intervalo_padrao INTEGER DEFAULT 30,
  horario_inicio_padrao TIME DEFAULT '08:00',
  horario_fim_padrao TIME DEFAULT '18:00',
  lembrete_ativo BOOLEAN DEFAULT true,
  lembrete_whatsapp BOOLEAN DEFAULT false,
  lembrete_email BOOLEAN DEFAULT true,
  lembrete_antecipacao_min INTEGER DEFAULT 60,
  notificacao_sonora BOOLEAN DEFAULT true,
  tema TEXT DEFAULT 'dark',
  idioma TEXT DEFAULT 'pt-BR',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.configuracoes TO authenticated;
GRANT ALL ON public.configuracoes TO service_role;

ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_configuracoes_u ON public.configuracoes;
CREATE TRIGGER trg_configuracoes_u BEFORE UPDATE ON public.configuracoes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 10. TABELA notificacoes_internas ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notificacoes_internas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'info' CHECK (tipo IN ('info', 'sucesso', 'aviso', 'erro', 'promocao', 'lembrete', 'aniversario')),
  lida BOOLEAN NOT NULL DEFAULT false,
  acao_texto TEXT,
  acao_link TEXT,
  entidade TEXT,
  entidade_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notificacoes_user ON public.notificacoes_internas(user_id, lida, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.notificacoes_internas TO authenticated;
GRANT ALL ON public.notificacoes_internas TO service_role;

ALTER TABLE public.notificacoes_internas ENABLE ROW LEVEL SECURITY;

-- ── 11. TABELA recorrencias (agendamentos recorrentes) ─────────────────────
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS recorrente_id UUID,
  ADD COLUMN IF NOT EXISTS is_recorrente BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.recorrencias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  servico_id UUID REFERENCES public.servicos(id) ON DELETE SET NULL,
  frequencia TEXT NOT NULL CHECK (frequencia IN ('semanal', 'quinzenal', 'mensal', 'a_cada_x_dias')),
  intervalo_dias INTEGER DEFAULT 15,
  dia_semana INTEGER CHECK (dia_semana BETWEEN 0 AND 6),
  dia_mes INTEGER CHECK (dia_mes BETWEEN 1 AND 31),
  hora TIME NOT NULL,
  duracao_min INTEGER NOT NULL DEFAULT 60,
  valor NUMERIC(10,2),
  custo NUMERIC(10,2),
  observacoes TEXT,
  data_inicio DATE NOT NULL,
  data_fim DATE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  proxima_geracao DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recorrencias_user ON public.recorrencias(user_id);
CREATE INDEX IF NOT EXISTS idx_recorrencias_proxima ON public.recorrencias(proxima_geracao, ativo);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recorrencias TO authenticated;
GRANT ALL ON public.recorrencias TO service_role;

ALTER TABLE public.recorrencias ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_recorrencias_u ON public.recorrencias;
CREATE TRIGGER trg_recorrencias_u BEFORE UPDATE ON public.recorrencias FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 12. handle_new_user COMPLETO (trigger on_auth_user_created JA existe) ──
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

-- ── 13. BACKFILL: usuários existentes continuam ATIVOS ─────────────────────
INSERT INTO public.contas (user_id, status)
SELECT id, 'ativo'::public.conta_status
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- ── 14. REMOVER POLÍTICAS PÚBLICAS (anon) — VAZAMENTOS DE DADOS ────────────
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
DROP POLICY IF EXISTS "public select fidelidade_config" ON public.fidelidade_config;
DROP POLICY IF EXISTS "public select/insert fidelidade_pontos" ON public.fidelidade_pontos;
DROP POLICY IF EXISTS "public insert fidelidade_pontos" ON public.fidelidade_pontos;
DROP POLICY IF EXISTS "public update fidelidade_pontos" ON public.fidelidade_pontos;
DROP POLICY IF EXISTS "public insert fidelidade_historico" ON public.fidelidade_historico;
DROP POLICY IF EXISTS "public insert avaliacoes" ON public.avaliacoes;

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

-- ── 15. REFORÇAR POLÍTICAS own_* COM verificar_acesso() ────────────────────
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

-- bloqueios_agenda
DROP POLICY IF EXISTS "own_bloqueios" ON public.bloqueios_agenda;
CREATE POLICY "own_bloqueios" ON public.bloqueios_agenda
  FOR ALL TO authenticated
  USING (auth.uid() = user_id AND public.verificar_acesso())
  WITH CHECK (auth.uid() = user_id AND public.verificar_acesso());

-- ── 16. RECONSTRUIR vw_dre_mensal COM security_invoker ─────────────────────
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

-- ── 17. fluxo_caixa_projetado ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fluxo_caixa_projetado(
  p_user_id UUID,
  p_dias INTEGER DEFAULT 30
)
RETURNS TABLE (
  data DATE,
  tipo TEXT,
  descricao TEXT,
  valor NUMERIC(10,2),
  saldo_acumulado NUMERIC(10,2)
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_saldo NUMERIC(10,2) := 0;
BEGIN
  SELECT COALESCE(SUM(a.valor - a.custo), 0) INTO v_saldo
  FROM public.agendamentos a
  WHERE a.user_id = p_user_id AND a.status = 'concluido' AND a.data_hora < CURRENT_DATE;

  SELECT v_saldo - COALESCE(SUM(d.valor), 0) INTO v_saldo
  FROM public.despesas d
  WHERE d.user_id = p_user_id AND d.pago = true AND d.data_pagamento < CURRENT_DATE;

  RETURN QUERY
  WITH dias AS (
    SELECT generate_series(CURRENT_DATE, CURRENT_DATE + p_dias, '1 day'::interval)::date AS dia
  ),
  receitas_projetadas AS (
    SELECT a.data_hora::date AS dia, 'receita'::text AS tipo,
           (s.nome || ' - ' || c.nome)::text AS descricao,
           a.valor::numeric(10,2) AS valor
    FROM public.agendamentos a
    LEFT JOIN public.servicos s ON s.id = a.servico_id
    LEFT JOIN public.clientes c ON c.id = a.cliente_id
    WHERE a.user_id = p_user_id AND a.status IN ('agendado', 'confirmado')
      AND a.data_hora::date BETWEEN CURRENT_DATE AND CURRENT_DATE + p_dias
  ),
  despesas_projetadas AS (
    SELECT d.data_vencimento AS dia, 'despesa'::text AS tipo,
           (d.categoria || ' - ' || d.descricao)::text AS descricao,
           d.valor::numeric(10,2) AS valor
    FROM public.despesas d
    WHERE d.user_id = p_user_id AND d.pago = false
      AND d.data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + p_dias
  ),
  todas AS (
    SELECT * FROM receitas_projetadas
    UNION ALL
    SELECT * FROM despesas_projetadas
  )
  SELECT d.dia, COALESCE(t.tipo, 'saldo'), COALESCE(t.descricao, 'Saldo do dia'),
         COALESCE(t.valor, 0)::numeric(10,2),
         SUM(COALESCE(t.valor, 0)) OVER (ORDER BY d.dia) + v_saldo AS saldo_acumulado
  FROM dias d
  LEFT JOIN todas t ON t.dia = d.dia
  ORDER BY d.dia;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fluxo_caixa_projetado FROM PUBLIC;

-- ── 18. agendar_servico SEGURO (conta ativa + expediente + bloqueios + conflito) ──
-- Remove versões antigas da função (com outra assinatura) antes de recriar
DROP FUNCTION IF EXISTS public.agendar_servico(uuid, text, text, text, date, text, uuid, timestamptz, text);
DROP FUNCTION IF EXISTS public.agendar_servico(uuid, text, text, text, date, text, uuid, timestamptz, text, numeric);

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
  v_dia_local DATE;
  v_hora_local TIME;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.contas c
    WHERE c.user_id = p_user_id
      AND c.status = 'ativo'
      AND (c.acesso_termina_em IS NULL OR c.acesso_termina_em > now())
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agenda indisponível no momento');
  END IF;

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

  IF p_data_hora > now() + interval '365 days' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Data muito distante (máx. 1 ano de antecedência)');
  END IF;

  SELECT id, nome, valor, custo, duracao_min, ativo
  INTO v_servico
  FROM public.servicos
  WHERE id = p_servico_id AND user_id = p_user_id AND ativo = true;

  IF v_servico.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Serviço não encontrado ou inativo');
  END IF;

  v_dia_local := (p_data_hora AT TIME ZONE 'America/Sao_Paulo')::date;
  v_hora_local := (p_data_hora AT TIME ZONE 'America/Sao_Paulo')::time;

  -- Bloqueios/folgas (overlap, não apenas início)
  IF EXISTS (
    SELECT 1 FROM public.bloqueios_agenda b
    WHERE b.user_id = p_user_id
      AND b.data_inicio <= v_dia_local
      AND (b.data_fim IS NULL OR b.data_fim >= v_dia_local)
      AND (
        b.horario_inicio IS NULL
        OR (
          v_hora_local < COALESCE(b.horario_fim, b.horario_inicio)
          AND v_hora_local + (v_servico.duracao_min || ' minutes')::interval > b.horario_inicio
        )
      )
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Horário bloqueado pela profissional');
  END IF;

  -- Expediente (só valida se a manicure configurou horários)
  IF EXISTS (
    SELECT 1 FROM public.horarios_trabalho h
    WHERE h.user_id = p_user_id AND h.ativo = true
  ) AND NOT EXISTS (
    SELECT 1 FROM public.horarios_trabalho h
    WHERE h.user_id = p_user_id
      AND h.ativo = true
      AND h.dia_semana::int = EXTRACT(DOW FROM v_dia_local)::int
      AND v_hora_local >= h.hora_inicio
      AND v_hora_local + (v_servico.duracao_min || ' minutes')::interval <= h.hora_fim
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Horário fora do expediente da profissional');
  END IF;

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

  v_valor_final := ROUND(COALESCE(p_valor_final, v_servico.valor), 2);
  IF v_valor_final < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valor inválido');
  END IF;

  SELECT id INTO v_cliente_id
  FROM public.clientes
  WHERE user_id = p_user_id AND telefone = p_cliente_telefone
  LIMIT 1;

  IF v_cliente_id IS NULL THEN
    INSERT INTO public.clientes (user_id, nome, telefone, email, data_nascimento, observacoes)
    VALUES (p_user_id, p_cliente_nome, p_cliente_telefone, p_cliente_email, p_cliente_data_nascimento, p_cliente_observacoes)
    RETURNING id INTO v_cliente_id;
  END IF;

  INSERT INTO public.agendamentos (
    user_id, cliente_id, servico_id, data_hora, duracao_min,
    valor, custo, status, pagamento, observacoes
  ) VALUES (
    p_user_id, v_cliente_id, p_servico_id, p_data_hora, v_servico.duracao_min,
    v_valor_final, v_servico.custo, 'agendado', 'pendente', p_observacoes
  )
  RETURNING id INTO v_agendamento_id;

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

-- ── 19. criar_avaliacao SEGURA ─────────────────────────────────────────────
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

-- ── 20. UTILITÁRIOS DE ADMINISTRAÇÃO ───────────────────────────────────────
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

REVOKE EXECUTE ON FUNCTION public.definir_admin FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.definir_admin TO service_role;

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

-- ── 21. HARMONIZAÇÃO DE SCHEMA: bloqueios_agenda ───────────────────────────
-- Segurança para bancos que ainda tenham o nome antigo (hora_inicio/hora_fim)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bloqueios_agenda' AND column_name = 'hora_inicio'
  ) THEN
    ALTER TABLE public.bloqueios_agenda RENAME COLUMN hora_inicio TO horario_inicio;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bloqueios_agenda' AND column_name = 'hora_fim'
  ) THEN
    ALTER TABLE public.bloqueios_agenda RENAME COLUMN hora_fim TO horario_fim;
  END IF;
END $$;

-- ── 22. CHECKS DEFENSIVOS (com normalização + guard pg_constraint) ─────────
UPDATE public.horarios_trabalho
SET hora_fim = hora_inicio + INTERVAL '1 hour'
WHERE hora_fim <= hora_inicio;

UPDATE public.bloqueios_agenda
SET data_fim = data_inicio
WHERE data_fim IS NOT NULL AND data_fim < data_inicio;

UPDATE public.servicos
SET duracao_min = 1440
WHERE duracao_min > 1440;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'horarios_trabalho_hora_check' AND conrelid = 'public.horarios_trabalho'::regclass) THEN
    ALTER TABLE public.horarios_trabalho ADD CONSTRAINT horarios_trabalho_hora_check CHECK (hora_fim > hora_inicio);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bloqueios_data_check' AND conrelid = 'public.bloqueios_agenda'::regclass) THEN
    ALTER TABLE public.bloqueios_agenda ADD CONSTRAINT bloqueios_data_check CHECK (data_fim IS NULL OR data_fim >= data_inicio);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'servicos_duracao_max_check' AND conrelid = 'public.servicos'::regclass) THEN
    ALTER TABLE public.servicos ADD CONSTRAINT servicos_duracao_max_check CHECK (duracao_min <= 1440);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'servicos_valor_check' AND conrelid = 'public.servicos'::regclass) THEN
    ALTER TABLE public.servicos ADD CONSTRAINT servicos_valor_check CHECK (valor >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'servicos_custo_check' AND conrelid = 'public.servicos'::regclass) THEN
    ALTER TABLE public.servicos ADD CONSTRAINT servicos_custo_check CHECK (custo >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'servicos_duracao_check' AND conrelid = 'public.servicos'::regclass) THEN
    ALTER TABLE public.servicos ADD CONSTRAINT servicos_duracao_check CHECK (duracao_min > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agendamentos_valor_check' AND conrelid = 'public.agendamentos'::regclass) THEN
    ALTER TABLE public.agendamentos ADD CONSTRAINT agendamentos_valor_check CHECK (valor >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agendamentos_custo_check' AND conrelid = 'public.agendamentos'::regclass) THEN
    ALTER TABLE public.agendamentos ADD CONSTRAINT agendamentos_custo_check CHECK (custo >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agendamentos_duracao_check' AND conrelid = 'public.agendamentos'::regclass) THEN
    ALTER TABLE public.agendamentos ADD CONSTRAINT agendamentos_duracao_check CHECK (duracao_min > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'produtos_quantidade_check' AND conrelid = 'public.produtos'::regclass) THEN
    ALTER TABLE public.produtos ADD CONSTRAINT produtos_quantidade_check CHECK (quantidade >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'produtos_quantidade_minima_check' AND conrelid = 'public.produtos'::regclass) THEN
    ALTER TABLE public.produtos ADD CONSTRAINT produtos_quantidade_minima_check CHECK (quantidade_minima >= 0);
  END IF;
END $$;

-- ── 23. ÍNDICES DE PERFORMANCE ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_agendamentos_user_status_data
  ON public.agendamentos(user_id, status, data_hora);
CREATE INDEX IF NOT EXISTS idx_agendamentos_user_data_status
  ON public.agendamentos(user_id, data_hora, status);
CREATE INDEX IF NOT EXISTS idx_clientes_user_telefone
  ON public.clientes(user_id, telefone);
CREATE INDEX IF NOT EXISTS idx_portfolio_user_publico
  ON public.portfolio(user_id, publico);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_user_publico
  ON public.avaliacoes(user_id, publico);
CREATE INDEX IF NOT EXISTS idx_promocoes_user_ativo
  ON public.promocoes(user_id, ativo);

-- ── 24. (OPCIONAL) EXPIRAÇÃO AUTOMÁTICA VIA pg_cron ───────────────────────
-- Você já ativou o pg_cron. Se o job já existir, não recria.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expirar-contas') THEN
      PERFORM cron.schedule(
        'expirar-contas',
        '0 3 * * *',
        $cron$SELECT public.atualizar_status_expirados();$cron$
      );
    END IF;
  END IF;
END $$;

-- =============================================================================
-- FIM — Script completo. Se terminou com "Success", rode:
--   SELECT public.definir_admin('SEU-EMAIL-AQUI');
-- =============================================================================

