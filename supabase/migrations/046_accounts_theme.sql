-- ============================================================
-- 046_accounts_theme.sql
--
-- Per-organisation accent theme (violet | emerald | cobalt | amber | rose).
-- Matches THEME_IDS in src/lib/themes.ts / globals.css data-theme.
-- Platform owners set it when creating a client; members see it on login.
-- ============================================================

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'violet';

ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS accounts_theme_check;

ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_theme_check
  CHECK (theme IN ('violet', 'emerald', 'cobalt', 'amber', 'rose'));

COMMENT ON COLUMN public.accounts.theme IS
  'Accent color theme id for this organisation (see src/lib/themes.ts).';

-- Extend invitation create RPC
DROP FUNCTION IF EXISTS public.create_platform_account_invitation(TEXT, TEXT, TIMESTAMPTZ, TEXT);

CREATE OR REPLACE FUNCTION public.create_platform_account_invitation(
  p_name TEXT,
  p_token_hash TEXT,
  p_expires_at TIMESTAMPTZ,
  p_ruc TEXT DEFAULT NULL,
  p_theme TEXT DEFAULT 'violet'
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_account_id UUID;
  v_invitation_id UUID;
  v_name TEXT := btrim(p_name);
  v_ruc TEXT := NULLIF(btrim(COALESCE(p_ruc, '')), '');
  v_theme TEXT := lower(btrim(COALESCE(p_theme, 'violet')));
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = v_caller_id
      AND is_platform_owner = TRUE
  ) THEN
    RAISE EXCEPTION 'Platform-owner access required'
      USING ERRCODE = '42501';
  END IF;

  IF v_name IS NULL OR v_name = '' OR char_length(v_name) > 100 THEN
    RAISE EXCEPTION 'Organisation name must be between 1 and 100 characters'
      USING ERRCODE = '22023';
  END IF;

  IF v_ruc IS NULL THEN
    RAISE EXCEPTION 'RUC is required' USING ERRCODE = '22023';
  END IF;

  IF char_length(v_ruc) > 32 THEN
    RAISE EXCEPTION 'RUC must be 32 characters or fewer'
      USING ERRCODE = '22023';
  END IF;

  IF v_theme NOT IN ('violet', 'emerald', 'cobalt', 'amber', 'rose') THEN
    RAISE EXCEPTION 'Invalid theme'
      USING ERRCODE = '22023';
  END IF;

  IF p_expires_at <= NOW() THEN
    RAISE EXCEPTION 'Invitation expiry must be in the future'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.accounts (name, owner_user_id, ruc, theme)
  VALUES (v_name, NULL, v_ruc, v_theme)
  RETURNING id INTO v_account_id;

  INSERT INTO public.platform_account_invitations (
    account_id,
    token_hash,
    created_by_user_id,
    expires_at
  )
  VALUES (
    v_account_id,
    p_token_hash,
    v_caller_id,
    p_expires_at
  )
  RETURNING id INTO v_invitation_id;

  RETURN json_build_object(
    'account_id', v_account_id,
    'invitation_id', v_invitation_id
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'An organisation with this RUC already exists'
      USING ERRCODE = '23505';
END;
$$;

ALTER FUNCTION public.create_platform_account_invitation(TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_platform_account_invitation(TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_platform_account_invitation(TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT)
  TO authenticated;

-- Extend direct-owner create RPC
DROP FUNCTION IF EXISTS public.create_platform_account_with_owner(TEXT, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.create_platform_account_with_owner(
  p_name TEXT,
  p_owner_user_id UUID,
  p_ruc TEXT DEFAULT NULL,
  p_theme TEXT DEFAULT 'violet'
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_account_id UUID;
  v_name TEXT := btrim(p_name);
  v_ruc TEXT := NULLIF(btrim(COALESCE(p_ruc, '')), '');
  v_theme TEXT := lower(btrim(COALESCE(p_theme, 'violet')));
  v_old_account_id UUID;
  v_old_account_owner UUID;
  v_has_data BOOLEAN;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = v_caller_id
      AND is_platform_owner = TRUE
  ) THEN
    RAISE EXCEPTION 'Platform-owner access required'
      USING ERRCODE = '42501';
  END IF;

  IF p_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'Owner user id is required' USING ERRCODE = '22023';
  END IF;

  IF v_name IS NULL OR v_name = '' OR char_length(v_name) > 100 THEN
    RAISE EXCEPTION 'Organisation name must be between 1 and 100 characters'
      USING ERRCODE = '22023';
  END IF;

  IF v_ruc IS NULL THEN
    RAISE EXCEPTION 'RUC is required' USING ERRCODE = '22023';
  END IF;

  IF char_length(v_ruc) > 32 THEN
    RAISE EXCEPTION 'RUC must be 32 characters or fewer'
      USING ERRCODE = '22023';
  END IF;

  IF v_theme NOT IN ('violet', 'emerald', 'cobalt', 'amber', 'rose') THEN
    RAISE EXCEPTION 'Invalid theme'
      USING ERRCODE = '22023';
  END IF;

  SELECT p.account_id, a.owner_user_id
  INTO v_old_account_id, v_old_account_owner
  FROM public.profiles p
  JOIN public.accounts a ON a.id = p.account_id
  WHERE p.user_id = p_owner_user_id;

  IF v_old_account_id IS NULL THEN
    RAISE EXCEPTION 'Owner profile not found' USING ERRCODE = '22023';
  END IF;

  IF v_old_account_owner <> p_owner_user_id THEN
    RAISE EXCEPTION 'Owner user is already in a shared account'
      USING ERRCODE = '23505';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.contacts WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM public.conversations WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM public.broadcasts WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM public.automations WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM public.flows WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM public.pipelines WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM public.message_templates WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM public.tags WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM public.custom_fields WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM public.contact_notes WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM public.whatsapp_config WHERE account_id = v_old_account_id
    LIMIT 1
  ) INTO v_has_data;

  IF v_has_data THEN
    RAISE EXCEPTION 'Owner account already contains data'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.accounts (name, owner_user_id, ruc, theme)
  VALUES (v_name, NULL, v_ruc, v_theme)
  RETURNING id INTO v_account_id;

  UPDATE public.profiles
  SET account_id = v_account_id,
      account_role = 'owner'::account_role_enum
  WHERE user_id = p_owner_user_id;

  DELETE FROM public.accounts WHERE id = v_old_account_id;

  UPDATE public.accounts
  SET owner_user_id = p_owner_user_id
  WHERE id = v_account_id
    AND owner_user_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to assign organisation owner'
      USING ERRCODE = '23505';
  END IF;

  RETURN json_build_object(
    'account_id', v_account_id
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'An organisation with this RUC already exists'
      USING ERRCODE = '23505';
END;
$$;

ALTER FUNCTION public.create_platform_account_with_owner(TEXT, UUID, TEXT, TEXT)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_platform_account_with_owner(TEXT, UUID, TEXT, TEXT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_platform_account_with_owner(TEXT, UUID, TEXT, TEXT)
  TO authenticated;
