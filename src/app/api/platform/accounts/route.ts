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
  ruc: string | null;
  is_active: boolean;
  deactivated_at: string | null;
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
        .select("id, name, ruc, is_active, deactivated_at, owner_user_id, created_at")
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
        ruc: a.ruc ?? null,
        is_active: a.is_active !== false,
        deactivated_at: a.deactivated_at ?? null,
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

function parseOrgFields(body: {
  name?: unknown;
  ruc?: unknown;
} | null): { name: string; ruc: string } | NextResponse {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const ruc = typeof body?.ruc === "string" ? body.ruc.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "'name' is required" }, { status: 400 });
  }
  if (name.length > 100) {
    return NextResponse.json(
      { error: "'name' must be 100 characters or fewer" },
      { status: 400 },
    );
  }
  if (!ruc) {
    return NextResponse.json({ error: "'ruc' is required" }, { status: 400 });
  }
  if (ruc.length > 32) {
    return NextResponse.json(
      { error: "'ruc' must be 32 characters or fewer" },
      { status: 400 },
    );
  }

  return { name, ruc };
}

async function createClientByInvitation(
  ctx: Awaited<ReturnType<typeof requirePlatformOwner>>,
  request: Request,
  name: string,
  ruc: string,
  expiresInDaysRaw: unknown,
) {
  const expiresInDays = clampExpiryDays(
    typeof expiresInDaysRaw === "number" ? expiresInDaysRaw : undefined,
  );
  const expiresAt = inviteExpiresAt(expiresInDays);
  const { token, hash } = generateInviteToken();

  const { data, error } = await ctx.supabase.rpc(
    "create_platform_account_invitation",
    {
      p_name: name,
      p_token_hash: hash,
      p_expires_at: expiresAt.toISOString(),
      p_ruc: ruc,
    },
  );

  if (error || !data) {
    if (error?.code === "22023") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error?.code === "23505") {
      return NextResponse.json(
        {
          error:
            error.message || "An organisation with this RUC already exists",
        },
        { status: 409 },
      );
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
      account: { id: result.account_id, name, ruc },
      invitation: {
        id: result.invitation_id,
        role: "owner",
        expires_at: expiresAt.toISOString(),
      },
      url: inviteUrl(token, resolveInviteBaseUrl(request)),
      expiresInDays,
    },
    { status: 201 },
  );
}

async function createClientDirect(
  ctx: Awaited<ReturnType<typeof requirePlatformOwner>>,
  name: string,
  ruc: string,
  owner: { fullName: string; email: string; password: string },
) {
  const { data: createdUser, error: createUserError } =
    await ctx.admin.auth.admin.createUser({
      email: owner.email,
      password: owner.password,
      email_confirm: true,
      user_metadata: { full_name: owner.fullName },
    });

  if (createUserError || !createdUser.user) {
    const message = createUserError?.message ?? "Failed to create owner account";
    const status =
      createUserError?.message?.toLowerCase().includes("already") ||
      createUserError?.status === 422
        ? 409
        : 400;
    return NextResponse.json({ error: message }, { status });
  }

  const ownerUserId = createdUser.user.id;

  const { data, error } = await ctx.supabase.rpc(
    "create_platform_account_with_owner",
    {
      p_name: name,
      p_owner_user_id: ownerUserId,
      p_ruc: ruc,
    },
  );

  if (error || !data) {
    await ctx.admin.auth.admin.deleteUser(ownerUserId).catch((deleteErr) => {
      console.error(
        "[POST /api/platform/accounts] rollback deleteUser error:",
        deleteErr,
      );
    });

    if (error?.code === "22023") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error?.code === "23505") {
      return NextResponse.json(
        {
          error:
            error.message || "An organisation with this RUC already exists",
        },
        { status: 409 },
      );
    }
    if (error?.code === "42501") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("[POST /api/platform/accounts] direct RPC error:", error);
    return NextResponse.json(
      { error: "Failed to create organisation" },
      { status: 500 },
    );
  }

  const result = data as { account_id: string };

  return NextResponse.json(
    {
      account: { id: result.account_id, name, ruc },
      owner: {
        user_id: ownerUserId,
        full_name: owner.fullName,
        email: owner.email,
      },
    },
    { status: 201 },
  );
}

export async function POST(request: Request) {
  try {
    const ctx = await requirePlatformOwner();

    const limit = checkRateLimit(
      `platform:accountCreate:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as
      | {
          mode?: unknown;
          name?: unknown;
          expiresInDays?: unknown;
          ruc?: unknown;
          owner?: {
            fullName?: unknown;
            email?: unknown;
            password?: unknown;
          };
        }
      | null;

    const parsed = parseOrgFields(body);
    if (parsed instanceof NextResponse) return parsed;
    const { name, ruc } = parsed;

    const mode = body?.mode === "direct" ? "direct" : "invitation";

    if (mode === "direct") {
      const fullName =
        typeof body?.owner?.fullName === "string"
          ? body.owner.fullName.trim()
          : "";
      const email =
        typeof body?.owner?.email === "string" ? body.owner.email.trim() : "";
      const password =
        typeof body?.owner?.password === "string" ? body.owner.password : "";

      if (!fullName) {
        return NextResponse.json(
          { error: "Owner full name is required" },
          { status: 400 },
        );
      }
      if (!email) {
        return NextResponse.json(
          { error: "Owner email is required" },
          { status: 400 },
        );
      }
      if (password.length < 6) {
        return NextResponse.json(
          { error: "Owner password must be at least 6 characters" },
          { status: 400 },
        );
      }

      return createClientDirect(ctx, name, ruc, { fullName, email, password });
    }

    return createClientByInvitation(
      ctx,
      request,
      name,
      ruc,
      body?.expiresInDays,
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
