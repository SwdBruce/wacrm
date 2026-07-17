// ============================================================
// /api/platform/accounts/[id]
//
//   GET   — full detail for one client account: owner, members,
//           WhatsApp snapshot, and cheap record counts.
//   PATCH — maintenance: rename the account.
//
// Platform-owner only. Cross-tenant, so it runs on the service-role
// client after `requirePlatformOwner` verifies the caller.
// ============================================================

import { NextResponse } from "next/server";

import { requirePlatformOwner } from "@/lib/auth/platform";
import { toErrorResponse } from "@/lib/auth/account";
import { isAccountRole } from "@/lib/auth/roles";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import type {
  PlatformAccountDetail,
  PlatformAccountMember,
} from "@/lib/platform/types";

const MAX_NAME_LENGTH = 100;

interface AccountRow {
  id: string;
  name: string;
  owner_user_id: string | null;
  created_at: string;
}

interface ProfileRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  account_role: string | null;
  is_platform_owner: boolean | null;
  created_at: string;
}

// Count rows in `table` for one account. `head: true` fetches only the
// count (no rows). A query error degrades to 0 rather than failing the
// whole detail payload — counts are informational.
async function countFor(
  db: Awaited<ReturnType<typeof requirePlatformOwner>>["admin"],
  table: string,
  accountId: string,
): Promise<number> {
  const { count, error } = await db
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId);
  if (error) {
    console.error(`[platform account detail] count ${table} error:`, error);
    return 0;
  }
  return count ?? 0;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requirePlatformOwner();
    const db = ctx.admin;
    const { id } = await params;

    const { data: account, error: accountErr } = await db
      .from("accounts")
      .select("id, name, owner_user_id, created_at")
      .eq("id", id)
      .maybeSingle<AccountRow>();

    if (accountErr) {
      console.error("[GET platform account] account error:", accountErr);
      return NextResponse.json(
        { error: "Failed to load account" },
        { status: 500 },
      );
    }
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const { data: profilesData, error: profilesErr } = await db
      .from("profiles")
      .select("user_id, full_name, email, account_role, is_platform_owner, created_at")
      .eq("account_id", id)
      .order("created_at", { ascending: true });

    if (profilesErr) {
      console.error("[GET platform account] profiles error:", profilesErr);
      return NextResponse.json(
        { error: "Failed to load account" },
        { status: 500 },
      );
    }

    const { data: wa } = await db
      .from("whatsapp_config")
      .select("status, phone_number_id, waba_id")
      .eq("account_id", id)
      .maybeSingle<{
        status: string | null;
        phone_number_id: string | null;
        waba_id: string | null;
      }>();

    const [contacts, conversations, templates, broadcasts] = await Promise.all([
      countFor(db, "contacts", id),
      countFor(db, "conversations", id),
      countFor(db, "message_templates", id),
      countFor(db, "broadcasts", id),
    ]);

    const profiles = (profilesData ?? []) as ProfileRow[];
    const members: PlatformAccountMember[] = profiles.flatMap((p) => {
      if (!isAccountRole(p.account_role)) return [];
      return [
        {
          user_id: p.user_id,
          full_name: p.full_name,
          email: p.email,
          role: p.account_role,
          is_platform_owner: p.is_platform_owner === true,
          joined_at: p.created_at,
        },
      ];
    });

    const owner =
      members.find((m) => m.user_id === account.owner_user_id) ?? null;

    const detail: PlatformAccountDetail = {
      id: account.id,
      name: account.name,
      created_at: account.created_at,
      owner: owner
        ? { user_id: owner.user_id, full_name: owner.full_name, email: owner.email }
        : null,
      member_count: members.length,
      whatsapp: wa
        ? {
            status: wa.status ?? "disconnected",
            phone_number_id: wa.phone_number_id,
            waba_id: wa.waba_id,
          }
        : null,
      members,
      counts: { contacts, conversations, templates, broadcasts },
    };

    return NextResponse.json({ account: detail });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requirePlatformOwner();
    const db = ctx.admin;

    const limit = checkRateLimit(
      `platform:accountUpdate:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { id } = await params;

    const body = (await request.json().catch(() => null)) as
      | { name?: unknown }
      | null;
    const rawName = typeof body?.name === "string" ? body.name.trim() : "";

    if (!rawName) {
      return NextResponse.json(
        { error: "'name' is required" },
        { status: 400 },
      );
    }
    if (rawName.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { error: `'name' must be ${MAX_NAME_LENGTH} characters or fewer` },
        { status: 400 },
      );
    }

    const { data, error } = await db
      .from("accounts")
      .update({ name: rawName })
      .eq("id", id)
      .select("id, name")
      .maybeSingle<{ id: string; name: string }>();

    if (error) {
      console.error("[PATCH platform account] update error:", error);
      return NextResponse.json(
        { error: "Failed to update account" },
        { status: 500 },
      );
    }
    if (!data) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, account: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
