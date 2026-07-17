// ============================================================
// /api/platform/accounts/[id]/purchases/[purchaseId]
//
//   PATCH  — set remaining credits (adjusts message_credit_usages).
//   DELETE — remove the purchase (usages cascade).
// ============================================================

import { NextResponse } from "next/server";

import { requirePlatformOwner } from "@/lib/auth/platform";
import { toErrorResponse } from "@/lib/auth/account";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import {
  deleteAccountMessagePurchase,
  setPurchaseRemaining,
} from "@/lib/platform/message-credits";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; purchaseId: string }> },
) {
  try {
    const ctx = await requirePlatformOwner();
    const db = ctx.admin;

    const limit = checkRateLimit(
      `platform:purchasePatch:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { id: accountId, purchaseId } = await params;
    const body = (await request.json().catch(() => null)) as {
      remaining?: unknown;
    } | null;

    const remaining =
      typeof body?.remaining === "number"
        ? body.remaining
        : typeof body?.remaining === "string"
          ? Number(body.remaining)
          : NaN;

    if (!Number.isFinite(remaining) || !Number.isInteger(remaining)) {
      return NextResponse.json(
        { error: "'remaining' must be an integer" },
        { status: 400 },
      );
    }

    try {
      const purchase = await setPurchaseRemaining(
        accountId,
        purchaseId,
        remaining,
        db,
      );
      return NextResponse.json({ purchase });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update remaining";
      const status =
        message === "Purchase not found"
          ? 404
          : message.includes("remaining") || message.includes("quantity")
            ? 400
            : 500;
      return NextResponse.json({ error: message }, { status });
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; purchaseId: string }> },
) {
  try {
    const ctx = await requirePlatformOwner();
    const db = ctx.admin;

    const limit = checkRateLimit(
      `platform:purchaseDelete:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { id: accountId, purchaseId } = await params;

    try {
      await deleteAccountMessagePurchase(accountId, purchaseId, db);
      return NextResponse.json({ ok: true });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete purchase";
      const status = message === "Purchase not found" ? 404 : 500;
      return NextResponse.json({ error: message }, { status });
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
