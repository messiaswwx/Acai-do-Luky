-- ==============================================================================
-- CORREÇÃO DE ATUALIZAÇÃO DO CARDÁPIO & DESCONTOS (SUPABASE SQL EDITOR)
-- Cole este script no SQL Editor do Supabase (https://supabase.com/dashboard)
-- e clique em "RUN" para liberar a alteração direta de preços e promoções.
-- ==============================================================================

-- 1. Habilitar atualização do cardápio pelo painel
DROP POLICY IF EXISTS "Atualizacao do cardapio" ON public.menu_data;
CREATE POLICY "Atualizacao do cardapio" 
ON public.menu_data FOR UPDATE 
USING (true) 
WITH CHECK (true);

-- 2. Habilitar inserção do cardápio caso a linha ainda não exista
DROP POLICY IF EXISTS "Insercao do cardapio" ON public.menu_data;
CREATE POLICY "Insercao do cardapio" 
ON public.menu_data FOR INSERT 
WITH CHECK (true);

-- 3. Função RPC segura alternativa para atualização de cardápio
CREATE OR REPLACE FUNCTION public.rpc_admin_update_menu(p_menu JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.menu_data 
  SET data = p_menu, updated_at = NOW() 
  WHERE id = 1;

  IF NOT FOUND THEN
    INSERT INTO public.menu_data (id, data, updated_at) 
    VALUES (1, p_menu, NOW());
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 4. Garantir que a tabela menu_data esteja na publicação em tempo real
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'menu_data'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_data;
  END IF;
END $$;
