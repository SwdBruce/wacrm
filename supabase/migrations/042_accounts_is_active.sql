-- ============================================================
-- 042_accounts_is_active.sql
--
-- Soft-deactivate organisations from the platform Clients module.
-- When is_active is false, members must not access tenant data
-- (RLS via is_account_member) or use cookie/API auth gates.
-- ============================================================

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.accounts.is_active IS
  'When false, organisation members cannot use the CRM or public API. Soft flag — data and packages are retained.';

COMMENT ON COLUMN public.accounts.deactivated_at IS
  'Set when is_active flips to false; cleared on reactivate.';

-- Membership for tenant data requires an active organisation.
CREATE OR REPLACE FUNCTION public.is_account_member(
  target_account_id UUID,
  min_role account_role_enum DEFAULT 'viewer'
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    INNER JOIN accounts a ON a.id = p.account_id
    WHERE p.user_id = auth.uid()
      AND p.account_id = target_account_id
      AND a.is_active = TRUE
      AND CASE p.account_role
            WHEN 'owner'  THEN 4
            WHEN 'admin'  THEN 3
            WHEN 'agent'  THEN 2
            WHEN 'viewer' THEN 1
          END
        >=
          CASE min_role
            WHEN 'owner'  THEN 4
            WHEN 'admin'  THEN 3
            WHEN 'agent'  THEN 2
            WHEN 'viewer' THEN 1
          END
  );
$$;

ALTER FUNCTION public.is_account_member(UUID, account_role_enum) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_account_member(UUID, account_role_enum)
  TO authenticated, service_role;

-- Allow members to SELECT their account row even when deactivated so
-- the app can read is_active=false and show a clear lockout (instead
-- of treating the org as missing). Tenant data still uses
-- is_account_member above, which requires is_active.
DROP POLICY IF EXISTS accounts_select ON public.accounts;
CREATE POLICY accounts_select ON public.accounts FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.user_id = auth.uid()
        AND p.account_id = accounts.id
    )
  );

-- Updates still require active membership at admin+ (deactivated orgs
-- cannot self-reactivate via the client).
DROP POLICY IF EXISTS accounts_update ON public.accounts;
CREATE POLICY accounts_update ON public.accounts FOR UPDATE
  USING (is_account_member(id, 'admin'))
  WITH CHECK (is_account_member(id, 'admin'));
