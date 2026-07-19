// GET /api/account/legacy-fratalk/sends/[mensajeId]
// Org admin+: send detail + etiquetas + respuestas

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
} from '@/lib/fratalk/legacy-api';
import { getLegacySendDetailByRuc } from '@/lib/fratalk/legacy-queries';

export async function GET(
  _request: Request,
  context: { params: Promise<{ mensajeId: string }> },
) {
  try {
    const ctx = await requireRole('admin');
    const ruc = await getAccountRuc(ctx.accountId);
    if (!ruc) {
      return NextResponse.json({ error: 'Account has no RUC' }, { status: 404 });
    }

    const { mensajeId: raw } = await context.params;
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
