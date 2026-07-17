// ============================================================
// /api/platform/accounts/[id]/purchases
//
//   GET  — list purchases for one organisation (+ used/remaining).
//   POST — assign a package (fratalk /add-paquete). starts_at defaults
//          to today; ends_at = starts_at + package.duration_days.
// ============================================================

import { NextResponse } from "next/server";

import { requirePlatformOwner } from "@/lib/auth/platform";
import { toErrorResponse } from "@/lib/auth/account";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { listAccountMessagePurchases } from "@/lib/platform/message-credits";

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requirePlatformOwner();
    const db = ctx.admin;
    const { id: accountId } = await params;

    const { data: account, error: accountErr } = await db
      .from("accounts")
      .select("id")
      .eq("id", accountId)
      .maybeSingle();

    if (accountErr) {
      console.error("[GET purchases] account", accountErr);
      return NextResponse.json(
        { error: "Failed to load purchases" },
        { status: 500 },
      );
    }
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const purchases = await listAccountMessagePurchases(accountId, db);
    return NextResponse.json({ purchases });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requirePlatformOwner();
    const db = ctx.admin;

    const limit = checkRateLimit(
      `platform:purchaseCreate:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { id: accountId } = await params;
    const body = (await request.json().catch(() => null)) as {
      package_id?: unknown;
      starts_at?: unknown;
    } | null;

    const packageId =
      typeof body?.package_id === "string" ? body.package_id.trim() : "";
    if (!packageId) {
      return NextResponse.json(
        { error: "'package_id' is required" },
        { status: 400 },
      );
    }

    const startsAt =
      typeof body?.starts_at === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(body.starts_at)
        ? body.starts_at
        : todayUtc();

    const { data: account, error: accountErr } = await db
      .from("accounts")
      .select("id")
      .eq("id", accountId)
      .maybeSingle();

    if (accountErr || !account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const { data: pack, error: packErr } = await db
      .from("message_packages")
      .select("id, quantity, unit_price, duration_days")
      .eq("id", packageId)
      .maybeSingle();

    if (packErr || !pack) {
      return NextResponse.json({ error: "Package not found" }, { status: 404 });
    }

    const endsAt = addDays(startsAt, Number(pack.duration_days));

    const { data: purchase, error } = await db
      .from("account_message_purchases")
      .insert({
        account_id: accountId,
        package_id: packageId,
        starts_at: startsAt,
        ends_at: endsAt,
      })
      .select("id")
      .single();

    if (error || !purchase) {
      console.error("[POST purchases]", error);
      return NextResponse.json(
        { error: "Failed to assign package" },
        { status: 500 },
      );
    }

    const purchases = await listAccountMessagePurchases(accountId, db);
    const hydrated = purchases.find((p) => p.id === purchase.id) ?? null;
    return NextResponse.json({ purchase: hydrated }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
