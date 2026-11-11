import { compareOrder, verifyAuthorization, type Authorization } from '@faircart/guard';
import { centsToPayPal, INR_PER_USD } from '@faircart/money';
import { Hono } from 'hono';
import { z } from 'zod';
import type { PayPal, PayPalConfig, OrderBody } from '../paypal/types';
import type { Run, RunStore } from '../runs';
import { runView } from './runs';

export interface MerchantDeps {
  store: RunStore;
  secret: string;
  now: () => Date;
  paypal: PayPal;
  paypalConfig: PayPalConfig;
}

const Line = z.object({ label: z.string(), kind: z.enum(['product', 'fee']), qty: z.number().int(), paise: z.number().int(), usdCents: z.number().int() });
const AuthorizationBody = z.object({
  id: z.string(),
  runId: z.string(),
  mandateVersion: z.number().int(),
  lines: z.array(Line).min(1).max(20),
  totalPaise: z.number().int(),
  totalUsdCents: z.number().int(),
  rate: z.object({ inrPerUsd: z.number() }),
  issuedAt: z.string(),
  expiresAt: z.string(),
  sig: z.string(),
});

/** DemoMart turns the buyer's signed cart into a PayPal order, every line an item. */
export function orderBody(a: Authorization, opts: { vaultId?: string } = {}): OrderBody {
  const value = centsToPayPal(a.totalUsdCents);
  return {
    // Agent-paid orders only place a hold; FairCart checks the order before it is captured.
    intent: opts.vaultId ? 'AUTHORIZE' : 'CAPTURE',
    ...(opts.vaultId ? { payment_source: { paypal: { vault_id: opts.vaultId } } } : {}),
    purchase_units: [
      {
        invoice_id: a.id,
        custom_id: a.runId,
        description: 'DemoMart order (FairCart Agent Guard demo)',
        amount: { currency_code: 'USD', value, breakdown: { item_total: { currency_code: 'USD', value } } },
        items: a.lines.map((l) => ({
          name: l.label,
          quantity: String(l.qty),
          unit_amount: { currency_code: 'USD', value: centsToPayPal(l.usdCents) },
          category: 'PHYSICAL_GOODS',
        })),
      },
    ],
  };
}

/** DemoMart's side: agent checkout, capture. Plus the PayPal webhook and client config. */
export function merchantRoutes(deps: MerchantDeps) {
  const { store, paypal } = deps;
  const app = new Hono();
  const inflight = new Map<string, Promise<{ status: 200 | 422; body: object }>>();

  app.post('/shop/api/checkout', async (c) => {
    const { authorization } = z.object({ authorization: AuthorizationBody }).parse(await c.req.json());
    const ok = verifyAuthorization(authorization, deps.secret, deps.now(), { checkExpiry: true });
    if (!ok.ok) return c.json({ error: 'bad_authorization', reason: ok.reason }, 401);
    const run = store.get(authorization.runId);
    if (!run) return c.json({ error: 'run_expired' }, 404);
    if (run.authorization?.sig !== authorization.sig) return c.json({ error: 'bad_authorization', reason: 'unknown' }, 401);

    // One checkout per run at a time: simultaneous calls share the same answer.
    let pending = inflight.get(run.id);
    if (!pending) {
      pending = checkoutOnce(run, authorization).finally(() => inflight.delete(run.id));
      inflight.set(run.id, pending);
    }
    const r = await pending;
    return c.json(r.body, r.status);
  });

  /**
   * Single use and idempotent: the same authorization always leads to the same
   * PayPal order, and an order is only handed out once FairCart has checked it.
   */
  async function checkoutOnce(run: Run, authorization: Authorization): Promise<{ status: 200 | 422; body: object }> {
    if ((run.state === 'order_verified' || run.state === 'captured' || run.state === 'settled') && run.orderId) {
      return { status: 200, body: { orderId: run.orderId, state: run.state } };
    }
    if (run.state === 'failed') return { status: 422, body: { error: 'order_rejected', reasons: run.lastGuard ?? [] } };
    store.require(run, 'authorized');

    if (!run.orderId) {
      const created = await paypal.createOrder(orderBody(authorization), authorization.id);
      run.authzUsed = true;
      run.orderId = created.id;
      store.audit(run, 'merchant', 'order_created', { orderId: created.id });
    }

    // FairCart reads the PayPal order itself before anyone approves it. If this
    // throws, the run stays 'authorized' and a retry checks the same order again.
    const reasons = compareOrder(authorization, await paypal.getOrder(run.orderId));
    if (reasons.length) {
      run.lastGuard = reasons;
      store.fail(run, 'guard', 'The PayPal order did not match what you approved.');
      return { status: 422, body: { error: 'order_mismatch', reasons } };
    }
    store.transition(run, 'order_verified', 'guard', 'order_verified', { orderId: run.orderId });
    return { status: 200, body: { orderId: run.orderId, state: run.state } };
  }

  // ---- Agent wallet: link the buyer's PayPal once, for a mandate signed with autopay.
  app.post('/api/runs/:id/wallet/setup', async (c) => {
    const run = store.get(c.req.param('id'));
    if (!run) return c.json({ error: 'run_expired' }, 404);
    if (!run.mandate.autopay) return c.json({ error: 'autopay_not_signed' }, 403);
    const { returnUrl } = z.object({ returnUrl: z.string().url() }).parse(await c.req.json());
    const cancelUrl = `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}cancel=1`;
    const token = await paypal.createSetupToken({ returnUrl, cancelUrl }, `setup-${run.id}`);
    store.audit(run, 'paypal', 'wallet_setup', { setupTokenId: token.id });
    return c.json({ setupTokenId: token.id, approveUrl: token.approveUrl });
  });

  app.post('/api/runs/:id/wallet/confirm', async (c) => {
    const run = store.get(c.req.param('id'));
    if (!run) return c.json({ error: 'run_expired' }, 404);
    if (!run.mandate.autopay) return c.json({ error: 'autopay_not_signed' }, 403);
    const { setupTokenId } = z.object({ setupTokenId: z.string().min(1).max(100) }).parse(await c.req.json());
    const token = await paypal.createPaymentToken(setupTokenId, `token-${setupTokenId}`);
    run.wallet = { paymentTokenId: token.id, linkedAt: deps.now().toISOString() };
    store.audit(run, 'human', 'wallet_linked');
    return c.json({ linked: true });
  });

  // ---- Human-not-present payment: the agent pays with the linked wallet, inside the signed mandates.
  app.post('/shop/api/agent-pay', async (c) => {
    const { authorization } = z.object({ authorization: AuthorizationBody }).parse(await c.req.json());
    const ok = verifyAuthorization(authorization, deps.secret, deps.now(), { checkExpiry: true });
    if (!ok.ok) return c.json({ error: 'bad_authorization', reason: ok.reason }, 401);
    const run = store.get(authorization.runId);
    if (!run) return c.json({ error: 'run_expired' }, 404);
    if (run.authorization?.sig !== authorization.sig) return c.json({ error: 'bad_authorization', reason: 'unknown' }, 401);
    if (!run.mandate.autopay) return c.json({ error: 'autopay_not_signed' }, 403);
    if (!run.wallet) return c.json({ error: 'no_wallet' }, 403);

    let pending = inflight.get(`pay:${run.id}`);
    if (!pending) {
      pending = agentPayOnce(run, authorization).finally(() => inflight.delete(`pay:${run.id}`));
      inflight.set(`pay:${run.id}`, pending);
    }
    const r = await pending;
    return c.json(r.body, r.status);
  });

  async function agentPayOnce(run: Run, authorization: Authorization): Promise<{ status: 200 | 422; body: object }> {
    if (run.state === 'captured' || run.state === 'settled') return { status: 200, body: runView(run) };
    if (run.state === 'failed') return { status: 422, body: { error: 'order_rejected', reasons: run.lastGuard ?? [] } };
    store.require(run, 'authorized', 'order_verified');

    if (!run.orderId) {
      const created = await paypal.createOrder(orderBody(authorization, { vaultId: run.wallet!.paymentTokenId }), authorization.id);
      run.authzUsed = true;
      run.orderId = created.id;
      if (created.authorizationId) run.paypalAuthorizationId = created.authorizationId;
      store.audit(run, 'merchant', 'order_created', { orderId: created.id, intent: 'AUTHORIZE', paidWith: 'agent wallet' });
    }
    run.paypalAuthorizationId ??= (await paypal.authorizeOrder(run.orderId, `auth-${run.orderId}`)).authorizationId;

    // Money is only held. FairCart checks the order against the cart mandate before it is captured.
    if (run.state === 'authorized') {
      const reasons = compareOrder(authorization, await paypal.getOrder(run.orderId));
      if (reasons.length) {
        await paypal.voidAuthorization(run.paypalAuthorizationId).catch(() => undefined);
        run.lastGuard = reasons;
        store.fail(run, 'guard', 'The PayPal order did not match the cart mandate. The hold was released.');
        return { status: 422, body: { error: 'order_mismatch', reasons } };
      }
      store.transition(run, 'order_verified', 'guard', 'order_verified', { orderId: run.orderId });
    }

    const cap = await paypal.captureAuthorization(run.paypalAuthorizationId, `capture-${run.paypalAuthorizationId}`);
    const expected = centsToPayPal(authorization.totalUsdCents);
    if (cap.status !== 'COMPLETED' || cap.amount !== expected) {
      store.fail(run, 'paypal', `PayPal captured ${cap.amount} (${cap.status}); expected ${expected}.`);
      return { status: 422, body: { ...runView(run), error: 'capture_mismatch' } };
    }
    run.capture = cap;
    run.paidBy = 'agent';
    store.transition(run, 'captured', 'paypal', 'captured', { ...cap, paidBy: 'agent' });
    if (run.paypalCompleted) store.transition(run, 'settled', 'paypal', 'settled_by_webhook');
    return { status: 200, body: runView(run) };
  }

  app.post('/shop/api/capture', async (c) => {
    const { runId, orderId } = z.object({ runId: z.string(), orderId: z.string() }).parse(await c.req.json());
    const run = store.get(runId);
    if (!run) return c.json({ error: 'run_expired' }, 404);
    if (run.orderId !== orderId) return c.json({ error: 'unknown_order' }, 400);
    if (run.state === 'captured' || run.state === 'settled') return c.json(runView(run));
    store.require(run, 'order_verified');

    const cap = await paypal.captureOrder(orderId);
    const expected = centsToPayPal(run.authorization!.totalUsdCents);
    if (cap.status !== 'COMPLETED' || cap.amount !== expected) {
      store.fail(run, 'paypal', `PayPal captured ${cap.amount} (${cap.status}); expected ${expected}.`);
      return c.json({ ...runView(run), error: 'capture_mismatch' }, 422);
    }
    run.capture = cap;
    run.paidBy = 'buyer';
    store.transition(run, 'captured', 'paypal', 'captured', cap);
    // PayPal's webhook can beat this request; settle now if it already arrived.
    if (run.paypalCompleted) store.transition(run, 'settled', 'paypal', 'settled_by_webhook');
    return c.json(runView(run));
  });

  app.post('/api/paypal/webhook', async (c) => {
    const raw = await c.req.text();
    const headers: Record<string, string> = {};
    c.req.raw.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
    if (!(await paypal.verifyWebhook(headers, raw))) return c.json({ error: 'unverified' }, 400);
    const event = JSON.parse(raw) as { event_type?: string; resource?: { invoice_id?: string } };
    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED' && event.resource?.invoice_id) {
      const run = store.findByAuthorization(event.resource.invoice_id);
      if (run?.state === 'captured') store.transition(run, 'settled', 'paypal', 'settled_by_webhook');
      else if (run?.state === 'order_verified') run.paypalCompleted = true;
    }
    return c.json({ ok: true });
  });

  app.get('/api/config', (c) => c.json({ paypalClientId: deps.paypalConfig.clientId, paypalMode: deps.paypalConfig.mode, inrPerUsd: INR_PER_USD }));

  return app;
}
