-- ============================================================
-- 041_accounts_ruc.sql
--
-- Optional tax ID (RUC) on organisations for the platform Clients
-- maintenance UI. Unique when present so two orgs cannot share the
-- same RUC.
-- ============================================================

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS ruc TEXT;

COMMENT ON COLUMN public.accounts.ruc IS
  'Optional tax identification number (e.g. Peru RUC). Nullable; unique when set.';

-- Empty strings should not occupy the unique slot — store NULL instead.
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_ruc_unique
  ON public.accounts (ruc)
  WHERE ruc IS NOT NULL;

-- Extend platform-owner create RPC to accept optional RUC.
DROP FUNCTION IF EXISTS public.create_platform_account_invitation(TEXT, TEXT, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.create_platform_account_invitation(
  p_name TEXT,
  p_token_hash TEXT,
  p_expires_at TIMESTAMPTZ,
  p_ruc TEXT DEFAULT NULL
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

  IF v_ruc IS NOT NULL AND char_length(v_ruc) > 32 THEN
    RAISE EXCEPTION 'RUC must be 32 characters or fewer'
      USING ERRCODE = '22023';
  END IF;

  IF p_expires_at <= NOW() THEN
    RAISE EXCEPTION 'Invitation expiry must be in the future'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.accounts (name, owner_user_id, ruc)
  VALUES (v_name, NULL, v_ruc)
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

ALTER FUNCTION public.create_platform_account_invitation(TEXT, TEXT, TIMESTAMPTZ, TEXT)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_platform_account_invitation(TEXT, TEXT, TIMESTAMPTZ, TEXT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_platform_account_invitation(TEXT, TEXT, TIMESTAMPTZ, TEXT)
  TO authenticated;
