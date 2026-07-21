// ============================================================
// Shared DTOs for the platform-owner "Clients" module. These cross
// the API ↔ UI boundary, so they live in one place both sides import.
// ============================================================

import type { AccountRole } from "@/lib/auth/roles";
import type { ThemeId } from "@/lib/themes";

/** WhatsApp connection snapshot for an account. */
export interface PlatformWhatsApp {
  status: string;
  phone_number_id: string | null;
  waba_id: string | null;
}

/** The owner of an account, hydrated from their profile row. */
export interface PlatformAccountOwner {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

/** One row in the clients list. */
export interface PlatformAccountSummary {
  id: string;
  name: string;
  /** Tax ID (e.g. Peru RUC). */
  ruc: string | null;
  /** Accent theme for this organisation. */
  theme: ThemeId;
  /** Soft-deactivate flag — false blocks member login and tenant use. */
  is_active: boolean;
  /** Set when deactivated; null while active. */
  deactivated_at: string | null;
  created_at: string;
  owner: PlatformAccountOwner | null;
  member_count: number;
  whatsapp: PlatformWhatsApp | null;
}

/** A member of an account, as seen by the platform owner. */
export interface PlatformAccountMember {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: AccountRole;
  is_platform_owner: boolean;
  joined_at: string;
}

/** Cheap per-account record counts for the detail view. */
export interface PlatformAccountCounts {
  contacts: number;
  conversations: number;
  templates: number;
  broadcasts: number;
}

/** Full detail payload for a single client account. */
export interface PlatformAccountDetail extends PlatformAccountSummary {
  members: PlatformAccountMember[];
  counts: PlatformAccountCounts;
}
