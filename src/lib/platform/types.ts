// ============================================================
// Shared DTOs for the platform-owner "Clients" module. These cross
// the API ↔ UI boundary, so they live in one place both sides import.
// ============================================================

import type { AccountRole } from "@/lib/auth/roles";

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
  /** Optional tax ID (e.g. Peru RUC). */
  ruc: string | null;
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
