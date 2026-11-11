// @vitest-environment jsdom
import { ScriptedProvider } from '@faircart/agent-core';
import { initialState } from '@faircart/shop';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { MockPayPal } from '../src/paypal/mock';
import { RunStore } from '../src/runs';
import { checkoutPlan, MANDATE_REQUEST, observation } from './fixtures';

async function passed(opts: { autopay: boolean; paypal?: MockPayPal }) {
  const paypal = opts.paypal ?? new MockPayPal();
  const app = createApp({ store: new RunStore(), provider: new ScriptedProvider([checkoutPlan]), secret: 's3cret', now: () => new Date('2026-11-12T10:00:00Z'), paypal, paypalConfig: { clientId: 'mock', mode: 'mock' } });
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(path, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, json: (await res.json()) as any };
  };
  const { json } = await call('POST', '/api/runs', { mandate: { ...MANDATE_REQUEST.mandate, autopay: opts.autopay } });
  const runId = json.runId as string;
  return { call, paypal, runId };
}

async function link(call: Awaited<ReturnType<typeof passed>>['call'], runId: string) {
  const setup = await call('POST', `/api/runs/${runId}/wallet/setup`, { returnUrl: 'http://localhost:5173/wallet-return.html' });
  expect(setup.status).toBe(200);
  expect(setup.json.approveUrl).toContain('wallet-return.html');
  const confirm = await call('POST', `/api/runs/${runId}/wallet/confirm`, { setupTokenId: setup.json.setupTokenId });
  expect(confirm.json).toMatchObject({ linked: true });
}

async function checkout(call: Awaited<ReturnType<typeof passed>>['call'], runId: string) {
  await call('POST', `/api/runs/${runId}/observe`, observation('fairmart', 'pay', initialState('fairmart')));
  const g = await call('POST', `/api/runs/${runId}/checkout`);
  expect(g.json.verdict).toBe('PASS');
  return g.json.authorization;
}

describe('agent wallet', () => {
  it('lets the agent pay on its own: authorize, verify, capture, with no buyer pop-up', async () => {
    const { call, paypal, runId } = await passed({ autopay: true });
    await link(call, runId);
    const authorization = await checkout(call, runId);
    const r = await call('POST', '/shop/api/agent-pay', { authorization });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ state: 'captured', paidBy: 'agent', capture: { status: 'COMPLETED', amount: '3.28' } });
    expect(paypal.lastOrder?.intent).toBe('AUTHORIZE');
    expect(paypal.lastOrder?.payment_source?.paypal.vault_id).toMatch(/^MOCKTOKEN/);
    expect(r.json.receipt).toMatchObject({ savedPaise: 0, intentMandateId: expect.stringMatching(/^IM-/), cartMandateId: expect.stringMatching(/^CM-/) });
  });

  it('pays once even when the agent retries', async () => {
    const { call, paypal, runId } = await passed({ autopay: true });
    await link(call, runId);
    const authorization = await checkout(call, runId);
    const [a, b] = await Promise.all([call('POST', '/shop/api/agent-pay', { authorization }), call('POST', '/shop/api/agent-pay', { authorization })]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(paypal.created).toBe(1);
    expect(paypal.captures).toBe(1);
  });

  it('voids the hold and stops when the PayPal order does not match the cart mandate', async () => {
    const paypal = new MockPayPal();
    paypal.tamper = (body) => {
      body.purchase_units[0]!.amount.value = '3.38';
      return body;
    };
    const { call, runId } = await passed({ autopay: true, paypal });
    await link(call, runId);
    const authorization = await checkout(call, runId);
    const r = await call('POST', '/shop/api/agent-pay', { authorization });
    expect(r.status).toBe(422);
    expect(paypal.voided).toBe(1);
    expect(paypal.captures).toBe(0);
    expect((await call('GET', `/api/runs/${runId}`)).json.state).toBe('failed');
  });

  it('refuses to let the agent pay without a mandate signed for it', async () => {
    const { call, runId } = await passed({ autopay: false });
    expect((await call('POST', `/api/runs/${runId}/wallet/setup`, { returnUrl: 'http://localhost:5173/wallet-return.html' })).status).toBe(403);
    const authorization = await checkout(call, runId);
    expect((await call('POST', '/shop/api/agent-pay', { authorization })).json).toMatchObject({ error: 'autopay_not_signed' });
  });

  it('refuses to let the agent pay before a wallet is linked', async () => {
    const { call, runId } = await passed({ autopay: true });
    const authorization = await checkout(call, runId);
    const r = await call('POST', '/shop/api/agent-pay', { authorization });
    expect([r.status, r.json.error]).toEqual([403, 'no_wallet']);
  });
});

describe('payments ledger', () => {
  it('records each finished run with what the store tried, what was paid, and what FairCart caught', async () => {
    const { call, runId } = await passed({ autopay: true });
    await link(call, runId);
    const authorization = await checkout(call, runId);
    await call('POST', '/shop/api/agent-pay', { authorization });
    const { json } = await call('GET', '/api/ledger');
    expect(json.rows).toHaveLength(1);
    expect(json.rows[0]).toMatchObject({
      runId,
      store: 'FairMart',
      state: 'captured',
      triedPaise: 28900,
      paidPaise: 28900,
      savedPaise: 0,
      paidUsdCents: 328,
      paidBy: 'agent',
      intentMandateId: expect.stringMatching(/^IM-/),
      cartMandateId: expect.stringMatching(/^CM-/),
      orderId: expect.stringMatching(/^MOCK/),
      caught: [],
    });
  });

  it('records stopped runs too, with the charges caught before stopping', async () => {
    const { call, runId } = await passed({ autopay: false });
    await call('POST', `/api/runs/${runId}/observe`, observation('demomart', 'basket', initialState('demomart')));
    await call('POST', `/api/runs/${runId}/observe`, observation('demomart', 'pay', { protection: false, pass: false, disputed: true }, { pageId: 'pay' }));
    await call('POST', `/api/runs/${runId}/checkout`);
    await call('POST', `/api/runs/${runId}/amend`, { stop: true });
    const row = (await call('GET', '/api/ledger')).json.rows[0];
    expect(row).toMatchObject({ store: 'DemoMart', state: 'stopped', paidPaise: null });
    expect(row.caught).toEqual([
      { label: 'Freshness protection (1 year)', paise: 4900, pattern: 'Added without your choice' },
      { label: 'Demo Pass (3 months)', paise: 9900, pattern: 'Added without your choice' },
    ]);
  });
});
