-- =============================================================================
-- Migration: Production Hardening (Auditoria SaaS)
-- Date: 2026-08-04
--
-- 1. agendar_servico: valida HORÁRIOS DE TRABALHO e BLOQUEIOS/feriados ao
--    criar agendamento público (hoje a página pública oferece slots das
--    08:00 às 18:00 em TODOS os dias, ignorando a agenda real da manicure).
-- 2. agendar_servico: limita o horizonte de agendamento (máx. 365 dias).
-- 3. CHECKs defensivos em horarios_trabalho e bloqueios_agenda.
-- 4. pg_cron (opcional) para expirar contas automaticamente.
--
-- OBSERVAÇÃO DE FUSO HORÁRIO: o produto é pt-BR e horários são exibidos em
-- horário local do navegador. As comparações usam America/Sao_Paulo. Se o
-- produto expandir para outros fusos, parametrizar pelo fuso da manicure.
-- =============================================================================

-- =============================================================================
-- 0. HARMONIZAÇÃO DE SCHEMA: bloqueios_agenda
-- =============================================================================
-- A migration original criou a tabela com hora_inicio/hora_fim, mas o banco
-- real e o frontend usam horario_inicio/horario_fim. Normalizamos de forma
-- idempotente para o nome canônico (horario_inicio/horario_fim).
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

-- =============================================================================
-- 1. AGENDAR_SERVIÇO: validação de expediente + bloqueios + horizonte
-- =============================================================================
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
  v_dia_local DATE;
  v_hora_local TIME;
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

  -- 🔧 NOVO: limite de horizonte — impede agendamentos absurdamente distantes
  IF p_data_hora > now() + interval '365 days' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Data muito distante (máx. 1 ano de antecedência)');
  END IF;

  -- Verifica se o serviço existe e está ativo
  SELECT id, nome, valor, custo, duracao_min, ativo
  INTO v_servico
  FROM public.servicos
  WHERE id = p_servico_id AND user_id = p_user_id AND ativo = true;

  IF v_servico.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Serviço não encontrado ou inativo');
  END IF;

  -- 🔧 NOVO: converte o horário do agendamento para o fuso local (pt-BR)
  v_dia_local := (p_data_hora AT TIME ZONE 'America/Sao_Paulo')::date;
  v_hora_local := (p_data_hora AT TIME ZONE 'America/Sao_Paulo')::time;

  -- 🔧 NOVO: valida bloqueios/feriados/folgas configurados pela manicure
  -- Checagem de OVERLAP (não apenas início): um agendamento que começa antes
  -- de uma janela de bloqueio e termina DENTRO dela também é rejeitado.
  -- NOTA: as colunas no banco real são horario_inicio/horario_fim (o nome na
  -- migration original divergiu; ver relatório de auditoria).
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

  -- 🔧 NOVO: valida horários de trabalho (apenas se a manicure os configurou —
  -- por padrão todas têm seg-sex 08h-18h). O serviço deve caber DENTRO da janela.
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

-- =============================================================================
-- 2. CHECKS DEFENSIVOS
-- =============================================================================
-- Antes de adicionar CHECKs, NORMALIZAMOS linhas existentes que os violariam
-- (senão o ALTER TABLE falha e derruba a migration no meio).

-- Horários com hora_fim <= hora_inicio → corrige para 1h de janela
UPDATE public.horarios_trabalho
SET hora_fim = hora_inicio + INTERVAL '1 hour'
WHERE hora_fim <= hora_inicio;

-- Bloqueios com data_fim < data_inicio → vira bloqueio de dia único
UPDATE public.bloqueios_agenda
SET data_fim = data_inicio
WHERE data_fim IS NOT NULL AND data_fim < data_inicio;

-- Serviços com duração absurda → limita a 24h
UPDATE public.servicos
SET duracao_min = 1440
WHERE duracao_min > 1440;

-- Horário de trabalho com hora_fim > hora_inicio
-- (NOTA: PostgreSQL NÃO suporta `ADD CONSTRAINT IF NOT EXISTS` — por isso o
-- guard abaixo via pg_constraint.)
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
END $$;

-- =============================================================================
-- 3. (OPCIONAL) EXPIRAÇÃO AUTOMÁTICA DE CONTAS VIA pg_cron
-- =============================================================================
-- O RLS (verificar_acesso) já bloqueia contas expiradas instantaneamente.
-- Este cron apenas atualiza o status para 'inativo' (higiene de dados).
-- Requer a extensão pg_cron habilitada no projeto:
--   create extension if not exists pg_cron;
--   (Habilitar em Database > Extensions no dashboard do Supabase)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Idempotente: não recria o job se ele já existir (evita erro ao reaplicar)
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expirar-contas') THEN
      PERFORM cron.schedule(
        'expirar-contas',
        '0 3 * * *',
        $cron$SELECT public.atualizar_status_expirados();$cron$
      );
    END IF;
  END IF;
END $$;
