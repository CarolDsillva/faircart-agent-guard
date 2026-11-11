import { centsToPayPal } from '@faircart/money';
import type { Authorization } from './authz';
import type { Reason } from './guard';

/** The parts of a PayPal Orders v2 order FairCart checks. */
export interface PayPalOrderView {
  items: { name: string; quantity: string; unit_amount: { value: string } }[];
  total: string;
  currency: string;
}

/** Every item, amount and the currency must match the authorization exactly. */
export function compareOrder(authz: Authorization, order: PayPalOrderView): Reason[] {
  const problems: string[] = [];
  if (order.currency !== 'USD') problems.push(`currency is ${order.currency}, expected USD`);
  if (order.total !== centsToPayPal(authz.totalUsdCents)) problems.push(`total is ${order.total}, expected ${centsToPayPal(authz.totalUsdCents)}`);
  if (order.items.length !== authz.lines.length) problems.push(`${order.items.length} items, expected ${authz.lines.length}`);
  authz.lines.forEach((l, i) => {
    const it = order.items[i];
    if (!it) return;
    if (it.name !== l.label || it.quantity !== String(l.qty) || it.unit_amount.value !== centsToPayPal(l.usdCents)) {
      problems.push(`item ${i + 1} is "${it.name}" ×${it.quantity} at ${it.unit_amount.value}, expected "${l.label}" ×${l.qty} at ${centsToPayPal(l.usdCents)}`);
    }
  });
  return problems.map((p) => ({ code: 'PAYPAL_ORDER_MISMATCH', label: `PayPal order differs from what you approved: ${p}`, fixable: false }));
}
