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

/**
 * One row per Fratalk `compra` (credit pool). Categories from
 * `paquete_detalle` are aggregated — multi-category packs share one saldo.
 */
export interface LegacyBalanceRow {
  id: number;
  inicio_vigencia: string;
  fin_vigencia: string;
  usuario_id: number;
  razon_social: string;
  /** Meta template categories this pack covers (shared credit pool). */
  categories: string[];
  /** Catalog size from Fratalk `paquete.cantidad`. */
  quantity: number;
  unit_price: number;
  duration_days: number;
  ultimo_envio: string | null;
  saldo: number;
  usado: number;
  consumido_hoy: number;
  media_envios_dia: number;
  porcentaje_consumo: number;
  /**
   * Same rule as Fratalk `validarSaldo`: today is within
   * [inicio_vigencia, FIN_VIGENCIA] and remaining saldo > 0.
   */
  is_active: boolean;
  /** True when this account already has a CRM purchase with this legacy_compra_id. */
  already_migrated: boolean;
  migrated_purchase_id: string | null;
}
