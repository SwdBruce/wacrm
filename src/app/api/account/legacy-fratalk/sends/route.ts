// GET /api/account/legacy-fratalk/sends
// Org admin+: list mensaje_template for accounts.ruc

import { NextResponse } from 'next/server';

import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account';
import {
  getAccountRuc,
  legacyFratalkErrorResponse,
  parsePagination,
} from '@/lib/fratalk/legacy-api';
import { listLegacySendsByRuc } from '@/lib/fratalk/legacy-queries';

export async function GET(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const ruc = await getAccountRuc(ctx.accountId);
    if (!ruc) {
      return NextResponse.json({
        configured: true,
        has_ruc: false,
        rows: [],
        total: 0,
      });
    }

    const { limit, offset, q, replyFilter } = parsePagination(
      new URL(request.url),
    );
    const { rows, total } = await listLegacySendsByRuc({
      ruc,
      limit,
      offset,
      q,
      replyFilter,
    });

    return NextResponse.json({
      configured: true,
      has_ruc: true,
      ruc,
      rows,
      total,
      limit,
      offset,
      replyFilter,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError || err instanceof ForbiddenError) {
      return toErrorResponse(err);
    }
    return legacyFratalkErrorResponse(err);
  }
}
