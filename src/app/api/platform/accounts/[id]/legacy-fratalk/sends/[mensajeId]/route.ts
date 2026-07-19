// GET /api/platform/accounts/[id]/legacy-fratalk/sends/[mensajeId]

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
import { getLegacySendDetailByRuc } from '@/lib/fratalk/legacy-queries';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; mensajeId: string }> },
) {
  try {
    await requirePlatformOwner();
    const { id: accountId, mensajeId: raw } = await context.params;
    const ruc = await getAccountRuc(accountId);
    if (!ruc) {
      return NextResponse.json({ error: 'Account has no RUC' }, { status: 404 });
    }

    const mensajeId = Number(raw);
    if (!Number.isFinite(mensajeId) || mensajeId <= 0) {
      return NextResponse.json({ error: 'Invalid mensajeId' }, { status: 400 });
    }

    const detail = await getLegacySendDetailByRuc({ ruc, mensajeId });
    if (!detail) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (err) {
    if (err instanceof UnauthorizedError || err instanceof ForbiddenError) {
      return toErrorResponse(err);
    }
    return legacyFratalkErrorResponse(err);
  }
}
