// POST /api/platform/accounts/[id]/legacy-fratalk/migrate-purchases
// Migrate active Fratalk compras into CRM account_message_purchases.

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
import { migrateLegacyPurchases } from '@/lib/fratalk/migrate-purchases';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requirePlatformOwner();
    const limit = checkRateLimit(
      `platform:legacyMigrate:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { id: accountId } = await context.params;
    const ruc = await getAccountRuc(accountId);
    if (!ruc) {
      return NextResponse.json(
        { error: 'Account has no RUC; cannot match Fratalk compras' },
        { status: 400 },
      );
    }

    const body = (await request.json().catch(() => null)) as {
      compra_ids?: unknown;
    } | null;

    const compraIds = Array.isArray(body?.compra_ids)
      ? body.compra_ids
          .map((v) => (typeof v === 'number' ? v : Number(v)))
          .filter((n) => Number.isInteger(n) && n > 0)
      : [];

    if (compraIds.length === 0) {
      return NextResponse.json(
        { error: "'compra_ids' must be a non-empty array of integers" },
        { status: 400 },
      );
    }

    const { results, purchases } = await migrateLegacyPurchases(
      accountId,
      ruc,
      compraIds,
      ctx.admin,
    );

    const migrated = results.filter((r) => r.status === 'migrated').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    const failed = results.filter((r) => r.status === 'error').length;

    return NextResponse.json({
      results,
      summary: { migrated, skipped, failed },
      purchases,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError || err instanceof ForbiddenError) {
      return toErrorResponse(err);
    }
    if (err instanceof Error && err.message.includes('compra_ids')) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return legacyFratalkErrorResponse(err);
  }
}
