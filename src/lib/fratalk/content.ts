/** Normalize fratalk `content` array (strings or { contenido }). */
export function normalizeFratalkContent(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  return content.map((item) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
      const row = item as Record<string, unknown>;
      if (typeof row.contenido === 'string') return row.contenido;
      if (typeof row.text === 'string') return row.text;
    }
    if (item == null) return '';
    return String(item);
  });
}

/** Build phone the way fratalk does: `${prefix}${to}` (default prefix 51). */
export function buildFratalkPhone(
  to: string,
  prefix: unknown = 51,
): string {
  const local = String(to).replace(/\D/g, '');
  const pref =
    prefix == null || prefix === ''
      ? '51'
      : String(prefix).replace(/\D/g, '');
  // If caller already sent a full international number, don't double-prefix.
  if (pref && local.startsWith(pref) && local.length > pref.length + 6) {
    return local;
  }
  return `${pref}${local}`;
}
