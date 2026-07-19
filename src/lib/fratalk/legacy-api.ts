import { supabaseAdmin } from '@/lib/flows/admin-client';
import { FratalkMysqlError, type LegacyReplyFilter } from '@/lib/fratalk/legacy-queries';
import { NextResponse } from 'next/server';

export async function getAccountRuc(
  accountId: string,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from('accounts')
    .select('ruc')
    .eq('id', accountId)
    .maybeSingle<{ ruc: string | null }>();
  if (error) {
    console.error('[getAccountRuc]', error.message);
    return null;
  }
  const ruc = data?.ruc?.trim();
  return ruc || null;
}

export function legacyFratalkErrorResponse(err: unknown): NextResponse {
  if (err instanceof FratalkMysqlError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.status },
    );
  }
  if (
    err instanceof Error &&
    err.message === 'FRATALK_MYSQL_NOT_CONFIGURED'
  ) {
    return NextResponse.json(
      {
        error: 'Fratalk MySQL is not configured',
        code: 'not_configured',
      },
      { status: 503 },
    );
  }
  console.error('[legacy-fratalk]', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

function parseReplyFilter(raw: string | null): LegacyReplyFilter {
  if (raw === 'replied' || raw === 'unreplied') return raw;
  return 'all';
}

export function parsePagination(url: URL): {
  limit: number;
  offset: number;
  q: string;
  replyFilter: LegacyReplyFilter;
} {
  const limit = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get('limit') || 10) || 10),
  );
  const offset = Math.max(0, Number(url.searchParams.get('offset') || 0) || 0);
  const q = (url.searchParams.get('q') || '').trim();
  const replyFilter = parseReplyFilter(url.searchParams.get('replied'));
  return { limit, offset, q, replyFilter };
}
