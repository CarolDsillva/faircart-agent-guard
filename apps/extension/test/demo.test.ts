// @vitest-environment jsdom
import { CORE, evaluate } from '@faircart/rules';
import { ScreenSnapshot, type TapEvent } from '@faircart/schemas';
import { describe, expect, it } from 'vitest';
import { extractPage, RefRegistry, toSnapshot } from '../src/adapters';
import { dismissControlFor } from '../src/adapters/cues';
import { renderView, total, type DemoState, type View } from '../src/demo/shop';
import { retailerForUrl } from '../src/retailers';
import { addSnapshot, addTap, type Journey } from '../src/store/journey';

/**
 * End to end on the demo shop: real generic adapter, real journey reducer,
 * real rule pack. Only the clock and the shopper's clicks are simulated.
 * (jsdom has no layout, so the prominence rule IFACE-01 can't fire here;
 * it needs real element sizes in Chrome.)
 */

let clock = Date.parse('2026-10-24T10:00:00Z');
const tick = (s: number) => new Date((clock += s * 1000)).toISOString();

function scan(view: View, state: DemoState, opts: { popup: boolean }) {
  document.documentElement.innerHTML = `<head></head><body>${renderView(view, state)}</body>`;
  if (opts.popup) document.querySelector<HTMLElement>('.dm-modal')!.hidden = false;
  const url = new URL(`chrome-extension://test-id/demo.html?view=${view}`);
  const x = extractPage(document, url, new RefRegistry())!;
  return { x, snap: ScreenSnapshot.parse(toSnapshot(x, { snapshotId: `s-${clock}`, journeyId: 'pending', capturedAt: tick(5) })) };
}

function run(journey: Journey | undefined, snap: ScreenSnapshot, pageId: string, taps: TapEvent[] = []) {
  let r = addSnapshot(journey, snap, pageId, () => 'j-demo');
  let j = r.journey;
  for (const t of taps) j = addTap(j, t);
  const result = evaluate({ snapshot: r.current, journey: r.earlier, taps: j.taps }, CORE);
  return { journey: j, ids: result.findings.map((f) => f.ruleId).sort(), result };
}

describe('demo shop, read by the generic adapter', () => {
  const fresh: DemoState = { protection: true, pass: true };

  it('is recognised as the labelled demo retailer, never a real one', () => {
    expect(retailerForUrl('chrome-extension://abc/demo.html?view=item')?.name).toBe('FairCart demo shop');
    expect(retailerForUrl('chrome-extension://abc/sidepanel.html')).toBeUndefined();
  });

  it('detects the stage of each page from its content', () => {
    expect(scan('item', fresh, { popup: false }).x.stage).toBe('product');
    expect(scan('basket', fresh, { popup: false }).x.stage).toBe('cart');
    expect(scan('pay', fresh, { popup: false }).x.stage).toBe('checkout');
  });

  it('walks the whole planted journey', () => {
    // 1. Product page, pop-up showing.
    const p1 = scan('item', fresh, { popup: true });
    let step = run(undefined, p1.snap, 'page-1');
    expect(step.ids).toEqual(['BASKET-02', 'SHAME-01']);
    expect(p1.x.identity).toMatchObject({ retailerSku: 'DEMO-ATTA-5KG', price: 289 });

    // Shopper dismisses the pop-up with its decline link.
    const decline = document.querySelector('[data-act="pass-no"]')!;
    const dismiss = dismissControlFor(decline)!;
    expect(dismiss).not.toBeNull();
    const dismissTap: TapEvent = { controlId: dismiss.promptId, action: 'dismiss', at: tick(2) };

    // 2. Reload: the countdown is back at 09:59. Earlier scan read it lower.
    const p1Lower = scan('item', fresh, { popup: false });
    p1Lower.snap.cues.find((c) => c.kind === 'countdown')!.value = 540;
    step = run(step.journey, p1Lower.snap, 'page-1', [dismissTap]);
    const p2 = scan('item', fresh, { popup: false });
    step = run(step.journey, p2.snap, 'page-2');
    expect(step.ids).toContain('URG-01');

    // 3. Basket: pass and protection appear without being chosen; pop-up back once.
    const basket = scan('basket', fresh, { popup: true });
    step = run(step.journey, basket.snap, 'page-3');
    expect(step.ids.filter((id) => id === 'BASKET-01')).toHaveLength(2);
    expect(step.ids).not.toContain('NAG-01');

    // 4. Payment: late fees, trick checkbox, pop-up back a second time, unexplained ₹10.
    const pay = scan('pay', fresh, { popup: true });
    step = run(step.journey, pay.snap, 'page-4');
    expect(step.ids).toEqual(['BASKET-01', 'BASKET-01', 'DRIP-02', 'DRIP-02', 'NAG-01', 'SHAME-01', 'TRICK-01']);
    const drips = step.result.findings.filter((f) => f.ruleId === 'DRIP-02').map((f) => f.summary);
    expect(drips.join(' ')).toMatch(/Handling charge/);
    expect(drips.join(' ')).toMatch(/Platform fee/);
    expect(pay.x.bill!.displayedTotal).toBe(total(fresh, 'pay'));
    expect(pay.x.bill!.difference).toBe(10);
  });

  it('stops flagging what the shopper removed or chose themselves', () => {
    const p1 = scan('item', { protection: true, pass: true }, { popup: false });
    const protect = p1.snap.controls.find((c) => c.role === 'add_on')!;
    const chose = run(undefined, p1.snap, 'page-1', [{ controlId: protect.id, action: 'tap', at: tick(1) }]);
    expect(chose.ids).not.toContain('BASKET-02');

    const cleaned = scan('basket', { protection: false, pass: false }, { popup: false });
    expect(run(chose.journey, cleaned.snap, 'page-2').ids).toEqual([]);
  });

  it('makes no price-history or accusation claims on a page with nothing planted', () => {
    const quiet = scan('basket', { protection: false, pass: false }, { popup: false });
    const r = evaluate({ snapshot: quiet.snap }, CORE);
    expect(r.findings).toEqual([]);
  });
});
