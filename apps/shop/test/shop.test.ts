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
    expect(read('demomart', 'pay', trap).bill?.rows.filter((r) => r.kind === 'item')).toHaveLength(1);
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
