// ============================================================
// Read-only MySQL pool for Fratalk legacy history screens.
// Disabled when FRATALK_MYSQL_HOST is unset.
// ============================================================

import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';

let pool: Pool | null = null;

export function isFratalkMysqlConfigured(): boolean {
  return Boolean(process.env.FRATALK_MYSQL_HOST?.trim());
}

export function getFratalkMysqlPool(): Pool {
  if (!isFratalkMysqlConfigured()) {
    throw new Error('FRATALK_MYSQL_NOT_CONFIGURED');
  }
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.FRATALK_MYSQL_HOST!.trim(),
      port: Number(process.env.FRATALK_MYSQL_PORT || 3306),
      user: process.env.FRATALK_MYSQL_USER?.trim() || 'root',
      password: process.env.FRATALK_MYSQL_PASSWORD ?? '',
      database: process.env.FRATALK_MYSQL_DATABASE?.trim() || 'fratalk',
      waitForConnections: true,
      connectionLimit: 5,
      namedPlaceholders: true,
      dateStrings: true,
    });
  }
  return pool;
}

export type { RowDataPacket };
