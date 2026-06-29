-- Add return interval fields to servicos table
ALTER TABLE public.servicos
ADD COLUMN intervalo_recomendado INTEGER NOT NULL DEFAULT 15,
ADD COLUMN dias_manutencao INTEGER NOT NULL DEFAULT 7;

-- Update existing services with sensible defaults
UPDATE public.servicos
SET intervalo_recomendado = CASE
  WHEN nome ILIKE '%gel%' OR nome ILIKE '%acrigel%' THEN 20
  WHEN nome ILIKE '%fibra%' OR nome ILIKE '%alongamento%' THEN 30
  WHEN nome ILIKE '%esmaltação%' OR nome ILIKE '%simples%' OR nome ILIKE '%unha%' THEN 15
  ELSE 15
END,
dias_manutencao = CASE
  WHEN nome ILIKE '%gel%' OR nome ILIKE '%acrigel%' THEN 20
  WHEN nome ILIKE '%fibra%' OR nome ILIKE '%alongamento%' THEN 30
  WHEN nome ILIKE '%esmaltação%' OR nome ILIKE '%simples%' OR nome ILIKE '%unha%' THEN 7
  ELSE 7
END
WHERE intervalo_recomendado IS NULL OR dias_manutencao IS NULL;
