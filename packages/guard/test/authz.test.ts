import { describe, expect, it } from 'vitest';
import { compareOrder, guard, verifyAuthorization, type Authorization, type PayPalOrderView } from '@faircart/guard';
import { honestBill, mandate, NOW, SECRET, snapshot } from './helpers';

function authz(): Authorization {
  const r = guard({ mandate: mandate(), snapshot: snapshot(), bill: honestBill(), findings: [], runId: 'r1', now: NOW, secret: SECRET });
  if (r.verdict !== 'PASS') throw new Error('expected PASS');
  return r.authorization;
}

describe('authorization', () => {
  it('verifies when untouched', () => {
    expect(verifyAuthorization(authz(), SECRET, NOW, { checkExpiry: true })).toEqual({ ok: true });
  });
  it('rejects a tampered total', () => {
    expect(verifyAuthorization({ ...authz(), totalPaise: 100 }, SECRET, NOW, { checkExpiry: true })).toEqual({ ok: false, reason: 'bad_sig' });
  });
  it('rejects the wrong secret', () => {
    expect(verifyAuthorization(authz(), 'other', NOW, { checkExpiry: true })).toEqual({ ok: false, reason: 'bad_sig' });
  });
  it('expires after 30 minutes only when expiry is checked', () => {
    const later = new Date(NOW.getTime() + 31 * 60_000);
    expect(verifyAuthorization(authz(), SECRET, later, { checkExpiry: true })).toEqual({ ok: false, reason: 'expired' });
    expect(verifyAuthorization(authz(), SECRET, later, { checkExpiry: false })).toEqual({ ok: true });
  });
});

describe('compareOrder', () => {
  const order = (a: Authorization): PayPalOrderView => ({
    currency: 'USD',
    total: '3.28',
    items: a.lines.map((l) => ({ name: l.label, quantity: '1', unit_amount: { value: '3.28' } })),
  });
  it('accepts an order that matches line for line', () => {
    const a = authz();
    expect(compareOrder(a, order(a))).toEqual([]);
  });
  it('flags a different total', () => {
    const a = authz();
    expect(compareOrder(a, { ...order(a), total: '3.38' }).map((r) => r.code)).toEqual(['PAYPAL_ORDER_MISMATCH']);
  });
  it('flags an extra item', () => {
    const a = authz();
    const o = order(a);
    o.items.push({ name: 'Service charge', quantity: '1', unit_amount: { value: '0.11' } });
    expect(compareOrder(a, o).map((r) => r.code)).toContain('PAYPAL_ORDER_MISMATCH');
  });
  it('flags another currency', () => {
    const a = authz();
    expect(compareOrder(a, { ...order(a), currency: 'INR' }).map((r) => r.code)).toEqual(['PAYPAL_ORDER_MISMATCH']);
  });
});
