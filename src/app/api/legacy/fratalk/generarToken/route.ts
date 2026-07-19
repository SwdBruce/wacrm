// ============================================================
// POST /api/legacy/fratalk/generarToken
// Fratalk-compatible: POST /generarToken (via rewrite)
// Body: { RUC, name } → JWT string (HS256, FraGoTe secret)
// Only mints a token when accounts.ruc matches (account must exist).
// ============================================================

import { NextResponse } from 'next/server';

import {
  fratalkOptionsResponse,
  withFratalkCors,
} from '@/lib/fratalk/auth';
import { signFratalkJwt } from '@/lib/fratalk/jwt';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export async function OPTIONS() {
  return fratalkOptionsResponse();
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    const ruc =
      typeof body?.RUC === 'string' ? body.RUC.trim() : '';
    const name =
      typeof body?.name === 'string'
        ? body.name.trim()
        : typeof body?.nombre === 'string'
          ? body.nombre.trim()
          : '';

    if (!ruc) {
      return withFratalkCors(
        NextResponse.json({ error: 'RUC es obligatorio' }, { status: 400 }),
      );
    }

    const db = supabaseAdmin();
    const { data: account } = await db
      .from('accounts')
      .select('id, is_active')
      .eq('ruc', ruc)
      .maybeSingle<{ id: string; is_active: boolean }>();

    if (!account || account.is_active === false) {
      return withFratalkCors(
        NextResponse.json({ error: 'RUC no registrado' }, { status: 400 }),
      );
    }

    const token = signFratalkJwt({ RUC: ruc, name: name || undefined });
    // fratalk returned the JWT string as the JSON body (res.json(jwt.sign(...)))
    return withFratalkCors(NextResponse.json(token));
  } catch (err) {
    console.error('[fratalk/generarToken]', err);
    return withFratalkCors(
      NextResponse.json({ error: 'No se pudo generar el token' }, { status: 500 }),
    );
  }
}
