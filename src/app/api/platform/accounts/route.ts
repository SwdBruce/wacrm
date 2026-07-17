// ============================================================
// GET /api/platform/accounts
//
// Lists EVERY account (organisation) on the deployment for the
// platform owner's "Clients" module. Cross-tenant by design, so it
// runs on the service-role client — but only after
// `requirePlatformOwner` proves the caller is a platform owner with
// their own session-scoped client.
//
// Each row carries just enough to populate the list: the account's
// name, its owner (name + email), how many members it has, and the
// WhatsApp connection snapshot. Heavier per-account detail lives on
// the [id] route.
// ============================================================

import { NextResponse } from "next/server";

import { requirePlatformOwner } from "@/lib/auth/platform";
import { toErrorResponse } from "@/lib/auth/account";
import {
  clampExpiryDays,
  generateInviteToken,
  inviteExpiresAt,
  inviteUrl,
} from "@/lib/auth/invitations";
import { resolveInviteBaseUrl } from "@/lib/auth/invite-base-url";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import type { PlatformAccountSummary } from "@/lib/platform/types";

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
  account_id: string | null;
}

interface WhatsAppRow {
  account_id: string;
  status: string | null;
  phone_number_id: string | null;
  waba_id: string | null;
}

export async function GET() {
  try {
    const ctx = await requirePlatformOwner();
    const db = ctx.admin;

    const [accountsRes, profilesRes, whatsappRes] = await Promise.all([
      db
        .from("accounts")
        .select("id, name, owner_user_id, created_at")
        .order("created_at", { ascending: false }),
      db.from("profiles").select("user_id, full_name, email, account_id"),
      db
        .from("whatsapp_config")
        .select("account_id, status, phone_number_id, waba_id"),
    ]);

    if (accountsRes.error) {
      console.error(
        "[GET /api/platform/accounts] accounts error:",
        accountsRes.error,
      );
      return NextResponse.json(
        { error: "Failed to load accounts" },
        { status: 500 },
      );
    }
    if (profilesRes.error) {
      console.error(
        "[GET /api/platform/accounts] profiles error:",
        profilesRes.error,
      );
      return NextResponse.json(
        { error: "Failed to load accounts" },
        { status: 500 },
      );
    }

    const accounts = (accountsRes.data ?? []) as AccountRow[];
    const profiles = (profilesRes.data ?? []) as ProfileRow[];
    // whatsapp_config is optional context — a query error there
    // shouldn't blank the whole list. Log and continue with none.
    if (whatsappRes.error) {
      console.error(
        "[GET /api/platform/accounts] whatsapp_config error:",
        whatsappRes.error,
      );
    }
    const whatsapp = (whatsappRes.data ?? []) as WhatsAppRow[];

    // Index profiles by user_id (owner lookup) and count per account.
    const profileByUser = new Map<string, ProfileRow>();
    const memberCount = new Map<string, number>();
    for (const p of profiles) {
      profileByUser.set(p.user_id, p);
      if (p.account_id) {
        memberCount.set(p.account_id, (memberCount.get(p.account_id) ?? 0) + 1);
      }
    }

    const whatsappByAccount = new Map<string, WhatsAppRow>();
    for (const w of whatsapp) {
      whatsappByAccount.set(w.account_id, w);
    }

    const rows: PlatformAccountSummary[] = accounts.map((a) => {
      const ownerProfile = a.owner_user_id
        ? (profileByUser.get(a.owner_user_id) ?? null)
        : null;
      const wa = whatsappByAccount.get(a.id) ?? null;
      return {
        id: a.id,
        name: a.name,
        created_at: a.created_at,
        owner: ownerProfile
          ? {
              user_id: ownerProfile.user_id,
              full_name: ownerProfile.full_name,
              email: ownerProfile.email,
            }
          : null,
        member_count: memberCount.get(a.id) ?? 0,
        whatsapp: wa
          ? {
              status: wa.status ?? "disconnected",
              phone_number_id: wa.phone_number_id,
              waba_id: wa.waba_id,
            }
          : null,
      };
    });

    return NextResponse.json({ accounts: rows });
  } catch (err) {
    return toErrorResponse(err);
  }
}

// ============================================================
// POST /api/platform/accounts
//
// Creates an ownerless organisation and a one-time owner invitation.
// The SQL RPC performs both inserts atomically and independently
// re-verifies `is_platform_owner` from auth.uid(). The plaintext token
// is returned exactly once and only its SHA-256 hash reaches the DB.
// ============================================================

export async function POST(request: Request) {
  try {
    const ctx = await requirePlatformOwner();

    const limit = checkRateLimit(
      `platform:accountCreate:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as
      | { name?: unknown; expiresInDays?: unknown }
      | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!name) {
      return NextResponse.json(
        { error: "'name' is required" },
        { status: 400 },
      );
    }
    if (name.length > 100) {
      return NextResponse.json(
        { error: "'name' must be 100 characters or fewer" },
        { status: 400 },
      );
    }

    const requestedDays =
      typeof body?.expiresInDays === "number"
        ? body.expiresInDays
        : undefined;
    const expiresInDays = clampExpiryDays(requestedDays);
    const expiresAt = inviteExpiresAt(expiresInDays);
    const { token, hash } = generateInviteToken();

    // Use the session-scoped client, not service_role: the SECURITY
    // DEFINER RPC verifies auth.uid() is a platform owner and then
    // performs the cross-RLS inserts in one DB transaction.
    const { data, error } = await ctx.supabase.rpc(
      "create_platform_account_invitation",
      {
        p_name: name,
        p_token_hash: hash,
        p_expires_at: expiresAt.toISOString(),
      },
    );

    if (error || !data) {
      if (error?.code === "22023") {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (error?.code === "42501") {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      console.error("[POST /api/platform/accounts] RPC error:", error);
      return NextResponse.json(
        { error: "Failed to create organisation" },
        { status: 500 },
      );
    }

    const result = data as {
      account_id: string;
      invitation_id: string;
    };

    return NextResponse.json(
      {
        account: { id: result.account_id, name },
        invitation: {
          id: result.invitation_id,
          role: "owner",
          expires_at: expiresAt.toISOString(),
        },
        // Plaintext — shown once, never persisted.
        url: inviteUrl(token, resolveInviteBaseUrl(request)),
        expiresInDays,
      },
      { status: 201 },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
