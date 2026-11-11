import type { PayPalOrderView } from '@faircart/guard';

/** The Orders v2 request body DemoMart sends. */
export interface OrderBody {
  intent: 'CAPTURE';
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

/** The PayPal operations DemoMart and FairCart's order check need. */
export interface PayPal {
  createOrder(body: OrderBody, requestId: string): Promise<{ id: string; status: string }>;
  getOrder(id: string): Promise<PayPalOrderView & { status: string }>;
  captureOrder(id: string): Promise<Capture>;
  verifyWebhook(headers: Record<string, string>, rawBody: string): Promise<boolean>;
}

export interface PayPalConfig {
  clientId: string;
  mode: 'mock' | 'sandbox';
}
