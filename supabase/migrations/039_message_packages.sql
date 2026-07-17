-- ============================================================
-- 039_message_packages.sql
--
-- Minimal fratalk-style message credit packs, mapped to wacrm
-- accounts. Platform owner manages the catalog and assigns
-- purchases to organisations. Usage debiting on send can land
-- later; this migration only creates the management schema.
--
-- Mapping from fratalk:
--   paquete          → message_packages
--   paquete_detalle  → message_package_categories
--   compra           → account_message_purchases
--
-- No browser RLS policies: every access goes through the platform
-- API with requirePlatformOwner + service_role (same pattern as
-- platform_account_invitations).
-- ============================================================

-- Catalog of credit packs (quantity / unit price / duration).
CREATE TABLE IF NOT EXISTS public.message_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(11, 2) NOT NULL CHECK (unit_price >= 0),
  duration_days INTEGER NOT NULL CHECK (duration_days > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Which Meta template categories a pack covers.
CREATE TABLE IF NOT EXISTS public.message_package_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES public.message_packages(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (
    category IN ('MARKETING', 'UTILITY', 'AUTHENTICATION')
  ),
  UNIQUE (package_id, category)
);

CREATE INDEX IF NOT EXISTS idx_message_package_categories_package
  ON public.message_package_categories(package_id);

-- A pack assigned to an organisation for a validity window.
CREATE TABLE IF NOT EXISTS public.account_message_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.message_packages(id) ON DELETE RESTRICT,
  starts_at DATE NOT NULL DEFAULT CURRENT_DATE,
  ends_at DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS idx_account_message_purchases_account
  ON public.account_message_purchases(account_id);

CREATE INDEX IF NOT EXISTS idx_account_message_purchases_active
  ON public.account_message_purchases(account_id, starts_at, ends_at);

-- Thin ledger so saldo can later be COUNT(*) per purchase
-- (fratalk counted mensaje_template / respuesta_automatica).
CREATE TABLE IF NOT EXISTS public.message_credit_usages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  purchase_id UUID NOT NULL REFERENCES public.account_message_purchases(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_credit_usages_purchase
  ON public.message_credit_usages(purchase_id);

CREATE INDEX IF NOT EXISTS idx_message_credit_usages_account
  ON public.message_credit_usages(account_id);

ALTER TABLE public.message_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_package_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_message_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_credit_usages ENABLE ROW LEVEL SECURITY;

-- Seed the six fratalk packs with deterministic categories.
DO $$
DECLARE
  p1 UUID;
  p2 UUID;
  p3 UUID;
  p4 UUID;
  p5 UUID;
  p6 UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM public.message_packages LIMIT 1) THEN
    RETURN;
  END IF;

  INSERT INTO public.message_packages (quantity, unit_price, duration_days)
  VALUES (5000, 0.28, 120) RETURNING id INTO p1;
  INSERT INTO public.message_packages (quantity, unit_price, duration_days)
  VALUES (10000, 0.25, 120) RETURNING id INTO p2;
  INSERT INTO public.message_packages (quantity, unit_price, duration_days)
  VALUES (100000, 0.20, 120) RETURNING id INTO p3;
  INSERT INTO public.message_packages (quantity, unit_price, duration_days)
  VALUES (5000, 0.45, 120) RETURNING id INTO p4;
  INSERT INTO public.message_packages (quantity, unit_price, duration_days)
  VALUES (10000, 0.40, 120) RETURNING id INTO p5;
  INSERT INTO public.message_packages (quantity, unit_price, duration_days)
  VALUES (100000, 0.35, 120) RETURNING id INTO p6;

  INSERT INTO public.message_package_categories (package_id, category) VALUES
    (p1, 'AUTHENTICATION'), (p1, 'UTILITY'),
    (p2, 'AUTHENTICATION'), (p2, 'UTILITY'),
    (p3, 'AUTHENTICATION'), (p3, 'UTILITY'),
    (p4, 'MARKETING'),
    (p5, 'MARKETING'),
    (p6, 'MARKETING');
END $$;
