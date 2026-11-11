// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { extractPage, RefRegistry } from '../src/adapters';
import { extractActions } from '../src/adapters/actions';
import { renderView } from '../src/demo/shop';
import { retailerForUrl } from '../src/retailers';

describe('web shop retailers', () => {
  it('recognises the hosted DemoMart', () => {
    expect(retailerForUrl('http://localhost:5173/shop.html?view=item')?.name).toBe('FairCart demo shop');
    expect(retailerForUrl('https://faircart.onrender.com/shop?view=pay')?.name).toBe('FairCart demo shop');
  });
  it('recognises FairMart, the honest store', () => {
    expect(retailerForUrl('http://localhost:5173/shop.html?view=item&store=fairmart')?.name).toBe('FairMart (honest demo store)');
  });
  it('does not claim other pages on the same host', () => {
    expect(retailerForUrl('http://localhost:5173/index.html')).toBeUndefined();
  });
});

describe('extractActions', () => {
  function basket() {
    document.documentElement.innerHTML = `<head></head><body>${renderView('basket', { protection: true, pass: true })}</body>`;
    document.querySelector<HTMLElement>('.dm-modal')!.hidden = false;
  }

  it('turns visible links and buttons in the main region into controls with stable ids', () => {
    basket();
    const refs = new RefRegistry();
    const ids = extractActions(document, refs).map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['act:remove-freshness-protection', 'act:remove-demo-pass', 'act:proceed-to-checkout']));
    const one = extractActions(document, refs).find((c) => c.id === 'act:proceed-to-checkout')!;
    expect(one).toMatchObject({ kind: 'link', role: 'other', label: 'Proceed to checkout' });
    expect(refs.get(one.elRef!)?.textContent).toBe('Proceed to checkout');
  });

  it('leaves dialogs and the header out', () => {
    basket();
    const ids = extractActions(document, new RefRegistry()).map((c) => c.id);
    expect(ids.some((i) => i.includes('demo-pass-for') || i.includes('no-thanks'))).toBe(false);
    expect(ids).not.toContain('act:start-over');
  });

  it('feeds the generic adapter on the hosted shop', () => {
    basket();
    const x = extractPage(document, new URL('http://localhost:5173/shop.html?view=basket'), new RefRegistry())!;
    expect(x.controls.map((c) => c.id)).toContain('act:remove-demo-pass');
  });
});
