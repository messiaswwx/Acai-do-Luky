-- ==============================================================================
-- DESATIVAR 2FA (LOGIN DIRETO POR PIN) - AÇAÍ DO LUKY
-- Cole este script no SQL Editor do Supabase (https://supabase.com/dashboard)
-- e clique em "RUN".
-- ==============================================================================

-- 1. Desativa a exigência de 2FA no banco de dados
UPDATE public.admin_auth_secrets 
SET two_factor_enabled = false 
WHERE id = 1;

UPDATE public.store_settings 
SET two_factor_enabled = false 
WHERE id = 1;

-- 2. Atualiza a função RPC para autenticar direto com o PIN (sem gerar desafios nem links)
CREATE OR REPLACE FUNCTION public.rpc_admin_login(p_pin TEXT, p_device_token TEXT DEFAULT '')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_secret RECORD;
BEGIN
  -- Busca os segredos administrativos
  SELECT * INTO v_secret FROM public.admin_auth_secrets WHERE id = 1;

  -- Valida o PIN cadastrado
  IF TRIM(p_pin) <> TRIM(v_secret.admin_pin) THEN
    RETURN jsonb_build_object('success', false, 'error', 'PIN incorreto. Acesso negado.');
  END IF;

  -- PIN correto: libera acesso diretamente com segurança
  RETURN jsonb_build_object(
    'success', true, 
    'require2FA', false, 
    'deviceTrusted', true,
    'deviceToken', COALESCE(NULLIF(p_device_token, ''), 'dev_' || EXTRACT(EPOCH FROM NOW())::BIGINT)
  );
END;
$$;
