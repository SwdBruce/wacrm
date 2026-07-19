/** Shared DTOs for Fratalk legacy history (safe for client imports). */

export interface LegacySendRow {
  mensaje_id: number;
  telefono_recepcion: string;
  fh_envio: string;
  template_id: string;
  template_name: string | null;
  message_id: string | null;
  id_compra: number | null;
  /** True when at least one row exists in Fratalk `respuesta` (end-user reply). */
  has_inbound_reply: boolean;
}

export interface LegacyEtiquetaRow {
  id: number;
  orden_template: string;
  valor: string;
  template_id: string;
  tipo: string | null;
}

export interface LegacyRespuestaRow {
  id: number;
  fh_envio: string;
  mensaje: string;
  kind: 'inbound' | 'automatic';
  message_id: string | null;
}

export interface LegacyBalanceRow {
  id: number;
  inicio_vigencia: string;
  usuario_id: number;
  razon_social: string;
  category: string;
  ultimo_envio: string | null;
  saldo: number;
  usado: number;
  consumido_hoy: number;
  media_envios_dia: number;
  porcentaje_consumo: number;
}
