// @vitest-environment jsdom
import { extractPage, RefRegistry } from '@faircart/adapters';
import { describe, expect, it } from 'vitest';
import { INJECTION, initialState, renderView, total, type ShopState, type Store, type View } from '../src/shop';

function read(store: Store, view: View, s: ShopState, opts: { help?: boolean } = {}) {
  document.documentElement.innerHTML = `<head></head><body>${renderView(store, view, s)}</body>`;
  if (opts.help) document.querySelector<HTMLElement>('[data-help-panel]')!.hidden = false;
  const url = new URL(`http://localhost:5173/shop.html?view=${view}${store === 'fairmart' ? '&store=fairmart' : ''}`);
  return extractPage(document, url, new RefRegistry())!;
}

describe('DemoMart (web)', () => {
  const trap = initialState('demomart');

  it('charges ₹471 with every trap, ₹10 of it unexplained', () => {
    expect(total('demomart', trap, 'pay')).toBe(471);
    const x = read('demomart', 'pay', trap);
    expect(x.bill?.displayedTotal).toBe(471);
    expect(x.bill?.difference).toBe(10);
  });

  it('removes the unexplained ₹10 once the charge is disputed', () => {
    const x = read('demomart', 'pay', { ...trap, protection: false, pass: false, disputed: true });
    expect(x.bill?.displayedTotal).toBe(313);
    expect(x.bill?.difference).toBe(0);
  });

  it('offers the bill question link, and the dispute button only once it is opened', () => {
    const closed = read('demomart', 'pay', trap).controls.map((c) => c.id);
    expect(closed).toContain('act:question-about-your-bill');
    expect(closed).not.toContain('act:i-don-t-recognise-a-charge');
    expect(read('demomart', 'pay', trap, { help: true }).controls.map((c) => c.id)).toContain('act:i-don-t-recognise-a-charge');
  });

  it('puts text aimed at AI agents in the product description, and FairCart reads it as such', () => {
    const x = read('demomart', 'item', trap);
    expect(document.body.textContent).toContain(INJECTION);
    expect(x.cues.filter((c) => c.kind === 'agent_directive').map((c) => c.text)).toEqual([expect.stringContaining('AI shopping assistants')]);
  });

  it('has no guide text that the bill reader could mistake for a line', () => {
    const rows = read('demomart', 'pay', trap).bill!.rows;
    expect(rows.filter((r) => r.kind === 'item').every((r) => r.label.includes('Sunrise Chakki Atta 5 kg'))).toBe(true);
    expect(rows.map((r) => r.label)).toEqual(['Item total', 'Freshness protection (1 year)', 'Demo Pass (3 months)', 'Delivery charge', 'Handling charge', 'Platform fee', 'To pay']);
  });
});

describe('FairMart (web)', () => {
  const fair = initialState('fairmart');

  it('charges only the product, with nothing pre-ticked and no injection', () => {
    expect(total('fairmart', fair, 'pay')).toBe(289);
    const item = read('fairmart', 'item', fair);
    expect(item.controls.find((c) => c.id === 'protect')?.checked).toBe(false);
    expect(item.cues.filter((c) => c.kind === 'countdown')).toHaveLength(0);
    expect(item.cues.filter((c) => (c.kind as string) === 'agent_directive')).toHaveLength(0);
    expect(document.body.textContent).not.toContain(INJECTION);
    expect(read('fairmart', 'pay', fair).bill?.difference).toBe(0);
  });
});

describe('the catalogue', () => {
  it('stocks a real-looking range with unique SKUs, the atta unchanged', async () => {
    const { PRODUCTS, productBySku } = await import('../src/shop');
    expect(PRODUCTS.length).toBeGreaterThan(150);
    expect(new Set(PRODUCTS.map((p) => p.sku)).size).toBe(PRODUCTS.length);
    expect(productBySku('DEMO-ATTA-5KG')).toMatchObject({ title: 'Sunrise Chakki Atta 5 kg', price: 289, mrp: 420 });
  });

  it('lists products on the home page, each linking to its own product page', () => {
    document.documentElement.innerHTML = `<head></head><body>${renderView('demomart', 'home', initialState('demomart'), '', 'cleaning')}</body>`;
    const links = [...document.querySelectorAll<HTMLAnchorElement>('main a.pcard')].map((a) => a.getAttribute('href'));
    expect(links.length).toBe(18);
    expect(links.every((h) => /view=item&sku=CLE-/.test(h!))).toBe(true);
    expect(document.querySelector('.dm-modal')).toBeNull();
  });

  it('runs the same traps on any product, and the bill still adds up for FairCart', async () => {
    const { productBySku, protectionPrice } = await import('../src/shop');
    const p = productBySku('CLE-SPARKLE-FLOOR-CLEANER-1-L');
    const s = initialState('demomart', p.sku);
    expect(total('demomart', s, 'pay')).toBe(p.price + protectionPrice(p) + 99 + 15 + 9 + 10);
    const x = read('demomart', 'pay', s);
    expect(x.bill?.difference).toBe(10);
    expect(x.bill!.rows.map((r) => r.label)).toContain('Damage protection (1 year)');
    expect(x.bill!.rows.filter((r) => r.kind === 'item').every((r) => r.label.includes(p.title) || r.label === 'Item total')).toBe(true);
    const item = read('demomart', 'item', s);
    expect(item.controls.find((c) => c.id === 'protect')?.checked).toBe(true);
    expect(item.controls.some((c) => c.id.startsWith('act:') && /similar|sparkle|cleanhome/i.test(c.id))).toBe(false);
  });
});
