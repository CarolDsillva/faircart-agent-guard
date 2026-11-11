import { describe, expect, it } from 'vitest';
import { fromSdkOrder, toSdkOrder } from '../src/paypal/sdk';
import type { OrderBody } from '../src/paypal/types';

const body: OrderBody = {
  intent: 'AUTHORIZE',
  payment_source: { paypal: { vault_id: 'TOKEN123' } },
  purchase_units: [
    {
      invoice_id: 'authz-1',
      custom_id: 'run-1',
      description: 'DemoMart order',
      amount: { currency_code: 'USD', value: '3.55', breakdown: { item_total: { currency_code: 'USD', value: '3.55' } } },
      items: [
        { name: 'Sunrise Chakki Atta 5 kg', quantity: '1', unit_amount: { currency_code: 'USD', value: '3.28' }, category: 'PHYSICAL_GOODS' },
        { name: 'Handling charge', quantity: '1', unit_amount: { currency_code: 'USD', value: '0.17' }, category: 'PHYSICAL_GOODS' },
        { name: 'Platform fee', quantity: '1', unit_amount: { currency_code: 'USD', value: '0.10' }, category: 'PHYSICAL_GOODS' },
      ],
    },
  ],
};

describe('PayPal Server SDK mapping', () => {
  it('turns the order body into the SDK request model', () => {
    expect(toSdkOrder(body)).toEqual({
      intent: 'AUTHORIZE',
      paymentSource: { paypal: { vaultId: 'TOKEN123' } },
      purchaseUnits: [
        {
          invoiceId: 'authz-1',
          customId: 'run-1',
          description: 'DemoMart order',
          amount: { currencyCode: 'USD', value: '3.55', breakdown: { itemTotal: { currencyCode: 'USD', value: '3.55' } } },
          items: [
            { name: 'Sunrise Chakki Atta 5 kg', quantity: '1', unitAmount: { currencyCode: 'USD', value: '3.28' }, category: 'PHYSICAL_GOODS' },
            { name: 'Handling charge', quantity: '1', unitAmount: { currencyCode: 'USD', value: '0.17' }, category: 'PHYSICAL_GOODS' },
            { name: 'Platform fee', quantity: '1', unitAmount: { currencyCode: 'USD', value: '0.10' }, category: 'PHYSICAL_GOODS' },
          ],
        },
      ],
    });
  });

  it('leaves out the payment source for a buyer-approved order', () => {
    expect(toSdkOrder({ ...body, intent: 'CAPTURE', payment_source: undefined })).not.toHaveProperty('paymentSource');
  });

  it('reads an SDK order back into the view FairCart compares', () => {
    const sdkOrder = {
      id: 'ORDER1',
      status: 'COMPLETED',
      purchaseUnits: [
        {
          amount: { currencyCode: 'USD', value: '3.55' },
          items: [{ name: 'Sunrise Chakki Atta 5 kg', quantity: '1', unitAmount: { currencyCode: 'USD', value: '3.28' } }],
        },
      ],
    };
    expect(fromSdkOrder(sdkOrder as never)).toEqual({
      status: 'COMPLETED',
      currency: 'USD',
      total: '3.55',
      items: [{ name: 'Sunrise Chakki Atta 5 kg', quantity: '1', unit_amount: { value: '3.28' } }],
    });
  });
});
