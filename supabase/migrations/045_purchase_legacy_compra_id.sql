-- ============================================================
-- 045_purchase_legacy_compra_id.sql
--
-- Track Fratalk `compra.id` on CRM purchases so platform owners
-- can migrate active legacy packs without duplicating them.
-- ============================================================

ALTER TABLE public.account_message_purchases
  ADD COLUMN IF NOT EXISTS legacy_compra_id INTEGER;

COMMENT ON COLUMN public.account_message_purchases.legacy_compra_id IS
  'Fratalk compra.id when this purchase was migrated from legacy saldo; NULL for CRM-native assigns.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_message_purchases_legacy_compra
  ON public.account_message_purchases(account_id, legacy_compra_id)
  WHERE legacy_compra_id IS NOT NULL;
