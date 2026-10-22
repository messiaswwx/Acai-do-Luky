-- ==============================================================================
-- CRIAÇÃO DA TABELA DE CLIENTES (CUSTOMERS) - AÇAÍ DO LUKY
-- Cole este script no SQL Editor do Supabase (https://supabase.com/dashboard)
-- e clique em "RUN" para habilitar o login e histórico de usuários por celular.
-- ==============================================================================

-- 1. Cria a tabela de clientes com celular único (impede números duplicados)
CREATE TABLE IF NOT EXISTS public.customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  street TEXT,
  number TEXT,
  neighborhood TEXT,
  complement TEXT,
  reference TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Habilita Row Level Security (RLS)
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- 3. Políticas de permissão para clientes
DROP POLICY IF EXISTS "Leitura de clientes" ON public.customers;
CREATE POLICY "Leitura de clientes" 
ON public.customers FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Cadastro de novos clientes" ON public.customers;
CREATE POLICY "Cadastro de novos clientes" 
ON public.customers FOR INSERT 
WITH CHECK (true);

DROP POLICY IF EXISTS "Atualizacao de perfil do cliente" ON public.customers;
CREATE POLICY "Atualizacao de perfil do cliente" 
ON public.customers FOR UPDATE 
USING (true) 
WITH CHECK (true);

-- 4. Índice para busca ultra-rápida por número de celular
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
