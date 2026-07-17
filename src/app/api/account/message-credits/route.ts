// ============================================================
// GET /api/account/message-credits
//
// Owner/admin of the caller's organisation — list purchases +
// remaining credits for their own account (not cross-tenant).
// Uses service-role after requireRole because package tables have
// no browser RLS policies.
// ============================================================

import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import {
  listAccountMessagePurchases,
  summarizeCredits,
} from "@/lib/platform/message-credits";

export async function GET() {
  try {
    const ctx = await requireRole("admin");
    const purchases = await listAccountMessagePurchases(
      ctx.accountId,
      supabaseAdmin(),
    );
    const summary = summarizeCredits(purchases);

    return NextResponse.json({ purchases, summary });
  } catch (err) {
    return toErrorResponse(err);
  }
}
