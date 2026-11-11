import type { Capture, OrderBody, PayPal } from './types';

/**
 * In-memory PayPal for tests and for running the demo without sandbox keys.
 * Idempotent on the request id, like the real API. Webhooks verify when the
 * signature header is the literal "mock". Vault approvals are simulated.
 */
export class MockPayPal implements PayPal {
  private orders = new Map<string, { body: OrderBody; status: string; authorizationId?: string }>();
  private byRequest = new Map<string, string>();
  private auths = new Map<string, { orderId: string; captured?: Capture }>();
  private tokens = 0;
  created = 0;
  captures = 0;
  voided = 0;
  lastOrder?: OrderBody;
  /** Test hook: change the order body before it is stored. */
  tamper?: (body: OrderBody) => OrderBody;

  async createOrder(body: OrderBody, requestId: string) {
    const existing = this.byRequest.get(requestId);
    if (existing) {
      const o = this.orders.get(existing)!;
      return { id: existing, status: o.status, ...(o.authorizationId ? { authorizationId: o.authorizationId } : {}) };
    }
    const id = `MOCK${String(++this.created).padStart(13, '0')}`;
    const stored = this.tamper ? this.tamper(structuredClone(body)) : body;
    this.lastOrder = stored;
    // Paying with a saved wallet needs no buyer approval: PayPal authorizes at once.
    const vaulted = !!body.payment_source?.paypal.vault_id && body.intent === 'AUTHORIZE';
    const authorizationId = vaulted ? `AUTH-${id}` : undefined;
    this.orders.set(id, { body: stored, status: vaulted ? 'COMPLETED' : 'CREATED', ...(authorizationId ? { authorizationId } : {}) });
    if (authorizationId) this.auths.set(authorizationId, { orderId: id });
    this.byRequest.set(requestId, id);
    return { id, status: vaulted ? 'COMPLETED' : 'CREATED', ...(authorizationId ? { authorizationId } : {}) };
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
    this.captures += 1;
    return { id: `CAP-${id}`, status: 'COMPLETED', amount: o.body.purchase_units[0]!.amount.value };
  }

  async createSetupToken(urls: { returnUrl: string }) {
    const id = `MOCKSETUP${++this.tokens}`;
    const sep = urls.returnUrl.includes('?') ? '&' : '?';
    return { id, approveUrl: `${urls.returnUrl}${sep}approval_token_id=${id}&simulated=1` };
  }

  async createPaymentToken(setupTokenId: string) {
    return { id: `MOCKTOKEN-${setupTokenId}` };
  }

  async authorizeOrder(orderId: string) {
    const o = this.orders.get(orderId);
    if (!o) throw new Error(`order ${orderId} not found`);
    o.authorizationId ??= `AUTH-${orderId}`;
    this.auths.set(o.authorizationId, { orderId });
    return { authorizationId: o.authorizationId, status: 'CREATED' };
  }

  async captureAuthorization(authorizationId: string): Promise<Capture> {
    const a = this.auths.get(authorizationId);
    if (!a) throw new Error(`authorization ${authorizationId} not found`);
    if (a.captured) return a.captured;
    this.captures += 1;
    const o = this.orders.get(a.orderId)!;
    a.captured = { id: `CAP-${a.orderId}`, status: 'COMPLETED', amount: o.body.purchase_units[0]!.amount.value };
    return a.captured;
  }

  async voidAuthorization() {
    this.voided += 1;
  }

  async verifyWebhook(headers: Record<string, string>) {
    return headers['paypal-transmission-sig'] === 'mock';
  }
}
