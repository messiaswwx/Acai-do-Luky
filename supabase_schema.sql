-- ==============================================================================
-- SCHEMA SUPABASE: AÇAÍ DO LUKY
-- Copie e cole todo este script no SQL Editor do Supabase (supabase.com/dashboard)
-- e clique em "RUN".
-- ==============================================================================

-- 1. TABELA DE CONFIGURAÇÕES DA LOJA
CREATE TABLE IF NOT EXISTS public.store_settings (
  id INT PRIMARY KEY DEFAULT 1,
  store_name TEXT NOT NULL DEFAULT 'Açaí do Luky',
  is_open BOOLEAN NOT NULL DEFAULT true,
  whatsapp TEXT NOT NULL DEFAULT '5511999999999',
  pix_key TEXT NOT NULL DEFAULT 'kaykyacai@exemplo.com',
  pix_key_type TEXT NOT NULL DEFAULT 'Chave E-mail',
  delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 5.00,
  estimated_time TEXT NOT NULL DEFAULT '30 - 45 min',
  address TEXT NOT NULL DEFAULT 'Atendimento Delivery & Retirada',
  min_order_value NUMERIC(10,2) NOT NULL DEFAULT 12.00,
  admin_pin TEXT NOT NULL DEFAULT '1234',
  two_factor_enabled BOOLEAN NOT NULL DEFAULT true,
  two_factor_backup_code TEXT NOT NULL DEFAULT '998877',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_settings_row CHECK (id = 1)
);

-- Insere configurações padrão iniciais se não existirem
INSERT INTO public.store_settings (id, store_name, is_open, whatsapp, pix_key, pix_key_type, delivery_fee, estimated_time, address, min_order_value, admin_pin, two_factor_enabled, two_factor_backup_code)
VALUES (1, 'Açaí do Luky', true, '5511999999999', 'kaykyacai@exemplo.com', 'Chave E-mail', 5.00, '30 - 45 min', 'Atendimento Delivery & Retirada', 12.00, '1234', true, '998877')
ON CONFLICT (id) DO NOTHING;

-- 2. TABELA DE CARDÁPIO (MENU COMPLETO)
CREATE TABLE IF NOT EXISTS public.menu_data (
  id INT PRIMARY KEY DEFAULT 1,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_menu_row CHECK (id = 1)
);

-- Insere o cardápio padrão inicial
INSERT INTO public.menu_data (id, data)
VALUES (
  1,
  '{
    "sizes": [
      { "id": "size-300", "name": "Copo 300ml", "description": "Perfeito para matar aquela vontade de forma rápida e refrescante.", "price": 14.00, "originalPrice": 14.00, "discountPercent": 0, "maxFreeToppings": 3, "available": true },
      { "id": "size-500", "name": "Copo 500ml", "description": "O queridinho da galera! Equilíbrio ideal entre açaí e acompanhamentos.", "price": 17.00, "originalPrice": 20.00, "discountPercent": 15, "maxFreeToppings": 3, "available": true },
      { "id": "size-700", "name": "Copo 700ml", "description": "Tamanho caprichado para quem ama açaí de verdade.", "price": 26.00, "originalPrice": 26.00, "discountPercent": 0, "maxFreeToppings": 4, "available": true },
      { "id": "size-1000", "name": "Barca Especial 1 Litro", "description": "Serve até 3 pessoas com muita fartura, amor e recheio!", "price": 45.00, "originalPrice": 45.00, "discountPercent": 0, "maxFreeToppings": 5, "available": true }
    ],
    "bases": [
      { "id": "base-tradicional", "name": "Açaí Tradicional Cremoso", "available": true },
      { "id": "base-banana", "name": "Açaí Batido com Banana", "available": true },
      { "id": "base-cupuacu", "name": "Cupuaçu Puro Cremoso", "available": true },
      { "id": "base-misto", "name": "Meio a Meio (Açaí + Cupuaçu)", "available": true }
    ],
    "freeToppings": [
      { "id": "free-ninho", "name": "Leite Ninho em Pó", "available": true },
      { "id": "free-granola", "name": "Granola Crocante", "available": true },
      { "id": "free-pacoca", "name": "Paçoca de Amendoim", "available": true },
      { "id": "free-banana", "name": "Banana Fresca Fatiada", "available": true },
      { "id": "free-aveia", "name": "Aveia em Flocos", "available": true },
      { "id": "free-sucrilhos", "name": "Sucrilhos de Milho", "available": true }
    ],
    "premiumToppings": [
      { "id": "prem-morango", "name": "Morango Fresco Fatiado", "price": 4.50, "available": true },
      { "id": "prem-nutella", "name": "Nutella Pura Original", "price": 5.00, "available": true },
      { "id": "prem-kitkat", "name": "KitKat Picadinho", "price": 3.50, "available": true },
      { "id": "prem-confete", "name": "Confetes de Chocolate", "price": 3.00, "available": true },
      { "id": "prem-doce-leite", "name": "Doce de Leite Cremoso", "price": 3.00, "available": true },
      { "id": "prem-ninho-extra", "name": "Leite Ninho Extra", "price": 2.50, "available": true },
      { "id": "prem-whey", "name": "Dose Whey Protein (30g)", "price": 6.00, "available": true }
    ],
    "syrups": [
      { "id": "syrup-condensado", "name": "Leite Condensado", "available": true },
      { "id": "syrup-chocolate", "name": "Calda de Chocolate", "available": true },
      { "id": "syrup-morango", "name": "Calda de Morango", "available": true },
      { "id": "syrup-mel", "name": "Mel de Abelha Puro", "available": true }
    ]
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- 3. TABELA DE PEDIDOS (ORDERS)
CREATE TABLE IF NOT EXISTS public.orders (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'NOVO', -- NOVO, PREPARANDO, A_CAMINHO, CONCLUIDO, CANCELADO
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  delivery_type TEXT NOT NULL, -- ENTREGA, RETIRADA
  address TEXT,
  neighborhood TEXT,
  number TEXT,
  complement TEXT,
  reference TEXT,
  payment_method TEXT NOT NULL, -- PIX, CARTAO, DINHEIRO
  change_for NUMERIC(10,2),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC(10,2) NOT NULL,
  delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  total NUMERIC(10,2) NOT NULL,
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TABELA DE CONTROLE DE ESTOQUE (INVENTORY)
CREATE TABLE IF NOT EXISTS public.inventory (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- 'AÇAÍ', 'FRUTAS', 'COMPLEMENTOS', 'EMBALAGENS', 'CALDAS'
  quantity NUMERIC(10,2) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'un', -- 'un', 'kg', 'L', 'potes', 'caixas'
  min_alert_quantity NUMERIC(10,2) NOT NULL DEFAULT 5,
  cost_price NUMERIC(10,2) DEFAULT 0.00,
  supplier TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Itens iniciais de estoque de exemplo
INSERT INTO public.inventory (id, name, category, quantity, unit, min_alert_quantity, cost_price, supplier)
VALUES
  ('est-acai-balde', 'Balde de Açaí Tradicional 10L', 'AÇAÍ', 4, 'baldes', 2, 85.00, 'Distribuidora Central'),
  ('est-copo-300', 'Copos Descartáveis 300ml (C/ Tampa)', 'EMBALAGENS', 150, 'un', 30, 0.40, 'Embalagens Silva'),
  ('est-copo-500', 'Copos Descartáveis 500ml (C/ Tampa)', 'EMBALAGENS', 120, 'un', 30, 0.50, 'Embalagens Silva'),
  ('est-copo-700', 'Copos Descartáveis 700ml (C/ Tampa)', 'EMBALAGENS', 80, 'un', 20, 0.65, 'Embalagens Silva'),
  ('est-nutella-pote', 'Nutella Pote 650g', 'COMPLEMENTOS', 6, 'potes', 2, 38.00, 'Atacadão'),
  ('est-leite-ninho', 'Leite Ninho em Pó Lata 400g', 'COMPLEMENTOS', 8, 'latas', 3, 18.50, 'Atacadão'),
  ('est-morango-caixa', 'Morango Fresco', 'FRUTAS', 10, 'caixas', 3, 7.50, 'Ceasa / Feira'),
  ('est-leite-condensado', 'Leite Condensado Piracanjuba 395g', 'CALDAS', 12, 'un', 4, 5.80, 'Atacadão')
ON CONFLICT (id) DO NOTHING;

-- 5. TABELA DE DISPOSITIVOS AUTORIZADOS (2FA)
CREATE TABLE IF NOT EXISTS public.trusted_devices (
  token TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Dispositivo Confiável',
  ip TEXT,
  authorized_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. HABILITAR ROW LEVEL SECURITY (RLS) COM POLÍTICAS PÚBLICAS PERMISSIVAS
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso público às configurações" ON public.store_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso público ao cardápio" ON public.menu_data FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso público aos pedidos" ON public.orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso público ao estoque" ON public.inventory FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso público aos dispositivos" ON public.trusted_devices FOR ALL USING (true) WITH CHECK (true);

-- 7. HABILITAR TEMPO REAL (REALTIME) DO SUPABASE PARA PEDIDOS E LOJA
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'store_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.store_settings;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'inventory'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory;
  END IF;
END $$;
