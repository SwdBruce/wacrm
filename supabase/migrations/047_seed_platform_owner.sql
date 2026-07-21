-- ============================================================
-- 047_seed_platform_owner.sql
--
-- 1) Default accent theme → cobalt
-- 2) Bootstrap the first platform owner on fresh installs
--    (idempotent: skips if a platform owner already exists)
--
-- Edit the DECLARE constants below before the first `db push`
-- if email / password / RUC should differ.
-- ============================================================

ALTER TABLE public.accounts
  ALTER COLUMN theme SET DEFAULT 'cobalt';

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
DECLARE
  -- ── Bootstrap credentials (edit before first push) ──────────
  v_email       TEXT := 'admin@fratalk.com';
  v_password    TEXT := 'admin123';
  v_full_name   TEXT := 'FraGoTe';
  v_ruc         TEXT := '20606058200';
  v_theme       TEXT := 'cobalt';
  -- ───────────────────────────────────────────────────────────
  v_user_id     UUID;
  v_account_id  UUID;
  v_instance_id UUID := '00000000-0000-0000-0000-000000000000';
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles WHERE is_platform_owner = TRUE
  ) THEN
    RAISE NOTICE '047: platform owner already exists — skipping seed';
    RETURN;
  END IF;

  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(v_email)
  LIMIT 1;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      v_instance_id,
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      extensions.crypt(v_password, extensions.gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_full_name),
      NOW(),
      NOW(),
      '',
      '',
      '',
      ''
    );

    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      v_user_id,
      jsonb_build_object(
        'sub', v_user_id::text,
        'email', v_email,
        'email_verified', true
      ),
      'email',
      v_user_id::text,
      NOW(),
      NOW(),
      NOW()
    );
  END IF;

  -- handle_new_user trigger creates personal account + owner profile
  SELECT account_id INTO v_account_id
  FROM public.profiles
  WHERE user_id = v_user_id;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION
      '047: profile/account missing for % — handle_new_user trigger failed',
      v_email;
  END IF;

  UPDATE public.profiles
  SET
    is_platform_owner = TRUE,
    full_name = v_full_name,
    email = v_email,
    account_role = 'owner'
  WHERE user_id = v_user_id;

  UPDATE public.accounts
  SET
    name = v_full_name,
    ruc = v_ruc,
    theme = v_theme,
    owner_user_id = v_user_id
  WHERE id = v_account_id;

  RAISE NOTICE '047: platform owner seeded — % (%) theme=% ruc=%',
    v_full_name, v_email, v_theme, v_ruc;
END;
$$;
