// ============================================================
// Read-only queries against Fratalk MySQL (legacy archive).
// All lookups are scoped by usuario.RUC.
// ============================================================

import {
  getFratalkMysqlPool,
  isFratalkMysqlConfigured,
  type RowDataPacket,
} from '@/lib/fratalk/mysql';
import type {
  LegacyBalanceRow,
  LegacyEtiquetaRow,
  LegacyRespuestaRow,
  LegacySendRow,
} from '@/lib/fratalk/legacy-types';

export type {
  LegacyBalanceRow,
  LegacyEtiquetaRow,
  LegacyRespuestaRow,
  LegacySendRow,
} from '@/lib/fratalk/legacy-types';

export class FratalkMysqlError extends Error {
  readonly code: 'not_configured' | 'query_failed' | 'not_found';
  readonly status: number;
  constructor(
    code: FratalkMysqlError['code'],
    message: string,
    status = 503,
  ) {
    super(message);
    this.name = 'FratalkMysqlError';
    this.code = code;
    this.status = status;
  }
}

function requirePool() {
  if (!isFratalkMysqlConfigured()) {
    throw new FratalkMysqlError(
      'not_configured',
      'Fratalk MySQL is not configured',
      503,
    );
  }
  return getFratalkMysqlPool();
}

export async function resolveFratalkUsuarioIdByRuc(
  ruc: string,
): Promise<number | null> {
  const db = requirePool();
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT ID AS id FROM usuario WHERE RUC = :ruc LIMIT 1`,
    { ruc },
  );
  const id = rows[0]?.id;
  return typeof id === 'number' ? id : id != null ? Number(id) : null;
}

export type LegacyReplyFilter = 'all' | 'replied' | 'unreplied';

export async function listLegacySendsByRuc(opts: {
  ruc: string;
  limit: number;
  offset: number;
  q?: string;
  replyFilter?: LegacyReplyFilter;
}): Promise<{ rows: LegacySendRow[]; total: number }> {
  const db = requirePool();
  const { ruc, limit, offset } = opts;
  const q = opts.q?.trim() || '';
  const replyFilter = opts.replyFilter ?? 'all';

  const where = [
    'u.RUC = :ruc',
    ...(q
      ? [
          `(mt.telefono_recepcion LIKE :like OR mt.template_id_template LIKE :like OR mt.message_id LIKE :like OR COALESCE(t.title, '') LIKE :like)`,
        ]
      : []),
    ...(replyFilter === 'replied'
      ? [
          `EXISTS (SELECT 1 FROM respuesta r WHERE r.mensaje_id = mt.mensaje_id)`,
        ]
      : []),
    ...(replyFilter === 'unreplied'
      ? [
          `NOT EXISTS (SELECT 1 FROM respuesta r WHERE r.mensaje_id = mt.mensaje_id)`,
        ]
      : []),
  ].join(' AND ');

  const params: Record<string, string | number> = {
    ruc,
    limit,
    offset,
  };
  if (q) params.like = `%${q}%`;

  const [countRows] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM mensaje_template mt
     JOIN usuario_key uk ON uk.ID = mt.USUARIO_KEY_ID
     JOIN usuario u ON u.ID = uk.USUARIO_ID
     LEFT JOIN template t
       ON t.id_template = mt.template_id_template AND t.id_usuario = u.ID
     WHERE ${where}`,
    params,
  );
  const total = Number(countRows[0]?.total ?? 0);

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT
       mt.mensaje_id,
       mt.telefono_recepcion,
       mt.fh_envio,
       mt.template_id_template AS template_id,
       t.title AS template_name,
       mt.message_id,
       mt.id_compra,
       EXISTS (
         SELECT 1 FROM respuesta r WHERE r.mensaje_id = mt.mensaje_id
       ) AS has_inbound_reply
     FROM mensaje_template mt
     JOIN usuario_key uk ON uk.ID = mt.USUARIO_KEY_ID
     JOIN usuario u ON u.ID = uk.USUARIO_ID
     LEFT JOIN template t
       ON t.id_template = mt.template_id_template AND t.id_usuario = u.ID
     WHERE ${where}
     ORDER BY mt.fh_envio DESC, mt.mensaje_id DESC
     LIMIT :limit OFFSET :offset`,
    params,
  );

  return {
    total,
    rows: rows.map((r) => ({
      mensaje_id: Number(r.mensaje_id),
      telefono_recepcion: String(r.telefono_recepcion ?? ''),
      fh_envio: String(r.fh_envio ?? ''),
      template_id: String(r.template_id ?? ''),
      template_name: r.template_name != null ? String(r.template_name) : null,
      message_id: r.message_id != null ? String(r.message_id) : null,
      id_compra: r.id_compra != null ? Number(r.id_compra) : null,
      has_inbound_reply: Boolean(Number(r.has_inbound_reply)),
    })),
  };
}

export async function getLegacySendDetailByRuc(opts: {
  ruc: string;
  mensajeId: number;
}): Promise<{
  send: LegacySendRow;
  etiquetas: LegacyEtiquetaRow[];
  respuestas: LegacyRespuestaRow[];
} | null> {
  const db = requirePool();
  const { ruc, mensajeId } = opts;

  const [sendRows] = await db.query<RowDataPacket[]>(
    `SELECT
       mt.mensaje_id,
       mt.telefono_recepcion,
       mt.fh_envio,
       mt.template_id_template AS template_id,
       t.title AS template_name,
       mt.message_id,
       mt.id_compra
     FROM mensaje_template mt
     JOIN usuario_key uk ON uk.ID = mt.USUARIO_KEY_ID
     JOIN usuario u ON u.ID = uk.USUARIO_ID
     LEFT JOIN template t
       ON t.id_template = mt.template_id_template AND t.id_usuario = u.ID
     WHERE u.RUC = :ruc AND mt.mensaje_id = :mensajeId
     LIMIT 1`,
    { ruc, mensajeId },
  );
  if (!sendRows[0]) return null;
  const r = sendRows[0];
  const send: LegacySendRow = {
    mensaje_id: Number(r.mensaje_id),
    telefono_recepcion: String(r.telefono_recepcion ?? ''),
    fh_envio: String(r.fh_envio ?? ''),
    template_id: String(r.template_id ?? ''),
    template_name: r.template_name != null ? String(r.template_name) : null,
    message_id: r.message_id != null ? String(r.message_id) : null,
    id_compra: r.id_compra != null ? Number(r.id_compra) : null,
    has_inbound_reply: false,
  };

  const [etqRows] = await db.query<RowDataPacket[]>(
    `SELECT id, orden_template, valor, template_id, tipo
     FROM template_etiqueta
     WHERE mensaje_template_mensaje_id = :mensajeId
     ORDER BY CAST(orden_template AS UNSIGNED), id`,
    { mensajeId },
  );

  const [inRows] = await db.query<RowDataPacket[]>(
    `SELECT ID AS id, fh_envio, mensaje
     FROM respuesta
     WHERE mensaje_id = :mensajeId
     ORDER BY fh_envio ASC, ID ASC`,
    { mensajeId },
  );

  const [autoRows] = await db.query<RowDataPacket[]>(
    `SELECT id, fh_envio, mensaje, message_id
     FROM respuesta_automatica
     WHERE id_refrencia = :mensajeId
     ORDER BY fh_envio ASC, id ASC`,
    { mensajeId },
  );

  const respuestas: LegacyRespuestaRow[] = [
    ...inRows.map((row) => ({
      id: Number(row.id),
      fh_envio: String(row.fh_envio ?? ''),
      mensaje: String(row.mensaje ?? ''),
      kind: 'inbound' as const,
      message_id: null,
    })),
    ...autoRows.map((row) => ({
      id: Number(row.id),
      fh_envio: String(row.fh_envio ?? ''),
      mensaje: String(row.mensaje ?? ''),
      kind: 'automatic' as const,
      message_id: row.message_id != null ? String(row.message_id) : null,
    })),
  ].sort((a, b) => a.fh_envio.localeCompare(b.fh_envio));

  send.has_inbound_reply = inRows.length > 0;

  return {
    send,
    etiquetas: etqRows.map((row) => ({
      id: Number(row.id),
      orden_template: String(row.orden_template ?? ''),
      valor: String(row.valor ?? ''),
      template_id: String(row.template_id ?? ''),
      tipo: row.tipo != null ? String(row.tipo) : null,
    })),
    respuestas,
  };
}

/** Platform-owner only: vista_saldo_compras for this RUC. */
export async function listLegacyBalanceByRuc(
  ruc: string,
): Promise<LegacyBalanceRow[]> {
  const db = requirePool();
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT
       v.id,
       v.inicio_vigencia,
       v.USUARIO_KEY_ID AS usuario_id,
       v.razon_social,
       v.category,
       v.ultimo_envio,
       v.saldo,
       v.usado,
       v.consumido_hoy,
       v.media_envios_dia,
       v.porcentaje_consumo
     FROM vista_saldo_compras v
     JOIN usuario u ON u.ID = v.USUARIO_KEY_ID
     WHERE u.RUC = :ruc
     ORDER BY v.inicio_vigencia DESC, v.category`,
    { ruc },
  );

  return rows.map((r) => ({
    id: Number(r.id),
    inicio_vigencia: String(r.inicio_vigencia ?? ''),
    usuario_id: Number(r.usuario_id),
    razon_social: String(r.razon_social ?? ''),
    category: String(r.category ?? ''),
    ultimo_envio: r.ultimo_envio != null ? String(r.ultimo_envio) : null,
    saldo: Number(r.saldo ?? 0),
    usado: Number(r.usado ?? 0),
    consumido_hoy: Number(r.consumido_hoy ?? 0),
    media_envios_dia: Number(r.media_envios_dia ?? 0),
    porcentaje_consumo: Number(r.porcentaje_consumo ?? 0),
  }));
}
