// ============================================================
// Fratalk-compatible HS256 JWT (secret historically "FraGoTe").
// Matches jsonwebtoken sign/verify used by fratalk-be.
// ============================================================

import { createHmac, timingSafeEqual } from 'node:crypto';

export function fratalkJwtSecret(): string {
  const secret = process.env.FRATALK_JWT_SECRET?.trim();
  if (secret) return secret;
  // Default matches fratalk-be `firma` so existing client tokens keep working.
  return 'FraGoTe';
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function b64urlJson(value: unknown): string {
  return b64url(JSON.stringify(value));
}

function decodeB64url(segment: string): Buffer {
  const padded = segment + '='.repeat((4 - (segment.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export interface FratalkJwtPayload {
  RUC?: string;
  name?: string;
  nombre?: string;
  user?: string;
  id_cliente?: number | string;
  status?: string;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

export function signFratalkJwt(
  payload: FratalkJwtPayload,
  options?: { expiresInSeconds?: number },
): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body: FratalkJwtPayload = { ...payload, iat: payload.iat ?? now };
  if (options?.expiresInSeconds != null) {
    body.exp = now + options.expiresInSeconds;
  }
  const data = `${b64urlJson(header)}.${b64urlJson(body)}`;
  const sig = createHmac('sha256', fratalkJwtSecret())
    .update(data)
    .digest();
  return `${data}.${b64url(sig)}`;
}

export function verifyFratalkJwt(token: string): FratalkJwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('invalid_token');
  }
  const [headerB64, payloadB64, sigB64] = parts;
  const data = `${headerB64}.${payloadB64}`;
  const expected = createHmac('sha256', fratalkJwtSecret())
    .update(data)
    .digest();
  const actual = decodeB64url(sigB64);
  if (
    expected.length !== actual.length ||
    !timingSafeEqual(expected, actual)
  ) {
    throw new Error('invalid_token');
  }

  let header: { alg?: string };
  try {
    header = JSON.parse(decodeB64url(headerB64).toString('utf8')) as {
      alg?: string;
    };
  } catch {
    throw new Error('invalid_token');
  }
  if (header.alg !== 'HS256') {
    throw new Error('invalid_token');
  }

  let payload: FratalkJwtPayload;
  try {
    payload = JSON.parse(
      decodeB64url(payloadB64).toString('utf8'),
    ) as FratalkJwtPayload;
  } catch {
    throw new Error('invalid_token');
  }

  if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('expired_token');
  }

  return payload;
}
