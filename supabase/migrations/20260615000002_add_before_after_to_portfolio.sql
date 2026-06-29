-- Add before/after photo columns to portfolio table
ALTER TABLE public.portfolio
ADD COLUMN foto_antes_url TEXT,
ADD COLUMN cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL;

-- Allow public insert on portfolio for the public booking page
CREATE POLICY "allow public insert portfolio" ON public.portfolio FOR INSERT WITH CHECK (true);
