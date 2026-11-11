// @vitest-environment jsdom
import { ScriptedProvider } from '@faircart/agent-core';
import { initialState } from '@faircart/shop';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { MockPayPal } from '../src/paypal/mock';
import { RunStore } from '../src/runs';
import { checkoutPlan, MANDATE_REQUEST, observation } from './fixtures';

async function authorized(paypal = new MockPayPal()) {
  const store = new RunStore();
  const app = createApp({ store, provider: new ScriptedProvider([checkoutPlan]), secret: 's3cret', now: () => new Date('2026-11-12T10:00:00Z'), paypal, paypalConfig: { clientId: 'mock-client', mode: 'mock' } });
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, ...(body ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
    return { status: res.status, json: (await res.json()) as any };
  };
  const { json } = await call('POST', '/api/runs', MANDATE_REQUEST);
  await call('POST', `/api/runs/${json.runId}/observe`, observation('fairmart', 'pay', initialState('fairmart')));
  const g = await call('POST', `/api/runs/${json.runId}/checkout`);
  return { call, paypal, runId: json.runId as string, authorization: g.json.authorization };
}

describe('DemoMart merchant checkout', () => {
  it('creates one PayPal order per authorization, even when retried', async () => {
    const { call, paypal, authorization } = await authorized();
    const a = await call('POST', '/shop/api/checkout', { authorization });
    const b = await call('POST', '/shop/api/checkout', { authorization });
    expect(a.status).toBe(200);
    expect(b.json.orderId).toBe(a.json.orderId);
    expect(paypal.created).toBe(1);
  });

  it('itemises every approved line in USD cents', async () => {
    const { call, paypal, authorization } = await authorized();
    const { json } = await call('POST', '/shop/api/checkout', { authorization });
    const order = await paypal.getOrder(json.orderId);
    expect(order).toMatchObject({ currency: 'USD', total: '3.28', items: [{ name: 'Sunrise Chakki Atta 5 kg', quantity: '1', unit_amount: { value: '3.28' } }] });
  });

  it('refuses a tampered authorization', async () => {
    const { call, authorization } = await authorized();
    const r = await call('POST', '/shop/api/checkout', { authorization: { ...authorization, totalPaise: 100 } });
    expect(r.status).toBe(401);
  });

  it('refuses to go on when the PayPal order differs from what was approved', async () => {
    const paypal = new MockPayPal();
    paypal.tamper = (body) => {
      body.purchase_units[0]!.amount.value = '3.29';
      return body;
    };
    const { call, runId, authorization } = await authorized(paypal);
    const r = await call('POST', '/shop/api/checkout', { authorization });
    expect(r.status).toBe(422);
    expect(r.json.reasons[0].code).toBe('PAYPAL_ORDER_MISMATCH');
    expect((await call('GET', `/api/runs/${runId}`)).json.state).toBe('failed');
  });

  it('captures, checks the amount, and settles on a verified webhook', async () => {
    const { call, runId, authorization } = await authorized();
    const { json } = await call('POST', '/shop/api/checkout', { authorization });
    const cap = await call('POST', '/shop/api/capture', { runId, orderId: json.orderId });
    expect(cap.json).toMatchObject({ state: 'captured', capture: { status: 'COMPLETED', amount: '3.28' } });

    const event = { event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { invoice_id: authorization.id } };
    expect((await call('POST', '/api/paypal/webhook', event, { 'paypal-transmission-sig': 'forged' })).status).toBe(400);
    await call('POST', '/api/paypal/webhook', event, { 'paypal-transmission-sig': 'mock' });
    expect((await call('GET', `/api/runs/${runId}`)).json.state).toBe('settled');
  });

  it('serves the PayPal client config to the console', async () => {
    const { call } = await authorized();
    expect((await call('GET', '/api/config')).json).toEqual({ paypalClientId: 'mock-client', paypalMode: 'mock', inrPerUsd: 88 });
  });
});

describe('merchant checkout retries', () => {
  it('re-verifies the order when the first attempt failed after creating it', async () => {
    const paypal = new MockPayPal();
    const real = paypal.getOrder.bind(paypal);
    let calls = 0;
    paypal.getOrder = async (id: string) => {
      if (++calls === 1) throw new Error('network blip');
      return real(id);
    };
    const { call, runId, authorization } = await authorized(paypal);
    expect((await call('POST', '/shop/api/checkout', { authorization })).status).toBe(500);
    const retry = await call('POST', '/shop/api/checkout', { authorization });
    expect(retry.status).toBe(200);
    expect(retry.json.state).toBe('order_verified');
    expect(paypal.created).toBe(1);
    expect((await call('GET', `/api/runs/${runId}`)).json.state).toBe('order_verified');
  });

  it('never hands out an order FairCart rejected', async () => {
    const paypal = new MockPayPal();
    paypal.tamper = (body) => {
      body.purchase_units[0]!.amount.value = '3.29';
      return body;
    };
    const { call, authorization } = await authorized(paypal);
    expect((await call('POST', '/shop/api/checkout', { authorization })).status).toBe(422);
    expect((await call('POST', '/shop/api/checkout', { authorization })).status).toBe(422);
  });

  it('gives two simultaneous first calls the same verified order', async () => {
    const { call, paypal, authorization } = await authorized();
    const [a, b] = await Promise.all([call('POST', '/shop/api/checkout', { authorization }), call('POST', '/shop/api/checkout', { authorization })]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.json.orderId).toBe(b.json.orderId);
    expect(paypal.created).toBe(1);
  });

  it('settles when the PayPal webhook arrives before the capture is recorded', async () => {
    const { call, runId, authorization } = await authorized();
    const { json } = await call('POST', '/shop/api/checkout', { authorization });
    await call('POST', '/api/paypal/webhook', { event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { invoice_id: authorization.id } }, { 'paypal-transmission-sig': 'mock' });
    await call('POST', '/shop/api/capture', { runId, orderId: json.orderId });
    expect((await call('GET', `/api/runs/${runId}`)).json.state).toBe('settled');
  });

  it('answers run_expired when the run is gone', async () => {
    const { call, authorization } = await authorized();
    const r = await call('POST', '/shop/api/checkout', { authorization: { ...authorization } }, {});
    expect(r.status).toBe(200);
    const store2 = await authorized();
    const gone = await store2.call('POST', '/shop/api/checkout', { authorization });
    expect([gone.status, gone.json.error]).toEqual([404, 'run_expired']);
  });
});
