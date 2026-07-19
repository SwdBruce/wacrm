// ============================================================
// POST /api/legacy/fratalk/send-template
// Fratalk-compatible: POST /send-template (via rewrite)
// Body: { to, "template-name", content?, prefix?, RUC? }
// Auth: Bearer JWT. Credits + Meta send via wacrm core.
// Response: Meta Graph-shaped JSON (messages[0].id).
// ============================================================

import { NextResponse } from 'next/server';

import {
  fratalkAuthErrorResponse,
  fratalkOptionsResponse,
  requireFratalkAuth,
  withFratalkCors,
} from '@/lib/fratalk/auth';
import {
  buildFratalkPhone,
  normalizeFratalkContent,
} from '@/lib/fratalk/content';
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation';
import {
  sendMessageToConversation,
  SendMessageError,
} from '@/lib/whatsapp/send-message';
import { isMessageTemplate } from '@/lib/whatsapp/template-row-guard';
import type { MessageTemplate } from '@/types';

export async function OPTIONS() {
  return fratalkOptionsResponse();
}

export async function POST(request: Request) {
  let msg: string | Record<string, string> =
    'Ocurrió un error al enviar el mensaje.';

  try {
    const ctx = await requireFratalkAuth(request);
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!body || typeof body !== 'object') {
      return withFratalkCors(
        NextResponse.json(
          { error: 'El número de teléfono es necesario.' },
          { status: 400 },
        ),
      );
    }

    const to = typeof body.to === 'string' ? body.to.trim() : '';
    if (!to) {
      return withFratalkCors(
        NextResponse.json(
          { error: 'El número de teléfono es necesario.' },
          { status: 400 },
        ),
      );
    }

    const templateNameRaw =
      body['template-name'] ?? body.template_name ?? body.title;
    const templateName =
      typeof templateNameRaw === 'string' ? templateNameRaw.trim() : '';
    if (!templateName) {
      return withFratalkCors(
        NextResponse.json(
          { error: 'template-name es necesario.' },
          { status: 400 },
        ),
      );
    }

    const phone = buildFratalkPhone(to, body.prefix ?? 51);
    const contentParams = normalizeFratalkContent(body.content);

    // Resolve template by name (any language); prefer APPROVED.
    const { data: templateRows } = await ctx.supabase
      .from('message_templates')
      .select('*')
      .eq('account_id', ctx.accountId)
      .eq('name', templateName);

    let templateRow: MessageTemplate | null = null;
    if (templateRows?.length) {
      const approved = templateRows.find(
        (r) =>
          typeof r.status === 'string' &&
          r.status.toUpperCase() === 'APPROVED',
      );
      const pick = approved ?? templateRows[0];
      if (pick && isMessageTemplate(pick)) {
        templateRow = pick;
      }
    }

    if (!templateRow) {
      msg = 'Ocurrió un error al enviar el mensaje.';
      throw new Error('template_not_found');
    }

    const language = templateRow.language || 'es';

    // AUTHENTICATION: fratalk also sends the first body value as the
    // URL button OTP param.
    const isAuth =
      typeof templateRow.category === 'string' &&
      templateRow.category.toUpperCase() === 'AUTHENTICATION';
    const templateMessageParams =
      isAuth && contentParams.length > 0
        ? { body: contentParams, buttonParams: { 0: contentParams[0] } }
        : contentParams.length > 0
          ? { body: contentParams }
          : undefined;

    const resolved = await resolveConversationByPhone(
      ctx.supabase,
      ctx.accountId,
      phone,
      null,
    );

    const result = await sendMessageToConversation(
      ctx.supabase,
      ctx.accountId,
      {
        conversationId: resolved.conversationId,
        messageType: 'template',
        templateName,
        templateLanguage: language,
        templateParams: contentParams,
        templateMessageParams,
      },
    );

    // Mirror Meta Graph success shape that fratalk returned as-is.
    const metaShape = {
      messaging_product: 'whatsapp',
      contacts: [{ input: phone, wa_id: phone }],
      messages: [{ id: result.whatsappMessageId }],
    };

    return withFratalkCors(NextResponse.json(metaShape));
  } catch (err) {
    const authRes = fratalkAuthErrorResponse(err);
    if (authRes) return withFratalkCors(authRes);

    if (err instanceof SendMessageError) {
      if (err.code === 'insufficient_credits') {
        msg = 'No tiene saldo Disponible';
        return withFratalkCors(NextResponse.json(msg, { status: 500 }));
      }
      console.error('[fratalk/send-template]', err.code, err.message);
      return withFratalkCors(NextResponse.json(msg, { status: 500 }));
    }

    console.error('[fratalk/send-template]', err);
    return withFratalkCors(NextResponse.json(msg, { status: 500 }));
  }
}
