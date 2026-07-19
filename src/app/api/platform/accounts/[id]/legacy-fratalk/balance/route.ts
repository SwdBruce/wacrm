// GET /api/platform/accounts/[id]/legacy-fratalk/balance
// Platform owner ONLY — vista_saldo_compras

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

export async function GET(
  _request: Request,
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
      });
    }

    const rows = await listLegacyBalanceByRuc(ruc);
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
