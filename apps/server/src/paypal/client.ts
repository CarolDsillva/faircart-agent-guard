import type { Capture, OrderBody, PayPal } from './types';

const BASE = 'https://api-m.sandbox.paypal.com';

/** PayPal REST (sandbox): Orders v2 and webhook signature verification. */
export class PayPalRest implements PayPal {
  private token: { value: string; until: number } | null = null;

  constructor(private readonly cfg: { clientId: string; clientSecret: string; webhookId: string }) {}

  private async auth(): Promise<string> {
    if (this.token && Date.now() < this.token.until) return this.token.value;
    const res = await fetch(`${BASE}/v1/oauth2/token`, {
      method: 'POST',
      headers: { authorization: `Basic ${Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) throw new Error(`PayPal auth failed (${res.status})`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: j.access_token, until: Date.now() + (j.expires_in - 60) * 1000 };
    return j.access_token;
  }

  private async call<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { authorization: `Bearer ${await this.auth()}`, 'content-type': 'application/json', prefer: 'return=representation', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`PayPal ${method} ${path} failed (${res.status}): ${text.slice(0, 300)}`);
    return (text ? JSON.parse(text) : {}) as T;
  }

  async createOrder(body: OrderBody, requestId: string) {
    const r = await this.call<{ id: string; status: string }>('POST', '/v2/checkout/orders', body, { 'PayPal-Request-Id': requestId });
    return { id: r.id, status: r.status };
  }

  async getOrder(id: string) {
    type PU = { amount: { currency_code: string; value: string }; items?: { name: string; quantity: string; unit_amount: { value: string } }[] };
    const r = await this.call<{ status: string; purchase_units: PU[] }>('GET', `/v2/checkout/orders/${encodeURIComponent(id)}`);
    const pu = r.purchase_units[0]!;
    return { status: r.status, currency: pu.amount.currency_code, total: pu.amount.value, items: (pu.items ?? []).map((i) => ({ name: i.name, quantity: i.quantity, unit_amount: { value: i.unit_amount.value } })) };
  }

  async captureOrder(id: string): Promise<Capture> {
    type R = { status: string; purchase_units: { payments: { captures: { id: string; status: string; amount: { value: string } }[] } }[] };
    const r = await this.call<R>('POST', `/v2/checkout/orders/${encodeURIComponent(id)}/capture`, {}, { 'PayPal-Request-Id': `capture-${id}` });
    const c = r.purchase_units[0]?.payments.captures[0];
    if (!c) throw new Error('PayPal returned no capture');
    return { id: c.id, status: c.status, amount: c.amount.value };
  }

  async verifyWebhook(headers: Record<string, string>, rawBody: string) {
    if (!this.cfg.webhookId) return false;
    const r = await this.call<{ verification_status: string }>('POST', '/v1/notifications/verify-webhook-signature', {
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id: this.cfg.webhookId,
      webhook_event: JSON.parse(rawBody),
    });
    return r.verification_status === 'SUCCESS';
  }
}
