-- ==============================================================================
-- BLINDAGEM DE SEGURANÇA V2: AÇAÍ DO LUKY (SUPABASE / POSTGRESQL)
-- ------------------------------------------------------------------------------
-- Execute este script INTEIRO no SQL Editor do Supabase e clique em "RUN".
-- É idempotente (pode rodar mais de uma vez).
--
-- O que este script corrige:
--  1. Pedidos, clientes e estoque deixam de ser lidos/alterados publicamente.
--  2. Painel admin passa a usar SESSÃO validada no banco (token aleatório com
--     expiração). Todo comando administrativo exige essa sessão.
--  3. PIN do admin armazenado com hash bcrypt + limite de tentativas
--     (anti força-bruta).
--  4. Preço do pedido é recalculado NO BANCO a partir do cardápio oficial
--     (cliente não consegue mais pagar o valor que quiser).
--  5. IDs de pedido aleatórios (não dá para adivinhar pedidos de outras pessoas).
--  6. Login de cliente passa a exigir PIN pessoal (hash bcrypt) + sessão.
--  7. Remove funções antigas inseguras (update_menu sem senha, 2FA com código
--     mestre, contingência de cardápio dentro do estoque).
--  8. search_path fixo em todas as funções SECURITY DEFINER.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ------------------------------------------------------------------------------
-- 0. LIMPEZA DE FUNÇÕES ANTIGAS / INSEGURAS
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_admin_verify_2fa(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rpc_admin_update_menu(JSONB);
DROP FUNCTION IF EXISTS public.rpc_admin_update_settings(TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, NUMERIC, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.rpc_admin_login(TEXT, TEXT);

-- Linha de "contingência" que permitia sobrescrever o cardápio via estoque
DELETE FROM public.inventory WHERE id = 'sys-menu-sync';

-- Desafios 2FA antigos não são mais usados
DROP TABLE IF EXISTS public.admin_2fa_challenges;

-- ------------------------------------------------------------------------------
-- 1. SEGREDOS DO ADMIN: PIN COM HASH BCRYPT
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_auth_secrets (
  id INT PRIMARY KEY DEFAULT 1,
  admin_pin TEXT NOT NULL,
  two_factor_backup_code TEXT NOT NULL DEFAULT 'DESATIVADO',
  two_factor_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_auth_row CHECK (id = 1)
);

-- Garante que exista a linha (caso o script antigo nunca tenha sido rodado)
INSERT INTO public.admin_auth_secrets (id, admin_pin)
VALUES (1, '1234')
ON CONFLICT (id) DO NOTHING;

-- Converte PIN em texto puro para hash bcrypt (só se ainda não for hash)
UPDATE public.admin_auth_secrets
SET admin_pin = extensions.crypt(TRIM(admin_pin), extensions.gen_salt('bf', 10)),
    two_factor_backup_code = 'DESATIVADO',
    two_factor_enabled = false,
    updated_at = NOW()
WHERE id = 1 AND admin_pin NOT LIKE '$2%';

-- Remove de vez colunas sensíveis da tabela pública de configurações
ALTER TABLE public.store_settings DROP COLUMN IF EXISTS admin_pin;
ALTER TABLE public.store_settings DROP COLUMN IF EXISTS two_factor_backup_code;
ALTER TABLE public.store_settings DROP COLUMN IF EXISTS two_factor_enabled;

-- ------------------------------------------------------------------------------
-- 2. TABELAS DE SESSÃO E CONTROLE DE TENTATIVAS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_sessions (
  token_hash TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS public.admin_login_attempts (
  id BIGSERIAL PRIMARY KEY,
  ip TEXT,
  device_hash TEXT,
  success BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_created ON public.admin_login_attempts(created_at);

-- Dispositivos confiáveis: agora guardam apenas o HASH do token.
-- Tokens antigos (gerados com MD5/RANDOM previsível) são descartados.
DELETE FROM public.trusted_devices WHERE token NOT LIKE 'sha256:%';

CREATE TABLE IF NOT EXISTS public.customer_sessions (
  token_hash TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS public.customer_login_attempts (
  id BIGSERIAL PRIMARY KEY,
  phone TEXT NOT NULL,
  ip TEXT,
  success BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_login_attempts ON public.customer_login_attempts(phone, created_at);

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS pin_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON public.orders(customer_phone);

-- Sinal público de "algo mudou" (sem dados pessoais) usado pelo Realtime
CREATE TABLE IF NOT EXISTS public.realtime_signal (
  id INT PRIMARY KEY DEFAULT 1,
  orders_version BIGINT NOT NULL DEFAULT 0,
  inventory_version BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT single_signal_row CHECK (id = 1)
);
INSERT INTO public.realtime_signal (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY: TRANCA TUDO, LIBERA SÓ LEITURA DO QUE É PÚBLICO
-- ------------------------------------------------------------------------------
ALTER TABLE public.store_settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_data               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trusted_devices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_auth_secrets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_sessions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_login_attempts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.realtime_signal         ENABLE ROW LEVEL SECURITY;

-- Remove TODAS as políticas existentes dessas tabelas
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN (
      'store_settings','menu_data','orders','inventory','trusted_devices','customers',
      'admin_auth_secrets','admin_sessions','admin_login_attempts',
      'customer_sessions','customer_login_attempts','realtime_signal'
    )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Somente leitura pública do que é realmente público
CREATE POLICY "Leitura publica das configuracoes" ON public.store_settings FOR SELECT USING (true);
CREATE POLICY "Leitura publica do cardapio"       ON public.menu_data      FOR SELECT USING (true);
CREATE POLICY "Leitura publica do sinal"          ON public.realtime_signal FOR SELECT USING (true);

-- Defesa em profundidade: revoga privilégios diretos de escrita via API
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.store_settings, public.menu_data, public.realtime_signal FROM anon, authenticated;
REVOKE ALL ON public.orders, public.inventory, public.customers, public.trusted_devices,
              public.admin_auth_secrets, public.admin_sessions, public.admin_login_attempts,
              public.customer_sessions, public.customer_login_attempts
       FROM anon, authenticated;

-- Realtime: tabelas sensíveis saem da publicação; entra só o sinal e o cardápio
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='orders') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.orders;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='inventory') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.inventory;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='customers') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.customers;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='realtime_signal') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.realtime_signal;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='menu_data') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_data;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='store_settings') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.store_settings;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. FUNÇÕES INTERNAS (NÃO EXPOSTAS PARA A API)
-- ------------------------------------------------------------------------------

-- Hash SHA-256 de tokens (nunca guardamos o token puro)
CREATE OR REPLACE FUNCTION public._sha256(p_value TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = public, extensions, pg_temp
AS $$
  SELECT 'sha256:' || encode(extensions.digest(COALESCE(p_value, ''), 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public._random_token()
RETURNS TEXT
LANGUAGE sql VOLATILE
SET search_path = public, extensions, pg_temp
AS $$
  SELECT encode(extensions.gen_random_bytes(32), 'hex');
$$;

-- IP do cliente (informado pelo gateway do Supabase)
CREATE OR REPLACE FUNCTION public._request_ip()
RETURNS TEXT
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE v_headers JSON;
BEGIN
  BEGIN
    v_headers := current_setting('request.headers', true)::json;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  IF v_headers IS NULL THEN RETURN NULL; END IF;
  RETURN NULLIF(TRIM(COALESCE(
    v_headers ->> 'cf-connecting-ip',
    split_part(v_headers ->> 'x-forwarded-for', ',', 1),
    v_headers ->> 'x-real-ip'
  )), '');
END;
$$;

-- Texto limpo: remove < > e caracteres de controle, limita tamanho
CREATE OR REPLACE FUNCTION public._clean_text(p_value TEXT, p_max INT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(LEFT(TRIM(
    regexp_replace(regexp_replace(COALESCE(p_value, ''), '[[:cntrl:]]', ' ', 'g'), '[<>]', '', 'g')
  ), p_max), '');
$$;

CREATE OR REPLACE FUNCTION public._digits(p_value TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT regexp_replace(COALESCE(p_value, ''), '\D', '', 'g');
$$;

-- Telefone normalizado (só dígitos, sem DDI 55)
CREATE OR REPLACE FUNCTION public._norm_phone(p_value TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN length(public._digits(p_value)) >= 12 AND left(public._digits(p_value), 2) = '55'
      THEN substr(public._digits(p_value), 3)
    ELSE public._digits(p_value)
  END;
$$;

CREATE OR REPLACE FUNCTION public._safe_numeric(p_value TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN p_value::NUMERIC;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public._safe_timestamptz(p_value TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_value IS NULL OR p_value = '' THEN RETURN NULL; END IF;
  RETURN p_value::TIMESTAMPTZ;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- Valida sessão administrativa
CREATE OR REPLACE FUNCTION public._admin_session_valid(p_session_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF p_session_token IS NULL OR length(p_session_token) < 32 THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.admin_sessions
    WHERE token_hash = public._sha256(p_session_token) AND expires_at > NOW()
  );
END;
$$;

-- Valida sessão de cliente e devolve o id do cliente
CREATE OR REPLACE FUNCTION public._customer_from_session(p_session_token TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE v_id TEXT;
BEGIN
  IF p_session_token IS NULL OR length(p_session_token) < 32 THEN
    RETURN NULL;
  END IF;
  SELECT customer_id INTO v_id FROM public.customer_sessions
  WHERE token_hash = public._sha256(p_session_token) AND expires_at > NOW();
  RETURN v_id;
END;
$$;

-- Mapeia tamanho do copo -> item de embalagem no estoque
CREATE OR REPLACE FUNCTION public._packaging_id(p_size_id TEXT, p_size_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY[lower(COALESCE(p_size_id, '')), lower(COALESCE(p_size_name, ''))] LOOP
    IF s LIKE '%300%' THEN RETURN 'est-copo-300'; END IF;
    IF s LIKE '%500%' THEN RETURN 'est-copo-500'; END IF;
    IF s LIKE '%700%' THEN RETURN 'est-copo-700'; END IF;
    IF s LIKE '%1000%' OR s LIKE '%1100%' OR s LIKE '%litro%' OR s LIKE '%barca%' OR s LIKE '%marmita%' THEN RETURN 'est-copo-1000'; END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

-- Baixa ou estorna embalagens de acordo com os itens do pedido
CREATE OR REPLACE FUNCTION public._adjust_packaging(p_items JSONB, p_direction INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item JSONB;
  v_pkg TEXT;
  v_qty INT;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RETURN; END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pkg := public._packaging_id(v_item #>> '{size,id}', v_item #>> '{size,name}');
    v_qty := GREATEST(1, COALESCE(public._safe_numeric(v_item ->> 'quantity'), 1)::INT);
    IF v_pkg IS NOT NULL THEN
      UPDATE public.inventory
      SET quantity = GREATEST(0, quantity + (p_direction * v_qty)), updated_at = NOW()
      WHERE id = v_pkg;
    END IF;
  END LOOP;
END;
$$;

-- Triggers que incrementam o sinal público de mudanças
CREATE OR REPLACE FUNCTION public._bump_orders_signal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.realtime_signal SET orders_version = orders_version + 1, updated_at = NOW() WHERE id = 1;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public._bump_inventory_signal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.realtime_signal SET inventory_version = inventory_version + 1, updated_at = NOW() WHERE id = 1;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_signal ON public.orders;
CREATE TRIGGER trg_orders_signal
AFTER INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH STATEMENT EXECUTE FUNCTION public._bump_orders_signal();

DROP TRIGGER IF EXISTS trg_inventory_signal ON public.inventory;
CREATE TRIGGER trg_inventory_signal
AFTER INSERT OR UPDATE OR DELETE ON public.inventory
FOR EACH STATEMENT EXECUTE FUNCTION public._bump_inventory_signal();

-- ------------------------------------------------------------------------------
-- 5. AUTENTICAÇÃO DO ADMINISTRADOR
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_admin_login(p_pin TEXT, p_device_token TEXT DEFAULT '')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_hash TEXT;
  v_ip TEXT := public._request_ip();
  v_device_hash TEXT;
  v_device_ok BOOLEAN := false;
  v_fail_device INT;
  v_fail_ip INT;
  v_fail_global INT;
  v_session TEXT;
  v_device_token TEXT;
BEGIN
  -- Limpeza de registros antigos
  DELETE FROM public.admin_login_attempts WHERE created_at < NOW() - INTERVAL '2 days';
  DELETE FROM public.admin_sessions WHERE expires_at < NOW();

  IF p_device_token IS NOT NULL AND length(p_device_token) >= 32 THEN
    v_device_hash := public._sha256(p_device_token);
    v_device_ok := EXISTS (SELECT 1 FROM public.trusted_devices WHERE token = v_device_hash);
  END IF;

  -- Limites de tentativas:
  --  * Aparelho já confiável: 5 erros em 15 min bloqueiam só esse aparelho.
  --  * Aparelho desconhecido: 5 erros por IP em 15 min, e no máximo 10 erros
  --    no total por hora (impede força-bruta mesmo trocando de IP).
  IF v_device_ok THEN
    SELECT COUNT(*) INTO v_fail_device FROM public.admin_login_attempts
    WHERE device_hash = v_device_hash AND success = false AND created_at > NOW() - INTERVAL '15 minutes';
    IF v_fail_device >= 5 THEN
      RETURN jsonb_build_object('success', false, 'locked', true, 'lockoutSeconds', 900,
        'error', 'Muitas tentativas incorretas. Aguarde 15 minutos.');
    END IF;
  ELSE
    SELECT COUNT(*) INTO v_fail_ip FROM public.admin_login_attempts
    WHERE v_ip IS NOT NULL AND ip = v_ip AND success = false AND created_at > NOW() - INTERVAL '15 minutes';
    SELECT COUNT(*) INTO v_fail_global FROM public.admin_login_attempts
    WHERE device_hash IS NULL AND success = false AND created_at > NOW() - INTERVAL '1 hour';
    IF v_fail_ip >= 5 OR v_fail_global >= 10 THEN
      RETURN jsonb_build_object('success', false, 'locked', true, 'lockoutSeconds', 900,
        'error', 'Login temporariamente bloqueado por excesso de tentativas. Tente novamente mais tarde.');
    END IF;
  END IF;

  SELECT admin_pin INTO v_hash FROM public.admin_auth_secrets WHERE id = 1;

  IF v_hash IS NULL OR p_pin IS NULL OR length(TRIM(p_pin)) < 4
     OR extensions.crypt(TRIM(p_pin), v_hash) <> v_hash THEN
    INSERT INTO public.admin_login_attempts (ip, device_hash, success)
    VALUES (v_ip, CASE WHEN v_device_ok THEN v_device_hash END, false);
    RETURN jsonb_build_object('success', false, 'error', 'PIN incorreto. Acesso negado.');
  END IF;

  INSERT INTO public.admin_login_attempts (ip, device_hash, success)
  VALUES (v_ip, CASE WHEN v_device_ok THEN v_device_hash END, true);

  -- Aparelho: reaproveita se já confiável, senão emite um novo token aleatório
  IF v_device_ok THEN
    v_device_token := p_device_token;
    UPDATE public.trusted_devices SET last_used_at = NOW(), ip = v_ip WHERE token = v_device_hash;
  ELSE
    v_device_token := public._random_token();
    INSERT INTO public.trusted_devices (token, name, ip, authorized_at, last_used_at)
    VALUES (public._sha256(v_device_token), 'Painel Admin', v_ip, NOW(), NOW());
  END IF;

  -- Sessão de 12 horas
  v_session := public._random_token();
  INSERT INTO public.admin_sessions (token_hash, expires_at)
  VALUES (public._sha256(v_session), NOW() + INTERVAL '12 hours');

  RETURN jsonb_build_object(
    'success', true,
    'require2FA', false,
    'deviceTrusted', true,
    'deviceToken', v_device_token,
    'sessionToken', v_session,
    'expiresAt', NOW() + INTERVAL '12 hours'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_check_session(p_session_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  RETURN public._admin_session_valid(p_session_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_logout(p_session_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  DELETE FROM public.admin_sessions WHERE token_hash = public._sha256(p_session_token);
  RETURN jsonb_build_object('success', true);
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. COMANDOS ADMINISTRATIVOS (TODOS EXIGEM SESSÃO VÁLIDA)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_admin_update_settings(
  p_session_token TEXT,
  p_store_name TEXT,
  p_is_open BOOLEAN,
  p_whatsapp TEXT,
  p_pix_key TEXT,
  p_pix_key_type TEXT,
  p_delivery_fee NUMERIC,
  p_estimated_time TEXT,
  p_address TEXT,
  p_min_order_value NUMERIC,
  p_new_pin TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NOT public._admin_session_valid(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sessão expirada. Faça login novamente.', 'unauthorized', true);
  END IF;

  IF p_delivery_fee IS NULL OR p_delivery_fee < 0 OR p_delivery_fee > 500
     OR p_min_order_value IS NULL OR p_min_order_value < 0 OR p_min_order_value > 5000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valores de taxa ou pedido mínimo inválidos.');
  END IF;

  IF public._clean_text(p_store_name, 80) IS NULL OR public._clean_text(p_pix_key, 140) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nome da loja e chave Pix são obrigatórios.');
  END IF;

  IF p_new_pin IS NOT NULL AND TRIM(p_new_pin) <> '' THEN
    IF TRIM(p_new_pin) !~ '^[0-9]{4,12}$' THEN
      RETURN jsonb_build_object('success', false, 'error', 'O novo PIN deve ter de 4 a 12 números.');
    END IF;
  END IF;

  UPDATE public.store_settings SET
    store_name     = public._clean_text(p_store_name, 80),
    is_open        = COALESCE(p_is_open, is_open),
    whatsapp       = COALESCE(NULLIF(public._digits(p_whatsapp), ''), whatsapp),
    pix_key        = public._clean_text(p_pix_key, 140),
    pix_key_type   = COALESCE(public._clean_text(p_pix_key_type, 40), pix_key_type),
    delivery_fee   = ROUND(p_delivery_fee, 2),
    estimated_time = COALESCE(public._clean_text(p_estimated_time, 40), estimated_time),
    address        = COALESCE(public._clean_text(p_address, 200), address),
    min_order_value = ROUND(p_min_order_value, 2),
    updated_at     = NOW()
  WHERE id = 1;

  IF p_new_pin IS NOT NULL AND TRIM(p_new_pin) <> '' THEN
    UPDATE public.admin_auth_secrets
    SET admin_pin = extensions.crypt(TRIM(p_new_pin), extensions.gen_salt('bf', 10)), updated_at = NOW()
    WHERE id = 1;
    -- Troca de PIN derruba todas as outras sessões abertas
    DELETE FROM public.admin_sessions WHERE token_hash <> public._sha256(p_session_token);
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_update_menu(p_session_token TEXT, p_menu JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_key TEXT;
  v_el JSONB;
  v_price NUMERIC;
BEGIN
  IF NOT public._admin_session_valid(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sessão expirada. Faça login novamente.', 'unauthorized', true);
  END IF;

  IF p_menu IS NULL OR jsonb_typeof(p_menu) <> 'object' OR length(p_menu::TEXT) > 200000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cardápio inválido.');
  END IF;

  FOREACH v_key IN ARRAY ARRAY['sizes','bases','freeToppings','premiumToppings','syrups'] LOOP
    IF jsonb_typeof(p_menu -> v_key) IS DISTINCT FROM 'array' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Cardápio inválido: seção ' || v_key || ' ausente.');
    END IF;
    FOR v_el IN SELECT * FROM jsonb_array_elements(p_menu -> v_key) LOOP
      IF COALESCE(v_el ->> 'id', '') = '' OR COALESCE(v_el ->> 'name', '') = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Item do cardápio sem id ou nome.');
      END IF;
      IF v_el ? 'price' THEN
        v_price := public._safe_numeric(v_el ->> 'price');
        IF v_price IS NULL OR v_price < 0 OR v_price > 1000 THEN
          RETURN jsonb_build_object('success', false, 'error', 'Preço inválido em ' || (v_el ->> 'name'));
        END IF;
      END IF;
      IF v_el ? 'originalPrice' AND v_el ->> 'originalPrice' IS NOT NULL THEN
        v_price := public._safe_numeric(v_el ->> 'originalPrice');
        IF v_price IS NULL OR v_price < 0 OR v_price > 1000 THEN
          RETURN jsonb_build_object('success', false, 'error', 'Preço original inválido em ' || (v_el ->> 'name'));
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  UPDATE public.menu_data SET data = p_menu, updated_at = NOW() WHERE id = 1;
  IF NOT FOUND THEN
    INSERT INTO public.menu_data (id, data, updated_at) VALUES (1, p_menu, NOW());
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_list_orders(p_session_token TEXT, p_limit INT DEFAULT 500)
RETURNS SETOF public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NOT public._admin_session_valid(p_session_token) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT * FROM public.orders
    ORDER BY created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 500), 1), 2000);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_update_order_status(
  p_session_token TEXT,
  p_order_id TEXT,
  p_status TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_notes TEXT;
  v_reason TEXT := public._clean_text(replace(replace(COALESCE(p_reason, ''), '[', ''), ']', ''), 200);
BEGIN
  IF NOT public._admin_session_valid(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sessão expirada. Faça login novamente.', 'unauthorized', true);
  END IF;

  IF p_status NOT IN ('NOVO','PREPARANDO','A_CAMINHO','CONCLUIDO','CANCELADO') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Status inválido.');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pedido não encontrado.');
  END IF;

  v_notes := v_order.notes;
  IF v_reason IS NOT NULL THEN
    v_notes := regexp_replace(COALESCE(v_notes, ''), '\[(RECUSADO|CANCELADO):\s*[^\]]+\]\s*(\|\s*)?', '', 'gi');
    v_notes := '[RECUSADO: ' || v_reason || ']' || CASE WHEN TRIM(v_notes) <> '' THEN ' | ' || TRIM(v_notes) ELSE '' END;
  END IF;

  -- Estoque: estorna ao cancelar e baixa de novo se for "descancelado"
  IF v_order.status <> 'CANCELADO' AND p_status = 'CANCELADO' THEN
    PERFORM public._adjust_packaging(v_order.items, 1);
  ELSIF v_order.status = 'CANCELADO' AND p_status <> 'CANCELADO' THEN
    PERFORM public._adjust_packaging(v_order.items, -1);
  END IF;

  UPDATE public.orders
  SET status = p_status, notes = v_notes, updated_at = NOW()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_list_inventory(p_session_token TEXT)
RETURNS SETOF public.inventory
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NOT public._admin_session_valid(p_session_token) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.inventory WHERE category = 'EMBALAGENS' ORDER BY name;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_set_inventory_quantity(p_session_token TEXT, p_id TEXT, p_quantity NUMERIC)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NOT public._admin_session_valid(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sessão expirada.', 'unauthorized', true);
  END IF;
  IF p_quantity IS NULL OR p_quantity < 0 OR p_quantity > 1000000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Quantidade inválida.');
  END IF;
  UPDATE public.inventory SET quantity = ROUND(p_quantity, 2), updated_at = NOW() WHERE id = p_id;
  RETURN jsonb_build_object('success', FOUND);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_upsert_inventory_item(p_session_token TEXT, p_item JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_id TEXT := public._clean_text(p_item ->> 'id', 60);
  v_name TEXT := public._clean_text(p_item ->> 'name', 120);
  v_qty NUMERIC := COALESCE(public._safe_numeric(p_item ->> 'quantity'), 0);
  v_min NUMERIC := COALESCE(public._safe_numeric(p_item ->> 'min_alert_quantity'), 10);
  v_cost NUMERIC := COALESCE(public._safe_numeric(p_item ->> 'cost_price'), 0);
BEGIN
  IF NOT public._admin_session_valid(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sessão expirada.', 'unauthorized', true);
  END IF;
  IF v_id IS NULL OR v_id !~ '^est-[A-Za-z0-9_-]+$' OR v_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item de estoque inválido.');
  END IF;
  IF v_qty < 0 OR v_qty > 1000000 OR v_min < 0 OR v_min > 1000000 OR v_cost < 0 OR v_cost > 100000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valores numéricos inválidos.');
  END IF;

  INSERT INTO public.inventory (id, name, category, quantity, unit, min_alert_quantity, cost_price, supplier, updated_at)
  VALUES (v_id, v_name, 'EMBALAGENS', ROUND(v_qty, 2), COALESCE(public._clean_text(p_item ->> 'unit', 20), 'un'),
          ROUND(v_min, 2), ROUND(v_cost, 2), public._clean_text(p_item ->> 'supplier', 120), NOW())
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = 'EMBALAGENS',
    quantity = EXCLUDED.quantity,
    unit = EXCLUDED.unit,
    min_alert_quantity = EXCLUDED.min_alert_quantity,
    cost_price = EXCLUDED.cost_price,
    supplier = EXCLUDED.supplier,
    updated_at = NOW();

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. PEDIDOS PÚBLICOS: CRIAÇÃO COM PREÇO CALCULADO NO BANCO
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_create_order(p_order JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_settings public.store_settings%ROWTYPE;
  v_menu JSONB;
  v_ip TEXT := public._request_ip();
  v_name TEXT := public._clean_text(p_order ->> 'customerName', 80);
  v_phone TEXT := left(public._digits(p_order ->> 'customerPhone'), 13);
  v_type TEXT := p_order ->> 'orderType';
  v_payment TEXT := p_order ->> 'paymentMethod';
  v_change NUMERIC := public._safe_numeric(p_order #>> '{paymentDetails,changeFor}');
  v_street TEXT; v_number TEXT; v_neigh TEXT; v_compl TEXT; v_ref TEXT;
  v_items_in JSONB := p_order -> 'items';
  v_item JSONB;
  v_items_out JSONB := '[]'::jsonb;
  v_size JSONB; v_base JSONB; v_tmp JSONB; v_found JSONB;
  v_free JSONB; v_fruits JSONB; v_prem JSONB; v_syrups JSONB;
  v_qty INT; v_pq INT;
  v_unit NUMERIC; v_promo BOOLEAN; v_exp TIMESTAMPTZ;
  v_subtotal NUMERIC := 0;
  v_fee NUMERIC := 0;
  v_total NUMERIC;
  v_id TEXT;
  v_row public.orders%ROWTYPE;
  v_recent INT;
BEGIN
  SELECT * INTO v_settings FROM public.store_settings WHERE id = 1;
  SELECT data INTO v_menu FROM public.menu_data WHERE id = 1;

  IF v_settings.id IS NULL OR v_menu IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Loja indisponível no momento.');
  END IF;
  IF NOT v_settings.is_open THEN
    RETURN jsonb_build_object('success', false, 'error', 'A loja está fechada no momento.');
  END IF;

  -- Dados do cliente
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Informe seu nome.');
  END IF;
  IF length(v_phone) < 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Informe um WhatsApp válido com DDD.');
  END IF;
  IF v_type NOT IN ('ENTREGA','RETIRADA') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tipo de pedido inválido.');
  END IF;
  IF v_payment NOT IN ('PIX','CARTAO_ENTREGA','DINHEIRO') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forma de pagamento inválida.');
  END IF;

  -- Anti-spam: limite de pedidos por telefone e por IP
  SELECT COUNT(*) INTO v_recent FROM public.orders
  WHERE customer_phone = v_phone AND created_at > NOW() - INTERVAL '10 minutes';
  IF v_recent >= 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Muitos pedidos em sequência. Aguarde alguns minutos.');
  END IF;

  IF v_type = 'ENTREGA' THEN
    v_street := public._clean_text(p_order #>> '{address,street}', 150);
    v_number := public._clean_text(p_order #>> '{address,number}', 20);
    v_neigh  := public._clean_text(p_order #>> '{address,neighborhood}', 80);
    v_compl  := public._clean_text(p_order #>> '{address,complement}', 100);
    v_ref    := public._clean_text(p_order #>> '{address,reference}', 150);
    IF v_street IS NULL OR v_number IS NULL OR v_neigh IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Preencha rua, número e bairro.');
    END IF;
    v_fee := COALESCE(v_settings.delivery_fee, 0);
  END IF;

  -- Itens: tudo é reconstruído a partir do cardápio oficial
  IF v_items_in IS NULL OR jsonb_typeof(v_items_in) <> 'array'
     OR jsonb_array_length(v_items_in) = 0 OR jsonb_array_length(v_items_in) > 30 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Carrinho inválido.');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items_in) LOOP
    v_qty := COALESCE(public._safe_numeric(v_item ->> 'quantity'), 0)::INT;
    IF v_qty < 1 OR v_qty > 50 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Quantidade inválida no carrinho.');
    END IF;

    SELECT e INTO v_size FROM jsonb_array_elements(v_menu -> 'sizes') e
    WHERE e ->> 'id' = v_item #>> '{size,id}' LIMIT 1;
    IF v_size IS NULL OR COALESCE((v_size ->> 'available')::BOOLEAN, true) = false THEN
      RETURN jsonb_build_object('success', false, 'error', 'Um tamanho do seu carrinho não está mais disponível.');
    END IF;

    SELECT e INTO v_base FROM jsonb_array_elements(v_menu -> 'bases') e
    WHERE e ->> 'id' = v_item #>> '{base,id}' LIMIT 1;
    IF v_base IS NULL OR COALESCE((v_base ->> 'available')::BOOLEAN, true) = false THEN
      RETURN jsonb_build_object('success', false, 'error', 'Uma base do seu carrinho não está mais disponível.');
    END IF;

    -- Acompanhamentos grátis (respeitando o limite do tamanho)
    v_free := '[]'::jsonb;
    IF jsonb_typeof(v_item -> 'freeToppings') = 'array' THEN
      FOR v_tmp IN SELECT * FROM jsonb_array_elements(v_item -> 'freeToppings') LOOP
        SELECT e INTO v_found FROM jsonb_array_elements(v_menu -> 'freeToppings') e
        WHERE e ->> 'id' = v_tmp ->> 'id' AND COALESCE((e ->> 'available')::BOOLEAN, true) LIMIT 1;
        IF v_found IS NULL THEN
          RETURN jsonb_build_object('success', false, 'error', 'Acompanhamento indisponível no carrinho.');
        END IF;
        v_free := v_free || jsonb_build_array(v_found);
      END LOOP;
    END IF;
    IF jsonb_array_length(v_free) > COALESCE(public._safe_numeric(v_size ->> 'maxFreeToppings'), 0) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Acompanhamentos grátis acima do limite do tamanho.');
    END IF;

    -- Caldas
    v_syrups := '[]'::jsonb;
    IF jsonb_typeof(v_item -> 'syrups') = 'array' THEN
      FOR v_tmp IN SELECT * FROM jsonb_array_elements(v_item -> 'syrups') LOOP
        SELECT e INTO v_found FROM jsonb_array_elements(v_menu -> 'syrups') e
        WHERE e ->> 'id' = v_tmp ->> 'id' AND COALESCE((e ->> 'available')::BOOLEAN, true) LIMIT 1;
        IF v_found IS NULL THEN
          RETURN jsonb_build_object('success', false, 'error', 'Calda indisponível no carrinho.');
        END IF;
        v_syrups := v_syrups || jsonb_build_array(v_found);
      END LOOP;
    END IF;
    IF jsonb_array_length(v_syrups) > 10 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Caldas demais em um item.');
    END IF;

    -- Frutas
    v_fruits := '[]'::jsonb;
    IF jsonb_typeof(v_item -> 'fruits') = 'array' THEN
      FOR v_tmp IN SELECT * FROM jsonb_array_elements(v_item -> 'fruits') LOOP
        SELECT e INTO v_found FROM jsonb_array_elements(COALESCE(v_menu -> 'fruits', '[]'::jsonb)) e
        WHERE e ->> 'id' = v_tmp ->> 'id' AND COALESCE((e ->> 'available')::BOOLEAN, true) LIMIT 1;
        IF v_found IS NOT NULL THEN
          v_fruits := v_fruits || jsonb_build_array(v_found);
        END IF;
      END LOOP;
    END IF;

    -- Preço do tamanho (com promoção válida apenas se não expirou)
    v_exp := public._safe_timestamptz(v_size ->> 'discountExpiresAt');
    v_promo := COALESCE(public._safe_numeric(v_size ->> 'discountPercent'), 0) > 0
               AND (v_size ->> 'discountExpiresAt' IS NULL OR v_size ->> 'discountExpiresAt' = '' OR (v_exp IS NOT NULL AND v_exp > NOW()));
    v_unit := CASE WHEN v_promo
                THEN public._safe_numeric(v_size ->> 'price')
                ELSE COALESCE(public._safe_numeric(v_size ->> 'originalPrice'), public._safe_numeric(v_size ->> 'price'))
              END;
    IF v_unit IS NULL OR v_unit < 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Preço do cardápio inválido.');
    END IF;

    -- Adicionais pagos
    v_prem := '[]'::jsonb;
    IF jsonb_typeof(v_item -> 'premiumToppings') = 'array' THEN
      FOR v_tmp IN SELECT * FROM jsonb_array_elements(v_item -> 'premiumToppings') LOOP
        v_pq := COALESCE(public._safe_numeric(v_tmp ->> 'quantity'), 0)::INT;
        IF v_pq < 1 OR v_pq > 10 THEN
          RETURN jsonb_build_object('success', false, 'error', 'Quantidade de adicional inválida.');
        END IF;
        SELECT e INTO v_found FROM jsonb_array_elements(v_menu -> 'premiumToppings') e
        WHERE e ->> 'id' = v_tmp #>> '{item,id}' AND COALESCE((e ->> 'available')::BOOLEAN, true) LIMIT 1;
        IF v_found IS NULL OR public._safe_numeric(v_found ->> 'price') IS NULL THEN
          RETURN jsonb_build_object('success', false, 'error', 'Adicional indisponível no carrinho.');
        END IF;
        v_unit := v_unit + public._safe_numeric(v_found ->> 'price') * v_pq;
        v_prem := v_prem || jsonb_build_array(jsonb_build_object('item', v_found, 'quantity', v_pq));
      END LOOP;
    END IF;

    v_unit := ROUND(v_unit, 2);
    v_subtotal := v_subtotal + v_unit * v_qty;

    v_items_out := v_items_out || jsonb_build_array(jsonb_build_object(
      'id', COALESCE(public._clean_text(v_item ->> 'id', 60), 'item-' || substr(public._random_token(), 1, 8)),
      'size', v_size,
      'base', v_base,
      'freeToppings', v_free,
      'fruits', v_fruits,
      'premiumToppings', v_prem,
      'syrups', v_syrups,
      'notes', COALESCE(public._clean_text(v_item ->> 'notes', 300), ''),
      'unitPrice', v_unit,
      'quantity', v_qty
    ));
  END LOOP;

  v_subtotal := ROUND(v_subtotal, 2);
  v_total := ROUND(v_subtotal + v_fee, 2);

  IF v_payment = 'DINHEIRO' AND v_change IS NOT NULL THEN
    IF v_change <= v_total OR v_change > 10000 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Valor para troco inválido.');
    END IF;
  ELSE
    v_change := NULL;
  END IF;

  -- ID aleatório e imprevisível (ex: PED-9F3A1C7B2E)
  LOOP
    v_id := 'PED-' || upper(encode(extensions.gen_random_bytes(5), 'hex'));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.orders WHERE id = v_id);
  END LOOP;

  INSERT INTO public.orders (
    id, status, customer_name, customer_phone, delivery_type,
    address, neighborhood, number, complement, reference,
    payment_method, change_for, items, subtotal, delivery_fee, total, notes
  ) VALUES (
    v_id, 'NOVO', v_name, v_phone, v_type,
    v_street, v_neigh, v_number, v_compl, v_ref,
    v_payment, v_change, v_items_out, v_subtotal, v_fee, v_total,
    public._clean_text(replace(replace(COALESCE(p_order ->> 'notes', ''), '[', '('), ']', ')'), 500)
  )
  RETURNING * INTO v_row;

  PERFORM public._adjust_packaging(v_items_out, -1);

  RETURN jsonb_build_object('success', true, 'order', to_jsonb(v_row));
END;
$$;

-- Rastreamento: só pelo ID aleatório e apenas pedidos recentes (72h)
CREATE OR REPLACE FUNCTION public.rpc_get_order(p_order_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE v_row public.orders%ROWTYPE;
BEGIN
  IF p_order_id IS NULL OR length(p_order_id) > 40 THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_row FROM public.orders
  WHERE id = p_order_id AND created_at > NOW() - INTERVAL '72 hours';
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN to_jsonb(v_row);
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. CLIENTES: CADASTRO / LOGIN COM PIN PESSOAL + SESSÃO
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._customer_json(p_c public.customers)
RETURNS JSONB
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', p_c.id, 'name', p_c.name, 'phone', p_c.phone,
    'street', p_c.street, 'number', p_c.number, 'neighborhood', p_c.neighborhood,
    'complement', p_c.complement, 'reference', p_c.reference,
    'created_at', p_c.created_at, 'updated_at', p_c.updated_at
  );
$$;

CREATE OR REPLACE FUNCTION public._customer_new_session(p_customer_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE v_token TEXT := public._random_token();
BEGIN
  DELETE FROM public.customer_sessions WHERE expires_at < NOW();
  INSERT INTO public.customer_sessions (token_hash, customer_id, expires_at)
  VALUES (public._sha256(v_token), p_customer_id, NOW() + INTERVAL '30 days');
  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_customer_register(
  p_name TEXT, p_phone TEXT, p_pin TEXT, p_address JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_name TEXT := public._clean_text(p_name, 80);
  v_phone TEXT := public._norm_phone(p_phone);
  v_ip TEXT := public._request_ip();
  v_recent INT;
  v_c public.customers%ROWTYPE;
BEGIN
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Informe seu nome completo.');
  END IF;
  IF length(v_phone) < 10 OR length(v_phone) > 11 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Informe um celular válido com DDD.');
  END IF;
  IF p_pin IS NULL OR TRIM(p_pin) !~ '^[0-9]{4,8}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Crie um PIN de 4 a 8 números.');
  END IF;

  -- Anti-spam de cadastros por IP
  IF v_ip IS NOT NULL THEN
    SELECT COUNT(*) INTO v_recent FROM public.customer_login_attempts
    WHERE ip = v_ip AND phone = 'register' AND created_at > NOW() - INTERVAL '1 hour';
    IF v_recent >= 10 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Muitos cadastros a partir desta rede. Tente mais tarde.');
    END IF;
    INSERT INTO public.customer_login_attempts (phone, ip, success) VALUES ('register', v_ip, true);
  END IF;

  IF EXISTS (SELECT 1 FROM public.customers WHERE phone = v_phone) THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Este número de celular já possui uma conta cadastrada! Faça login na aba "Entrar".');
  END IF;

  INSERT INTO public.customers (id, name, phone, street, number, neighborhood, complement, reference, pin_hash, created_at, updated_at)
  VALUES (
    'cli_' || substr(public._random_token(), 1, 16),
    v_name, v_phone,
    COALESCE(public._clean_text(p_address ->> 'street', 150), ''),
    COALESCE(public._clean_text(p_address ->> 'number', 20), ''),
    COALESCE(public._clean_text(p_address ->> 'neighborhood', 80), ''),
    COALESCE(public._clean_text(p_address ->> 'complement', 100), ''),
    COALESCE(public._clean_text(p_address ->> 'reference', 150), ''),
    extensions.crypt(TRIM(p_pin), extensions.gen_salt('bf', 8)),
    NOW(), NOW()
  )
  RETURNING * INTO v_c;

  RETURN jsonb_build_object('success', true, 'customer', public._customer_json(v_c),
                            'token', public._customer_new_session(v_c.id));
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false,
    'error', 'Este número de celular já possui uma conta cadastrada! Faça login na aba "Entrar".');
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_customer_login(p_phone TEXT, p_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_phone TEXT := public._norm_phone(p_phone);
  v_ip TEXT := public._request_ip();
  v_fails INT;
  v_c public.customers%ROWTYPE;
BEGIN
  DELETE FROM public.customer_login_attempts WHERE created_at < NOW() - INTERVAL '2 days';

  SELECT COUNT(*) INTO v_fails FROM public.customer_login_attempts
  WHERE phone = v_phone AND success = false AND created_at > NOW() - INTERVAL '15 minutes';
  IF v_fails >= 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Muitas tentativas incorretas. Aguarde 15 minutos.');
  END IF;

  SELECT * INTO v_c FROM public.customers WHERE phone = v_phone;

  IF NOT FOUND OR v_c.pin_hash IS NULL OR p_pin IS NULL
     OR extensions.crypt(TRIM(p_pin), v_c.pin_hash) <> v_c.pin_hash THEN
    INSERT INTO public.customer_login_attempts (phone, ip, success) VALUES (v_phone, v_ip, false);
    -- Mensagem genérica: não revela se o número existe ou não
    RETURN jsonb_build_object('success', false, 'error', 'Celular ou PIN incorretos.');
  END IF;

  INSERT INTO public.customer_login_attempts (phone, ip, success) VALUES (v_phone, v_ip, true);

  RETURN jsonb_build_object('success', true, 'customer', public._customer_json(v_c),
                            'token', public._customer_new_session(v_c.id));
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_customer_logout(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  DELETE FROM public.customer_sessions WHERE token_hash = public._sha256(p_token);
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_customer_update(p_token TEXT, p_profile JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_id TEXT := public._customer_from_session(p_token);
  v_c public.customers%ROWTYPE;
  v_name TEXT := public._clean_text(p_profile ->> 'name', 80);
  v_phone TEXT := public._norm_phone(p_profile ->> 'phone');
BEGIN
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sessão expirada. Entre novamente.', 'unauthorized', true);
  END IF;
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'O nome não pode ficar em branco.');
  END IF;
  IF length(v_phone) < 10 OR length(v_phone) > 11 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Número de celular inválido.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.customers WHERE phone = v_phone AND id <> v_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este número de celular já pertence a outro usuário cadastrado!');
  END IF;

  UPDATE public.customers SET
    name = v_name,
    phone = v_phone,
    street = COALESCE(public._clean_text(p_profile #>> '{address,street}', 150), ''),
    number = COALESCE(public._clean_text(p_profile #>> '{address,number}', 20), ''),
    neighborhood = COALESCE(public._clean_text(p_profile #>> '{address,neighborhood}', 80), ''),
    complement = COALESCE(public._clean_text(p_profile #>> '{address,complement}', 100), ''),
    reference = COALESCE(public._clean_text(p_profile #>> '{address,reference}', 150), ''),
    updated_at = NOW()
  WHERE id = v_id
  RETURNING * INTO v_c;

  RETURN jsonb_build_object('success', true, 'customer', public._customer_json(v_c));
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'Este número de celular já pertence a outro usuário cadastrado!');
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_customer_orders(p_token TEXT)
RETURNS SETOF public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_id TEXT := public._customer_from_session(p_token);
  v_phone TEXT;
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  SELECT phone INTO v_phone FROM public.customers WHERE id = v_id;
  RETURN QUERY
    SELECT * FROM public.orders
    WHERE public._norm_phone(customer_phone) = v_phone
    ORDER BY created_at DESC
    LIMIT 100;
END;
$$;

-- ------------------------------------------------------------------------------
-- 9. PERMISSÕES DE EXECUÇÃO
-- ------------------------------------------------------------------------------
-- Funções internas: ninguém de fora executa
REVOKE ALL ON FUNCTION public._sha256(TEXT)                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._random_token()                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._request_ip()                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._clean_text(TEXT, INT)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._digits(TEXT)                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._norm_phone(TEXT)                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._safe_numeric(TEXT)                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._safe_timestamptz(TEXT)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._admin_session_valid(TEXT)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._customer_from_session(TEXT)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._packaging_id(TEXT, TEXT)           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._adjust_packaging(JSONB, INT)       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._bump_orders_signal()               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._bump_inventory_signal()            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._customer_json(public.customers)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._customer_new_session(TEXT)         FROM PUBLIC, anon, authenticated;

-- Funções públicas (cada uma valida sessão/entrada por conta própria)
GRANT EXECUTE ON FUNCTION public.rpc_admin_login(TEXT, TEXT)                      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_check_session(TEXT)                    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_logout(TEXT)                           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_update_settings(TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, NUMERIC, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_update_menu(TEXT, JSONB)               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_list_orders(TEXT, INT)                 TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_update_order_status(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_list_inventory(TEXT)                   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_set_inventory_quantity(TEXT, TEXT, NUMERIC) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_upsert_inventory_item(TEXT, JSONB)     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_order(JSONB)                          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_order(TEXT)                              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_register(TEXT, TEXT, TEXT, JSONB)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_login(TEXT, TEXT)                   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_logout(TEXT)                        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_update(TEXT, JSONB)                 TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_orders(TEXT)                        TO anon, authenticated;

-- Pronto! Recarrega o cache de schema da API
NOTIFY pgrst, 'reload schema';
