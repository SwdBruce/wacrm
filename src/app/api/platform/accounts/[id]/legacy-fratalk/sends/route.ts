// GET /api/platform/accounts/[id]/legacy-fratalk/sends

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
  parsePagination,
} from '@/lib/fratalk/legacy-api';
import { listLegacySendsByRuc } from '@/lib/fratalk/legacy-queries';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requirePlatformOwner();
    const { id: accountId } = await context.params;
    const ruc = await getAccountRuc(accountId);
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
