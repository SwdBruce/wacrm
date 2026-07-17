-- ============================================================
-- 040_purchase_quantity_override.sql
--
-- Editing "remaining" by inserting tens of thousands of
-- message_credit_usages rows does not scale (PostgREST / payload
-- limits) and left packs in a half-adjusted state. Instead, store
-- an optional quantity_override on the purchase:
--
--   effective_quantity = COALESCE(quantity_override, package.quantity)
--   remaining = max(0, effective_quantity - used)
-- ============================================================

ALTER TABLE public.account_message_purchases
  ADD COLUMN IF NOT EXISTS quantity_override INTEGER
    CHECK (quantity_override IS NULL OR quantity_override >= 0);

COMMENT ON COLUMN public.account_message_purchases.quantity_override IS
  'When set, replaces message_packages.quantity for remaining/used maths. Platform-owner balance edits use this instead of bulk usage rows.';
