// ============================================================
// GET /api/legacy/fratalk/get-templates
// Fratalk-compatible: GET /get-templates (via rewrite)
// Auth: Bearer JWT (FraGoTe). Tenant: accounts.ruc from JWT.RUC
// Response: [{ "template-name", "content" }]
// ============================================================

import { NextResponse } from 'next/server';

import {
  fratalkAuthErrorResponse,
  fratalkOptionsResponse,
  requireFratalkAuth,
  withFratalkCors,
} from '@/lib/fratalk/auth';

export async function OPTIONS() {
  return fratalkOptionsResponse();
}

export async function GET(request: Request) {
  try {
    const ctx = await requireFratalkAuth(request);

    const { data: rows, error } = await ctx.supabase
      .from('message_templates')
      .select('name, body_text, status, language')
      .eq('account_id', ctx.accountId)
      .order('name', { ascending: true });

    if (error) {
      console.error('[fratalk/get-templates]', error.message);
      return withFratalkCors(NextResponse.json([], { status: 200 }));
    }

    // Prefer APPROVED; one entry per template name (first language wins).
    const byName = new Map<
      string,
      { name: string; body_text: string; status: string | null }
    >();
    for (const row of rows ?? []) {
      const name = typeof row.name === 'string' ? row.name : '';
      if (!name) continue;
      const status =
        typeof row.status === 'string' ? row.status.toUpperCase() : '';
      const existing = byName.get(name);
      if (!existing) {
        byName.set(name, {
          name,
          body_text: typeof row.body_text === 'string' ? row.body_text : '',
          status,
        });
        continue;
      }
      if (existing.status !== 'APPROVED' && status === 'APPROVED') {
        byName.set(name, {
          name,
          body_text: typeof row.body_text === 'string' ? row.body_text : '',
          status,
        });
      }
    }

    const infoBase = [...byName.values()].map((v) => ({
      'template-name': v.name,
      content: v.body_text,
    }));

    return withFratalkCors(NextResponse.json(infoBase));
  } catch (err) {
    const authRes = fratalkAuthErrorResponse(err);
    if (authRes) return withFratalkCors(authRes);
    console.error('[fratalk/get-templates] unexpected:', err);
    return withFratalkCors(NextResponse.json([], { status: 200 }));
  }
}
