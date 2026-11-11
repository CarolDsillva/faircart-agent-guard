// @vitest-environment jsdom
import { extractPage, RefRegistry } from '@faircart/adapters';
import { describe, expect, it } from 'vitest';
import { FLIGHT, initialState, renderView, SKYHOP_INJECTION, total, type ShopState, type View } from '../src/shop';

function read(view: View, s: ShopState, opts: { popup?: boolean } = {}) {
  document.documentElement.innerHTML = `<head></head><body>${renderView('skyhop', view, s)}</body>`;
  if (opts.popup) document.querySelector<HTMLElement>('.dm-modal')!.hidden = false;
  return extractPage(document, new URL(`http://localhost:5173/shop.html?view=${view}&store=skyhop`), new RefRegistry())!;
}

describe('SkyHop (flights)', () => {
  const trap = initialState('skyhop');

  it('charges ₹7,945 for a ₹5,849 fare once every extra is in', () => {
    expect(total('skyhop', trap, 'pay')).toBe(FLIGHT.fare + 349 + 899 + 449 + 399);
    expect(total('skyhop', trap, 'pay')).toBe(7945);
  });

  it('reads the fare page as a product with a pre-ticked insurance add-on, scarcity and a fare timer', () => {
    const x = read('item', trap);
    expect(x.stage).toBe('product');
    expect(x.identity).toMatchObject({ retailerSku: FLIGHT.sku, price: FLIGHT.fare });
    expect(x.controls.find((c) => c.id === 'insurance')).toMatchObject({ role: 'add_on', checked: true });
    expect(x.controls.map((c) => c.id)).toContain('act:book-now');
    expect(x.cues.map((c) => c.kind)).toEqual(expect.arrayContaining(['countdown', 'agent_directive']));
    expect(document.body.textContent).toContain(SKYHOP_INJECTION);
  });

  it('reads the trip review as a cart with every extra removable', () => {
    const x = read('basket', trap);
    expect(x.stage).toBe('cart');
    expect(x.controls.map((c) => c.id)).toEqual(expect.arrayContaining(['act:remove-travel-insurance', 'act:remove-flexi-pass', 'act:remove-seat-selection-fee', 'act:continue-to-payment']));
  });

  it('reads the payment page bill line by line, with the convenience fee appearing only now', () => {
    const x = read('pay', trap);
    expect(x.stage).toBe('checkout');
    expect(x.bill!.rows.map((r) => [r.label, r.amount, r.kind])).toEqual([
      ['Base fare', 5849, 'subtotal'],
      ['Travel insurance', 349, 'service'],
      ['Flexi Pass (date change)', 899, 'membership'],
      ['Seat selection fee (14C)', 449, 'fee'],
      ['Convenience fee', 399, 'fee'],
      ['Total amount', 7945, 'total'],
    ]);
    expect(x.bill!.difference).toBe(0);
    expect(read('basket', trap).bill!.rows.some((r) => r.label === 'Convenience fee')).toBe(false);
  });

  it('charges only the fare and the convenience fee once the extras are removed', () => {
    expect(total('skyhop', { ...trap, protection: false, pass: false, seat: false }, 'pay')).toBe(6248);
  });
});
