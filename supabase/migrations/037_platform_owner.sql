-- ============================================================
-- Platform Owner — one row per platform owner.
-- ============================================================
ALTER TABLE profiles
ADD COLUMN is_platform_owner boolean NOT NULL DEFAULT false;
