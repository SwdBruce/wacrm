// GET /api/platform/accounts/[id]/legacy-fratalk/balance
// Platform owner ONLY — one row per Fratalk compra (grouped categories)

import { NextResponse } from 'next/server';

import {
  ForbiddenError,
  UnauthorizedError,
  toErrorResponse,
} from '@/lib/auth/account';
import { requirePlatformOwner } from '@/lib/auth/platform';
import {
  getAccountRuc,
  legacyFratalkErrorResponse,
} from '@/lib/fratalk/legacy-api';
import { listLegacyBalanceByRuc } from '@/lib/fratalk/legacy-queries';
import {
  annotateLegacyBalanceMigration,
  migrateLegacyPurchases,
} from '@/lib/fratalk/migrate-purchases';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requirePlatformOwner();
    const { id: accountId } = await context.params;
    const ruc = await getAccountRuc(accountId);
    if (!ruc) {
      return NextResponse.json({
        configured: true,
        has_ruc: false,
        rows: [],
      });
    }

    const raw = await listLegacyBalanceByRuc(ruc);
    const rows = await annotateLegacyBalanceMigration(
      accountId,
      raw,
      ctx.admin,
    );
    return NextResponse.json({
      configured: true,
      has_ruc: true,
      ruc,
      rows,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError || err instanceof ForbiddenError) {
      return toErrorResponse(err);
    }
    return legacyFratalkErrorResponse(err);
  }
}
