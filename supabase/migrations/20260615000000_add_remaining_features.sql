-- 1. PRODUTOS (Controle de estoque completo)
CREATE TABLE public.produtos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  preco_venda NUMERIC(10,2) NOT NULL DEFAULT 0,
  preco_custo NUMERIC(10,2) NOT NULL DEFAULT 0,
  quantidade INTEGER NOT NULL DEFAULT 0,
  quantidade_minima INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_produtos_user ON public.produtos(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produtos TO authenticated;
GRANT ALL ON public.produtos TO service_role;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own produtos" ON public.produtos FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. MOVIMENTAÇÕES DE ESTOQUE
CREATE TABLE public.movimentacoes_estoque (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  quantidade INTEGER NOT NULL,
  motivo TEXT NOT NULL,
  data TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mov_estoque_user ON public.movimentacoes_estoque(user_id);
CREATE INDEX idx_mov_estoque_prod ON public.movimentacoes_estoque(produto_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movimentacoes_estoque TO authenticated;
GRANT ALL ON public.movimentacoes_estoque TO service_role;
ALTER TABLE public.movimentacoes_estoque ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own movimentacoes" ON public.movimentacoes_estoque FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. FIDELIDADE CONFIG
CREATE TABLE public.fidelidade_config (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ativo BOOLEAN NOT NULL DEFAULT false,
  pontos_por_real NUMERIC(10,2) NOT NULL DEFAULT 1.00,
  pontos_resgate INTEGER NOT NULL DEFAULT 100,
  premio_resgate TEXT NOT NULL DEFAULT 'Serviço Grátis',
  niver_promo_ativa BOOLEAN NOT NULL DEFAULT false,
  niver_desconto_porcentagem NUMERIC(10,2) NOT NULL DEFAULT 10.00,
  niver_dias_validade INTEGER NOT NULL DEFAULT 7,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fidelidade_config TO authenticated;
GRANT ALL ON public.fidelidade_config TO service_role;
ALTER TABLE public.fidelidade_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own fidelidade_config" ON public.fidelidade_config FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "public select fidelidade_config" ON public.fidelidade_config FOR SELECT USING (true);

-- 4. FIDELIDADE PONTOS
CREATE TABLE public.fidelidade_pontos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  saldo_pontos INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, cliente_id)
);
CREATE INDEX idx_fid_pontos_user ON public.fidelidade_pontos(user_id);
CREATE INDEX idx_fid_pontos_cliente ON public.fidelidade_pontos(cliente_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fidelidade_pontos TO authenticated;
GRANT ALL ON public.fidelidade_pontos TO service_role;
ALTER TABLE public.fidelidade_pontos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own fidelidade_pontos" ON public.fidelidade_pontos FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "public select/insert fidelidade_pontos" ON public.fidelidade_pontos FOR SELECT USING (true);
CREATE POLICY "public insert fidelidade_pontos" ON public.fidelidade_pontos FOR INSERT WITH CHECK (true);
CREATE POLICY "public update fidelidade_pontos" ON public.fidelidade_pontos FOR UPDATE USING (true);

-- 5. FIDELIDADE HISTÓRICO
CREATE TABLE public.fidelidade_historico (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  pontos INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('ganho', 'resgate')),
  descricao TEXT NOT NULL,
  data TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fid_hist_user ON public.fidelidade_historico(user_id);
CREATE INDEX idx_fid_hist_cliente ON public.fidelidade_historico(cliente_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fidelidade_historico TO authenticated;
GRANT ALL ON public.fidelidade_historico TO service_role;
ALTER TABLE public.fidelidade_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own fidelidade_historico" ON public.fidelidade_historico FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "public insert fidelidade_historico" ON public.fidelidade_historico FOR INSERT WITH CHECK (true);

-- 6. PROMOÇÕES
CREATE TABLE public.promocoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  tipo TEXT NOT NULL CHECK (tipo IN ('desconto_porcentagem', 'valor_fixo')),
  valor NUMERIC(10,2) NOT NULL DEFAULT 0,
  data_inicio DATE,
  data_fim DATE,
  servicos_elegiveis JSONB, -- Array de IDs de serviços, null se for para todos
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_promocoes_user ON public.promocoes(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promocoes TO authenticated;
GRANT ALL ON public.promocoes TO service_role;
ALTER TABLE public.promocoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own promocoes" ON public.promocoes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "public select promocoes" ON public.promocoes FOR SELECT USING (ativo = true);

-- 7. PORTFÓLIO
CREATE TABLE public.portfolio (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descricao TEXT,
  imagem_url TEXT NOT NULL,
  tags TEXT[],
  publico BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_portfolio_user ON public.portfolio(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio TO authenticated;
GRANT ALL ON public.portfolio TO service_role;
ALTER TABLE public.portfolio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own portfolio" ON public.portfolio FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "public select portfolio" ON public.portfolio FOR SELECT USING (publico = true);

-- 8. VENDAS
CREATE TABLE public.vendas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  pagamento_metodo public.pagamento_metodo NOT NULL DEFAULT 'pix',
  data_venda TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vendas_user ON public.vendas(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendas TO authenticated;
GRANT ALL ON public.vendas TO service_role;
ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own vendas" ON public.vendas FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 9. VENDA ITENS
CREATE TABLE public.venda_itens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venda_id UUID NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  quantidade INTEGER NOT NULL,
  preco_unitario NUMERIC(10,2) NOT NULL
);
CREATE INDEX idx_venda_itens_user ON public.venda_itens(user_id);
CREATE INDEX idx_venda_itens_venda ON public.venda_itens(venda_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venda_itens TO authenticated;
GRANT ALL ON public.venda_itens TO service_role;
ALTER TABLE public.venda_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own venda_itens" ON public.venda_itens FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 10. AVALIAÇÕES DE CLIENTES
CREATE TABLE public.avaliacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nome TEXT NOT NULL,
  nota INTEGER NOT NULL CHECK (nota >= 1 AND nota <= 5),
  comentario TEXT,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  publico BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_avaliacoes_user ON public.avaliacoes(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avaliacoes TO authenticated;
GRANT ALL ON public.avaliacoes TO service_role;
ALTER TABLE public.avaliacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own avaliacoes" ON public.avaliacoes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "public select avaliacoes" ON public.avaliacoes FOR SELECT USING (publico = true);
CREATE POLICY "public insert avaliacoes" ON public.avaliacoes FOR INSERT WITH CHECK (true);

-- 11. METAS MENSAIS
CREATE TABLE public.metas_mensais (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mes_ano TEXT NOT NULL, -- formato 'YYYY-MM'
  faturamento_alvo NUMERIC(10,2) NOT NULL DEFAULT 0,
  lucro_alvo NUMERIC(10,2) NOT NULL DEFAULT 0,
  servicos_alvo INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, mes_ano)
);
CREATE INDEX idx_metas_user ON public.metas_mensais(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metas_mensais TO authenticated;
GRANT ALL ON public.metas_mensais TO service_role;
ALTER TABLE public.metas_mensais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own metas" ON public.metas_mensais FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- 12. TRIGGERS DE ATUALIZAÇÃO (UPDATED_AT)
CREATE TRIGGER trg_produtos_u BEFORE UPDATE ON public.produtos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_fidelidade_config_u BEFORE UPDATE ON public.fidelidade_config FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_fidelidade_pontos_u BEFORE UPDATE ON public.fidelidade_pontos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- 13. POLÍTICAS ADICIONAIS PARA AGENDAMENTO PÚBLICO E CONSULTAS PÚBLICAS
-- Permitir select público em perfis (para saber o nome da manicure)
CREATE POLICY "allow public select profiles" ON public.profiles FOR SELECT USING (true);

-- Permitir select público em serviços ativos (para o cliente escolher na página de agendamento)
CREATE POLICY "allow public select servicos" ON public.servicos FOR SELECT USING (ativo = true);

-- Permitir select e insert público em clientes (necessário para agendamento público associar ou criar clientes)
CREATE POLICY "allow public select clientes" ON public.clientes FOR SELECT USING (true);
CREATE POLICY "allow public insert clientes" ON public.clientes FOR INSERT WITH CHECK (true);

-- Permitir select e insert público em agendamentos (para ver horários ocupados e agendar)
CREATE POLICY "allow public select agendamentos" ON public.agendamentos FOR SELECT USING (true);
CREATE POLICY "allow public insert agendamentos" ON public.agendamentos FOR INSERT WITH CHECK (true);


-- 14. INSERÇÃO AUTOMÁTICA DE CONFIGURAÇÃO DE FIDELIDADE DEFAULT NO HANDLE_NEW_USER
-- Vamos atualizar a função existente `handle_new_user` para criar também a fidelidade_config padrão.
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
