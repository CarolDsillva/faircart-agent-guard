import type { Capture, OrderBody, PayPal } from './types';

/**
 * In-memory PayPal for tests and for running the demo without sandbox keys.
 * Idempotent on the request id, like the real API. Webhooks verify when the
 * signature header is the literal "mock".
 */
export class MockPayPal implements PayPal {
  private orders = new Map<string, { body: OrderBody; status: string }>();
  private byRequest = new Map<string, string>();
  created = 0;
  /** Test hook: change the order body before it is stored. */
  tamper?: (body: OrderBody) => OrderBody;

  async createOrder(body: OrderBody, requestId: string) {
    const existing = this.byRequest.get(requestId);
    if (existing) return { id: existing, status: this.orders.get(existing)!.status };
    const id = `MOCK${String(++this.created).padStart(13, '0')}`;
    const stored = this.tamper ? this.tamper(structuredClone(body)) : body;
    this.orders.set(id, { body: stored, status: 'CREATED' });
    this.byRequest.set(requestId, id);
    return { id, status: 'CREATED' };
  }

  async getOrder(id: string) {
    const o = this.orders.get(id);
    if (!o) throw new Error(`order ${id} not found`);
    const pu = o.body.purchase_units[0]!;
    return { status: o.status, currency: pu.amount.currency_code, total: pu.amount.value, items: pu.items.map((i) => ({ name: i.name, quantity: i.quantity, unit_amount: { value: i.unit_amount.value } })) };
  }

  async captureOrder(id: string): Promise<Capture> {
    const o = this.orders.get(id);
    if (!o) throw new Error(`order ${id} not found`);
    o.status = 'COMPLETED';
    return { id: `CAP-${id}`, status: 'COMPLETED', amount: o.body.purchase_units[0]!.amount.value };
  }

  async verifyWebhook(headers: Record<string, string>) {
    return headers['paypal-transmission-sig'] === 'mock';
  }
}
