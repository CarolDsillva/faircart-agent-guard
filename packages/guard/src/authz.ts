import { createHmac, timingSafeEqual } from 'node:crypto';

export interface AuthorizationLine {
  label: string;
  kind: 'product' | 'fee';
  qty: number;
  paise: number;
  usdCents: number;
}

/** The only thing that can lead to a PayPal order. Signed by the server, single use. */
export interface Authorization {
  id: string;
  runId: string;
  mandateVersion: number;
  lines: AuthorizationLine[];
  totalPaise: number;
  totalUsdCents: number;
  rate: { inrPerUsd: number };
  issuedAt: string;
  expiresAt: string;
  sig: string;
}

export const AUTHZ_TTL_MS = 30 * 60_000;

/** Stable JSON: object keys sorted at every level, so the signature doesn't depend on key order. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

function mac(body: Omit<Authorization, 'sig'>, secret: string): string {
  return createHmac('sha256', secret).update(canonical(body)).digest('hex');
}

export function signAuthorization(a: Omit<Authorization, 'sig'>, secret: string): Authorization {
  return { ...a, sig: mac(a, secret) };
}

export function verifyAuthorization(
  a: Authorization,
  secret: string,
  now: Date,
  opts: { checkExpiry: boolean },
): { ok: true } | { ok: false; reason: 'bad_sig' | 'expired' } {
  const { sig, ...body } = a;
  const want = Buffer.from(mac(body, secret), 'hex');
  const got = Buffer.from(typeof sig === 'string' ? sig : '', 'hex');
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: 'bad_sig' };
  if (opts.checkExpiry && now.getTime() > Date.parse(a.expiresAt)) return { ok: false, reason: 'expired' };
  return { ok: true };
}
