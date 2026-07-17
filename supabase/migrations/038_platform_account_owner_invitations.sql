-- ============================================================
-- 038_platform_account_owner_invitations.sql
--
-- Platform-owner bootstrap flow:
--   1. A platform owner creates an empty organisation.
--   2. The DB atomically creates a one-time owner invitation.
--   3. The invitee signs up/signs in and redeems the existing
--      /join/<token> link.
--   4. Redemption assigns both profiles.account_role = 'owner'
--      and accounts.owner_user_id = auth.uid().
--
-- Owner invitations deliberately live in their own table. Normal
-- account_invitations retains CHECK (role <> 'owner'), so an account
-- admin can never turn the regular Members flow into privilege
-- escalation.
-- ============================================================

-- A platform-created account has no owner until its bootstrap link is
-- redeemed. The existing unique owner index permits multiple NULLs.
ALTER TABLE public.accounts
  ALTER COLUMN owner_user_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.platform_account_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_account_invites_pending
  ON public.platform_account_invitations(account_id, expires_at)
  WHERE accepted_at IS NULL;

-- At most one still-pending owner invitation per organisation.
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_account_invites_one_pending
  ON public.platform_account_invitations(account_id)
  WHERE accepted_at IS NULL;

ALTER TABLE public.platform_account_invitations ENABLE ROW LEVEL SECURITY;
-- No browser policies by design. Reads/writes happen only inside the
-- SECURITY DEFINER functions below (or through service_role).

-- ============================================================
-- Protect the platform-owner flag from browser self-promotion.
-- Extends migration 034's existing privilege-column guard.
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_profile_privilege_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.account_role IS DISTINCT FROM OLD.account_role
      OR NEW.account_id IS DISTINCT FROM OLD.account_id
      OR NEW.is_platform_owner IS DISTINCT FROM OLD.is_platform_owner)
     AND current_user = 'authenticated'
  THEN
    RAISE EXCEPTION
      'account_role, account_id and is_platform_owner cannot be changed directly'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_profile_privilege_columns() OWNER TO postgres;

-- ============================================================
-- create_platform_account_invitation
--
-- Authenticated platform-owner only. Creates the ownerless account
-- and its owner invitation in one transaction. The plaintext token
-- never reaches Postgres — only its SHA-256 hash.
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_platform_account_invitation(
  p_name TEXT,
  p_token_hash TEXT,
  p_expires_at TIMESTAMPTZ
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

  IF p_expires_at <= NOW() THEN
    RAISE EXCEPTION 'Invitation expiry must be in the future'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.accounts (name, owner_user_id)
  VALUES (v_name, NULL)
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
END;
$$;

ALTER FUNCTION public.create_platform_account_invitation(TEXT, TEXT, TIMESTAMPTZ)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_platform_account_invitation(TEXT, TEXT, TIMESTAMPTZ)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_platform_account_invitation(TEXT, TEXT, TIMESTAMPTZ)
  TO authenticated;

-- ============================================================
-- Extend peek_invitation to recognise both invitation tables.
-- The public response shape remains unchanged; bootstrap invites
-- simply return role = 'owner'.
-- ============================================================
CREATE OR REPLACE FUNCTION public.peek_invitation(
  p_token_hash TEXT
) RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.account_invitations%ROWTYPE;
  v_platform_inv public.platform_account_invitations%ROWTYPE;
  v_account_name TEXT;
BEGIN
  SELECT * INTO v_inv
  FROM public.account_invitations
  WHERE token_hash = p_token_hash;

  IF FOUND THEN
    IF v_inv.accepted_at IS NOT NULL THEN
      RETURN json_build_object('ok', false, 'reason', 'used');
    END IF;
    IF v_inv.expires_at <= NOW() THEN
      RETURN json_build_object('ok', false, 'reason', 'expired');
    END IF;

    SELECT name INTO v_account_name
    FROM public.accounts
    WHERE id = v_inv.account_id;

    RETURN json_build_object(
      'ok', true,
      'account_name', v_account_name,
      'role', v_inv.role,
      'expires_at', v_inv.expires_at
    );
  END IF;

  SELECT * INTO v_platform_inv
  FROM public.platform_account_invitations
  WHERE token_hash = p_token_hash;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_platform_inv.accepted_at IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'reason', 'used');
  END IF;
  IF v_platform_inv.expires_at <= NOW() THEN
    RETURN json_build_object('ok', false, 'reason', 'expired');
  END IF;

  SELECT name INTO v_account_name
  FROM public.accounts
  WHERE id = v_platform_inv.account_id;

  RETURN json_build_object(
    'ok', true,
    'account_name', v_account_name,
    'role', 'owner',
    'expires_at', v_platform_inv.expires_at
  );
END;
$$;

ALTER FUNCTION public.peek_invitation(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.peek_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.peek_invitation(TEXT) TO anon, authenticated;

-- ============================================================
-- Extend redeem_invitation to claim an ownerless platform account.
-- Normal invitations retain their existing behaviour.
-- ============================================================
CREATE OR REPLACE FUNCTION public.redeem_invitation(
  p_token_hash TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_inv public.account_invitations%ROWTYPE;
  v_platform_inv public.platform_account_invitations%ROWTYPE;
  v_is_platform_invite BOOLEAN := FALSE;
  v_target_account_id UUID;
  v_old_account_id UUID;
  v_old_account_owner UUID;
  v_has_data BOOLEAN;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Lock whichever invitation exists so two redemptions cannot race.
  SELECT * INTO v_inv
  FROM public.account_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF FOUND THEN
    IF v_inv.accepted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Invitation has already been redeemed'
        USING ERRCODE = '22023';
    END IF;
    IF v_inv.expires_at <= NOW() THEN
      RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = '22023';
    END IF;
    v_target_account_id := v_inv.account_id;
  ELSE
    SELECT * INTO v_platform_inv
    FROM public.platform_account_invitations
    WHERE token_hash = p_token_hash
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invitation not found' USING ERRCODE = '22023';
    END IF;
    IF v_platform_inv.accepted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Invitation has already been redeemed'
        USING ERRCODE = '22023';
    END IF;
    IF v_platform_inv.expires_at <= NOW() THEN
      RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = '22023';
    END IF;

    v_is_platform_invite := TRUE;
    v_target_account_id := v_platform_inv.account_id;

    -- The bootstrap link can claim only an ownerless account.
    IF EXISTS (
      SELECT 1 FROM public.accounts
      WHERE id = v_target_account_id
        AND owner_user_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Organisation already has an owner'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  SELECT p.account_id, a.owner_user_id
  INTO v_old_account_id, v_old_account_owner
  FROM public.profiles p
  JOIN public.accounts a ON a.id = p.account_id
  WHERE p.user_id = v_caller_id;

  IF v_old_account_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no profile' USING ERRCODE = '42501';
  END IF;
  IF v_old_account_id = v_target_account_id THEN
    RAISE EXCEPTION 'You are already a member of this account'
      USING ERRCODE = '23505';
  END IF;
  IF v_old_account_owner <> v_caller_id THEN
    RAISE EXCEPTION 'You are already in a shared account; sign up with a different email to join this one'
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
    RAISE EXCEPTION 'Your account already contains data; sign up with a different email to join this one'
      USING ERRCODE = '23505';
  END IF;

  -- Move the profile off the personal account first so the cascade
  -- delete below doesn't try to remove this user's profile row.
  UPDATE public.profiles
  SET account_id = v_target_account_id,
      account_role = CASE
        WHEN v_is_platform_invite THEN 'owner'::account_role_enum
        ELSE v_inv.role
      END
  WHERE user_id = v_caller_id;

  -- Drop the caller's now-orphaned personal account BEFORE claiming
  -- ownership of the target. The caller still owns the personal
  -- account at this point; assigning them as owner of the target
  -- first would momentarily make them own two accounts and trip the
  -- `idx_accounts_one_per_owner` unique index. Deleting first keeps
  -- the "one account per owner" invariant satisfied throughout.
  DELETE FROM public.accounts WHERE id = v_old_account_id;

  IF v_is_platform_invite THEN
    UPDATE public.accounts
    SET owner_user_id = v_caller_id
    WHERE id = v_target_account_id
      AND owner_user_id IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Organisation already has an owner'
        USING ERRCODE = '23505';
    END IF;

    UPDATE public.platform_account_invitations
    SET accepted_at = NOW(),
        accepted_by_user_id = v_caller_id
    WHERE id = v_platform_inv.id;
  ELSE
    UPDATE public.account_invitations
    SET accepted_at = NOW(),
        accepted_by_user_id = v_caller_id
    WHERE id = v_inv.id;
  END IF;

  RETURN v_target_account_id;
END;
$$;

ALTER FUNCTION public.redeem_invitation(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.redeem_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_invitation(TEXT) TO authenticated;
