// ============================================================
// Platform-owner context — for the cross-tenant "Clients" module.
//
// A platform owner administers EVERY account (organisation) on the
// deployment, but is NOT a member of them. That distinction matters:
// account RLS is `is_account_member(account_id)`, so the platform
// owner's own SSR client physically cannot read another account's
// rows. Cross-tenant reads/writes therefore go through the
// service-role client — but ONLY after we've proven, with the
// session-scoped SSR client, that the caller really is a platform
// owner.
//
// Calling convention — every /api/platform route does:
//
//   try {
//     const ctx = await requirePlatformOwner();
//     // ctx.userId — the platform owner's auth.uid()
//     // ctx.admin  — service-role client; RLS-bypassing, use for
//     //              cross-account queries
//   } catch (err) {
//     return toErrorResponse(err); // reuses account.ts mapper
//   }
//
// SECURITY: the `is_platform_owner` flag is read with the SSR client
// (RLS: a user may read their own profile row), so a caller can only
// ever assert their OWN flag — never spoof another user's. The flag
// itself is write-protected at the DB layer (only service_role /
// definer RPCs may set it), the same discipline migration 034 uses
// for account_role / account_id.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import { ForbiddenError, UnauthorizedError } from "./account";

export interface PlatformOwnerContext {
  /** Session-scoped SSR client (RLS applies). Use for self reads. */
  supabase: SupabaseClient;
  /** Service-role client. RLS-bypassing — use for cross-account reads/writes. */
  admin: SupabaseClient;
  /** The platform owner's auth.uid(). */
  userId: string;
}

/**
 * Resolve the caller and assert they are a platform owner.
 *
 * Throws `UnauthorizedError` when there's no session, and
 * `ForbiddenError` when the caller is authenticated but not a
 * platform owner (or the profile row can't be read).
 */
export async function requirePlatformOwner(): Promise<PlatformOwnerContext> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    throw new UnauthorizedError();
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("is_platform_owner")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[requirePlatformOwner] profile fetch error:", error);
    throw new ForbiddenError("Could not verify platform access");
  }
  if (!data || data.is_platform_owner !== true) {
    // Fail closed: any non-true value (false, null, missing row) is
    // not a platform owner. We don't distinguish "not owner" from
    // "no row" on the wire.
    throw new ForbiddenError("Platform-owner access required");
  }

  return {
    supabase,
    admin: supabaseAdmin(),
    userId: user.id,
  };
}
