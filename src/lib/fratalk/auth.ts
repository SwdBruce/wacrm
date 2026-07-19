// ============================================================
// Fratalk legacy API auth — Bearer JWT → account via accounts.ruc
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  verifyFratalkJwt,
  type FratalkJwtPayload,
} from '@/lib/fratalk/jwt';

export class FratalkAuthError extends Error {
  readonly status: number;
  readonly body: { mensaje: string };
  constructor(mensaje: string, status = 401) {
    super(mensaje);
    this.name = 'FratalkAuthError';
    this.status = status;
    this.body = { mensaje };
  }
}

export interface FratalkAuthContext {
  payload: FratalkJwtPayload;
  ruc: string;
  accountId: string;
  accountName: string;
  supabase: SupabaseClient;
}

function extractBearer(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  if (header.startsWith('Bearer ') || header.startsWith('bearer ')) {
    const value = header.slice(7).trim();
    return value.length > 0 ? value : null;
  }
  const trimmed = header.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function requireFratalkAuth(
  request: Request,
): Promise<FratalkAuthContext> {
  const token = extractBearer(request);
  if (!token) {
    throw new FratalkAuthError('Token requerido');
  }

  let payload: FratalkJwtPayload;
  try {
    payload = verifyFratalkJwt(token);
  } catch {
    throw new FratalkAuthError('Token inválido o expirado');
  }

  const ruc =
    typeof payload.RUC === 'string' ? payload.RUC.trim() : '';
  if (!ruc) {
    throw new FratalkAuthError('Token inválido o expirado - RUC no encontrado');
  }

  const supabase = supabaseAdmin();
  const { data: account, error } = await supabase
    .from('accounts')
    .select('id, name, is_active, ruc')
    .eq('ruc', ruc)
    .maybeSingle<{
      id: string;
      name: string;
      is_active: boolean;
      ruc: string | null;
    }>();

  if (error) {
    console.error('[fratalk-auth] account lookup error:', error.message);
    throw new FratalkAuthError('Token inválido o expirado - error en la consulta de la cuenta');
  }
  if (!account || account.is_active === false) {
    throw new FratalkAuthError('Token inválido o expirado - cuenta no activa');
  }

  return {
    payload,
    ruc,
    accountId: account.id,
    accountName: account.name,
    supabase,
  };
}

export function fratalkAuthErrorResponse(err: unknown): NextResponse | null {
  if (err instanceof FratalkAuthError) {
    return NextResponse.json(err.body, { status: err.status });
  }
  return null;
}

/** CORS headers so browser clients that called fratalk-be keep working. */
export function withFratalkCors(response: NextResponse): NextResponse {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type',
  );
  response.headers.set(
    'Access-Control-Allow-Methods',
    'GET, POST, OPTIONS',
  );
  return response;
}

export function fratalkOptionsResponse(): NextResponse {
  return withFratalkCors(new NextResponse(null, { status: 204 }));
}
