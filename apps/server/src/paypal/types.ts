import type { PayPalOrderView } from '@faircart/guard';

/** The Orders v2 request body DemoMart sends. */
export interface OrderBody {
  intent: 'CAPTURE' | 'AUTHORIZE';
  /** Human-not-present payment with a saved PayPal wallet (Vault v3 payment token). */
  payment_source?: { paypal: { vault_id: string } };
  purchase_units: {
    invoice_id: string;
    custom_id: string;
    description: string;
    amount: { currency_code: 'USD'; value: string; breakdown: { item_total: { currency_code: 'USD'; value: string } } };
    items: { name: string; quantity: string; unit_amount: { currency_code: 'USD'; value: string }; category: 'PHYSICAL_GOODS' }[];
  }[];
}

export interface Capture {
  id: string;
  status: string;
  amount: string;
}

/** The PayPal operations DemoMart, the agent wallet and FairCart's order check need. */
export interface PayPal {
  createOrder(body: OrderBody, requestId: string): Promise<{ id: string; status: string; authorizationId?: string }>;
  /** Vault v3: start saving the buyer's PayPal (they approve once at approveUrl). */
  createSetupToken(urls: { returnUrl: string; cancelUrl: string }, requestId: string): Promise<{ id: string; approveUrl: string }>;
  /** Vault v3: turn an approved setup token into a reusable payment token. */
  createPaymentToken(setupTokenId: string, requestId: string): Promise<{ id: string }>;
  /** Hold the money on an approved or vault-paid order (intent AUTHORIZE). */
  authorizeOrder(orderId: string, requestId: string): Promise<{ authorizationId: string; status: string }>;
  captureAuthorization(authorizationId: string, requestId: string): Promise<Capture>;
  voidAuthorization(authorizationId: string): Promise<void>;
  getOrder(id: string): Promise<PayPalOrderView & { status: string }>;
  captureOrder(id: string): Promise<Capture>;
  verifyWebhook(headers: Record<string, string>, rawBody: string): Promise<boolean>;
}

export interface PayPalConfig {
  clientId: string;
  mode: 'mock' | 'sandbox';
}
