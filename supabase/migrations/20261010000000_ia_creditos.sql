-- =============================================================================
-- Migration: Créditos de IA por conta (uso diário)
-- Date: 2026-10-10
--
-- OBJETIVOS:
--   1. Controlar o consumo diário da IA por conta (créditos por usuário)
--   2. Reset automático à meia-noite (no fuso configurável, default
--      America/Sao_Paulo) na primeira leitura do dia
--   3. Mensagem amigável + contagem regressiva quando os créditos acabam
--
-- INTEGRAÇÃO COM O APP:
--   - Saudações, respostas rápidas e cache NÃO consomem crédito.
--   - Só chamadas reais ao provedor (OpenAI/Gemini) consomem 1 crédito.
--   - O limite diário vem da env `IA_CREDITOS_DIARIOS` (default 50) e é
--     SINCORONIZADO no banco a cada leitura (mudou a env → vale no próximo reset).
--   - O usuário NUNCA escreve na tabela: toda escrita é via service_role ou
--     pelas funções SECURITY DEFINER abaixo (anti-trapaça).
-- =============================================================================

-- =============================================================================
-- 1. TABELA DE CRÉDITOS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ia_creditos (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES public.contas(user_id) ON DELETE CASCADE,
  -- Créditos ainda disponíveis hoje (decrementa a cada chamada real à IA)
  creditos_restantes INTEGER NOT NULL DEFAULT 50,
  -- Limite diário vigente (sincronizado com IA_CREDITOS_DIARIOS pelo app)
  limite_diario INTEGER NOT NULL DEFAULT 50,
  -- Dia a que o saldo se refere. Valor histórico nas linhas novas força o
  -- 1º acesso a resetar para o limite atual da env IA_CREDITOS_DIARIOS.
  dia DATE NOT NULL DEFAULT DATE '1970-01-01',
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ia_creditos_dia ON public.ia_creditos(dia);

GRANT SELECT ON public.ia_creditos TO authenticated;
GRANT ALL ON public.ia_creditos TO service_role;

-- Defesa em profundidade: o usuário autenticado NUNCA escreve na própria
-- linha de créditos (senão resetaria o próprio saldo e queimaria a cota
-- compartilhada da chave Gemini/OpenAI). Todas as escritas são via
-- service_role ou pelas funções RPC SECURITY DEFINER abaixo.
REVOKE INSERT, UPDATE, DELETE ON public.ia_creditos FROM authenticated;

ALTER TABLE public.ia_creditos ENABLE ROW LEVEL SECURITY;

-- O usuário pode LER apenas a PRÓPRIA linha (necessário para exibir o contador)
DROP POLICY IF EXISTS "ia_creditos_own_select" ON public.ia_creditos;
CREATE POLICY "ia_creditos_own_select" ON public.ia_creditos
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- =============================================================================
-- 2. FUNÇÕES ATOMICAS DE CONSUMO/DEVOLUÇÃO (só service_role executa)
-- =============================================================================
-- SECURITY DEFINER + auth.uid() evitam que um usuário altere créditos de
-- outro. Não concedemos EXECUTE a authenticated — apenas service_role chama
-- (o app usa o client service_role no servidor).

-- Consome 1 crédito (com reset do dia se necessário). Retorna o saldo novo
-- (0 se sem créditos).
CREATE OR REPLACE FUNCTION public.consumir_ia_credito(p_user_id uuid, p_dia date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_novo INTEGER;
BEGIN
  -- Reset do dia se a linha estiver desatualizada (operação atômica).
  UPDATE public.ia_creditos
     SET dia = p_dia,
         creditos_restantes = limite_diario,
         atualizado_em = now()
   WHERE user_id = p_user_id
     AND dia < p_dia;

  UPDATE public.ia_creditos
     SET creditos_restantes = creditos_restantes - 1,
         atualizado_em = now()
   WHERE user_id = p_user_id
     AND creditos_restantes > 0
   RETURNING creditos_restantes INTO v_novo;

  RETURN COALESCE(v_novo, 0);
END;
$$;

-- Devolve 1 crédito (reembolso quando a chamada ao provedor falha).
-- Nunca ultrapassa o limite diário.
CREATE OR REPLACE FUNCTION public.devolver_ia_credito(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_novo INTEGER;
BEGIN
  UPDATE public.ia_creditos
     SET creditos_restantes = LEAST(limite_diario, creditos_restantes + 1),
         atualizado_em = now()
   WHERE user_id = p_user_id
   RETURNING creditos_restantes INTO v_novo;

  RETURN COALESCE(v_novo, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consumir_ia_credito(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.devolver_ia_credito(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consumir_ia_credito(uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.devolver_ia_credito(uuid) TO service_role;

-- =============================================================================
-- 3. TRIGGER handle_new_user: cria a linha de créditos para novas contas
-- =============================================================================
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

  INSERT INTO public.contas (user_id, status)
  VALUES (NEW.id, 'ativo'::public.conta_status)
  ON CONFLICT (user_id) DO NOTHING;

  -- Linha de créditos nasce desatualizada (dia = '1970-01-01') de propósito:
  -- a primeira leitura do app reseta para o limite atual de IA_CREDITOS_DIARIOS.
  INSERT INTO public.ia_creditos (user_id, creditos_restantes, limite_diario)
  VALUES (NEW.id, 50, 50)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================================
-- 4. BACKFILL: contas existentes ganham a linha de créditos (resetará no
--    primeiro uso, pois dia nasce em '1970-01-01' — sempre < hoje)
-- =============================================================================
INSERT INTO public.ia_creditos (user_id, creditos_restantes, limite_diario)
SELECT user_id, 50, 50
FROM public.contas
ON CONFLICT (user_id) DO NOTHING;