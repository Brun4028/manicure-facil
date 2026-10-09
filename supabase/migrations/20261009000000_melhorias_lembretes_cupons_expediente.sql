-- ============================================================================
-- 20261009000000 — Melhorias: Lembretes WhatsApp, Cupons automáticos,
--                  Expediente configurável (intervalos/pausas)
--
-- COMO APLICAR:
--   Opção A (recomendada): rode os blocos deste arquivo no SQL Editor do
--          Supabase, um por vez, na ordem em que aparecem.
--   Opção B: supabase db push (CLI).
--
-- O que este arquivo cria:
--   1. Tabela public.lembretes_whatsapp  — central de lembretes de contato
--   2. Tabela public.cupom_usos          — controle de limite de uso de cupons
--   3. Novas colunas em public.promocoes — valor_minimo, limite_usos, usos
--   4. Coluna public.configuracoes.permite_fora_expediente
--   5. Tabela public.expediente_intervalos — pausas/intervalos do dia
--   6. Função agendar_servico recriada validando também os intervalos/pausas
-- ============================================================================

-- ─── 1. TABELA lembretes_whatsapp ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lembretes_whatsapp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  -- chave única por lembrete lógico (evita duplicar a cada atualização)
  -- formatos: "agendamento:<id>:<tipo>" | "aniv:<cliente>:<yyyy-mm>" | "reativ:<cliente>:<yyyy-mm>"
  chave TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('agendamento_proximo','agendamento_confirmado','aniversario','inatividade')),
  cliente_id UUID,
  agendamento_id UUID,
  cliente_nome TEXT NOT NULL,
  telefone TEXT,
  motivo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  data_referencia TIMESTAMPTZ,
  -- pendente = precisa de contato | resolvido = já contatada | adiado = volta depois
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','resolvido','adiado')),
  adiado_ate TIMESTAMPTZ,
  resolvido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, chave)
);

CREATE INDEX IF NOT EXISTS idx_lembretes_whatsapp_user_status
  ON public.lembretes_whatsapp(user_id, status, adiado_ate);
CREATE INDEX IF NOT EXISTS idx_lembretes_whatsapp_agendamento
  ON public.lembretes_whatsapp(agendamento_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lembretes_whatsapp TO authenticated;
GRANT ALL ON public.lembretes_whatsapp TO service_role;
ALTER TABLE public.lembretes_whatsapp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_lembretes_whatsapp" ON public.lembretes_whatsapp;
CREATE POLICY "own_lembretes_whatsapp" ON public.lembretes_whatsapp
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_lembretes_whatsapp_u ON public.lembretes_whatsapp;
CREATE TRIGGER trg_lembretes_whatsapp_u BEFORE UPDATE ON public.lembretes_whatsapp
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 2. TABELA cupom_usos ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cupom_usos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  promocao_id UUID NOT NULL,
  cliente_id UUID,
  origem TEXT NOT NULL DEFAULT 'pdv' CHECK (origem IN ('pdv','agendamento')),
  entidade_id UUID,
  valor_desconto NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cupom_usos_promocao ON public.cupom_usos(promocao_id);
CREATE INDEX IF NOT EXISTS idx_cupom_usos_user ON public.cupom_usos(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cupom_usos TO authenticated;
GRANT ALL ON public.cupom_usos TO service_role;
ALTER TABLE public.cupom_usos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_cupom_usos" ON public.cupom_usos;
CREATE POLICY "own_cupom_usos" ON public.cupom_usos
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─── 3. NOVAS COLUNAS EM promocoes ─────────────────────────────────────────
ALTER TABLE public.promocoes ADD COLUMN IF NOT EXISTS valor_minimo NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.promocoes ADD COLUMN IF NOT EXISTS limite_usos INTEGER; -- NULL = ilimitado
ALTER TABLE public.promocoes ADD COLUMN IF NOT EXISTS usos INTEGER NOT NULL DEFAULT 0;

-- ─── 4. COLUNA configuracoes.permite_fora_expediente ───────────────────────
ALTER TABLE public.configuracoes ADD COLUMN IF NOT EXISTS permite_fora_expediente BOOLEAN NOT NULL DEFAULT false;

-- ─── 5. TABELA expediente_intervalos ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expediente_intervalos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  -- dia_semana: 0=domingo ... 6=sábado (mesma convenção do JS Date.getDay())
  dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  nome TEXT NOT NULL DEFAULT 'Intervalo',
  hora_inicio TEXT NOT NULL, -- "HH:mm"
  hora_fim TEXT NOT NULL,    -- "HH:mm"
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expediente_intervalos_user
  ON public.expediente_intervalos(user_id, dia_semana);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expediente_intervalos TO authenticated;
GRANT ALL ON public.expediente_intervalos TO service_role;
ALTER TABLE public.expediente_intervalos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_expediente_intervalos" ON public.expediente_intervalos;
CREATE POLICY "own_expediente_intervalos" ON public.expediente_intervalos
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─── 6. agendar_servico — validação também de intervalos/pausas ────────────
-- Recria a função para bloquear slots que caem dentro de um intervalo/pausa
-- cadastrado em expediente_intervalos. Mantém todas as validações anteriores.
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

  -- Intervalos/pausas cadastrados (almoço, pausa, etc.)
  IF EXISTS (
    SELECT 1 FROM public.expediente_intervalos i
    WHERE i.user_id = p_user_id
      AND i.dia_semana::int = EXTRACT(DOW FROM v_dia_local)::int
      AND v_hora_local < i.hora_fim::time
      AND v_hora_local + (v_servico.duracao_min || ' minutes')::interval > i.hora_inicio::time
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Horário cai em um intervalo/pausa cadastrado');
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
