-- =============================================================================
-- Migration: ETAPA 2 — Funcionalidades Premium
-- Date: 2026-06-25
--
-- 1. Tabela de despesas (com categorias e recorrência)
-- 2. Tabela de horários de trabalho
-- 3. Tabela de feriados/bloqueios
-- 4. Tabela de configurações do usuário (settings)
-- 5. Tabela de notificações internas
-- 6. Tabela de agendamentos recorrentes
-- 7. View para DRE (Demonstração de Resultados)
-- 8. Funções para fluxo de caixa
-- =============================================================================

-- =============================================================================
-- PARTE 1: DESPESAS
-- =============================================================================
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
CREATE POLICY "own_despesas" ON public.despesas
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_despesas_u BEFORE UPDATE ON public.despesas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- PARTE 2: HORÁRIOS DE TRABALHO
-- =============================================================================
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
CREATE POLICY "own_horarios_trabalho" ON public.horarios_trabalho
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Inserir horários padrão (seg-sex 8h-18h)
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

-- =============================================================================
-- PARTE 3: FERIADOS E BLOQUEIOS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.bloqueios_agenda (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('feriado', 'ferias', 'almoco', 'pessoal', 'folga')),
  titulo TEXT NOT NULL,
  data_inicio DATE NOT NULL,
  data_fim DATE,
  hora_inicio TIME,
  hora_fim TIME,
  recorrente_anual BOOLEAN NOT NULL DEFAULT false,
  cor TEXT DEFAULT '#EF4444',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bloqueios_user_data ON public.bloqueios_agenda(user_id, data_inicio);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bloqueios_agenda TO authenticated;
GRANT ALL ON public.bloqueios_agenda TO service_role;
ALTER TABLE public.bloqueios_agenda ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_bloqueios" ON public.bloqueios_agenda
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- PARTE 4: CONFIGURAÇÕES DO USUÁRIO
-- =============================================================================
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
CREATE POLICY "own_configuracoes" ON public.configuracoes
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_configuracoes_u BEFORE UPDATE ON public.configuracoes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-criar configurações no signup (atualizar handle_new_user)
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

  -- Configurações padrão
  INSERT INTO public.configuracoes (user_id, empresa_nome)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', 'Meu Salão'));

  -- Horários padrão (seg-sex 8h-18h)
  INSERT INTO public.horarios_trabalho (user_id, dia_semana, hora_inicio, hora_fim)
  VALUES 
    (NEW.id, 1, '08:00', '18:00'),
    (NEW.id, 2, '08:00', '18:00'),
    (NEW.id, 3, '08:00', '18:00'),
    (NEW.id, 4, '08:00', '18:00'),
    (NEW.id, 5, '08:00', '18:00')
  ON CONFLICT (user_id, dia_semana) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================================
-- PARTE 5: NOTIFICAÇÕES INTERNAS
-- =============================================================================
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
CREATE POLICY "own_notificacoes" ON public.notificacoes_internas
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- PARTE 6: AGENDAMENTOS RECORRENTES
-- =============================================================================
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
CREATE POLICY "own_recorrencias" ON public.recorrencias
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_recorrencias_u BEFORE UPDATE ON public.recorrencias FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- PARTE 7: VIEW PARA DRE (Demonstração de Resultados)
-- =============================================================================
CREATE OR REPLACE VIEW public.vw_dre_mensal AS
SELECT
  u.id AS user_id,
  DATE_TRUNC('month', a.data_hora)::date AS mes,
  'Receita de Serviços' AS conta,
  SUM(a.valor) AS valor,
  'receita' AS tipo
FROM auth.users u
JOIN public.agendamentos a ON a.user_id = u.id AND a.status = 'concluido'
GROUP BY u.id, DATE_TRUNC('month', a.data_hora)
UNION ALL
SELECT
  u.id AS user_id,
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
FROM auth.users u
JOIN public.despesas d ON d.user_id = u.id AND d.pago = true
GROUP BY u.id, DATE_TRUNC('month', d.data_vencimento), d.categoria, d.valor;

SELECT set_inherit('public.vw_dre_mensal', true);
GRANT SELECT ON public.vw_dre_mensal TO authenticated;

-- =============================================================================
-- PARTE 8: FUNÇÃO PARA FLUXO DE CAIXA
-- =============================================================================
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
  v_rec RECORD;
BEGIN
  -- Saldo inicial: receitas de agendamentos concluídos de hoje para trás
  SELECT COALESCE(SUM(a.valor - a.custo), 0) INTO v_saldo
  FROM public.agendamentos a
  WHERE a.user_id = p_user_id AND a.status = 'concluido' AND a.data_hora < CURRENT_DATE;

  -- Adiciona despesas pagas
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
