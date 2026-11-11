import { compareOrder, verifyAuthorization, type Authorization } from '@faircart/guard';
import { centsToPayPal, INR_PER_USD } from '@faircart/money';
import { Hono } from 'hono';
import { z } from 'zod';
import type { PayPal, PayPalConfig, OrderBody } from '../paypal/types';
import type { RunStore } from '../runs';
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
export function orderBody(a: Authorization): OrderBody {
  const value = centsToPayPal(a.totalUsdCents);
  return {
    intent: 'CAPTURE',
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

  app.post('/shop/api/checkout', async (c) => {
    const { authorization } = z.object({ authorization: AuthorizationBody }).parse(await c.req.json());
    const ok = verifyAuthorization(authorization, deps.secret, deps.now(), { checkExpiry: true });
    if (!ok.ok) return c.json({ error: 'bad_authorization', reason: ok.reason }, 401);
    const run = store.get(authorization.runId);
    if (!run || run.authorization?.sig !== authorization.sig) return c.json({ error: 'bad_authorization', reason: 'unknown' }, 401);

    // A retry of the same authorization gets the same order: single use, idempotent.
    if (run.authzUsed && run.orderId) return c.json({ orderId: run.orderId, state: run.state });
    store.require(run, 'authorized');

    const created = await paypal.createOrder(orderBody(authorization), authorization.id);
    run.authzUsed = true;
    run.orderId = created.id;
    store.audit(run, 'merchant', 'order_created', { orderId: created.id });

    // FairCart reads the PayPal order itself before anyone approves it.
    const reasons = compareOrder(authorization, await paypal.getOrder(created.id));
    if (reasons.length) {
      run.lastGuard = reasons;
      store.fail(run, 'guard', 'The PayPal order did not match what you approved.');
      return c.json({ error: 'order_mismatch', reasons }, 422);
    }
    store.transition(run, 'order_verified', 'guard', 'order_verified', { orderId: created.id });
    return c.json({ orderId: created.id, state: run.state });
  });

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
    store.transition(run, 'captured', 'paypal', 'captured', cap);
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
    }
    return c.json({ ok: true });
  });

  app.get('/api/config', (c) => c.json({ paypalClientId: deps.paypalConfig.clientId, paypalMode: deps.paypalConfig.mode, inrPerUsd: INR_PER_USD }));

  return app;
}
