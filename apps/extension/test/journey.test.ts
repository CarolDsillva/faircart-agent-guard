import { CORE, evaluate } from '@faircart/rules';
import { ScreenSnapshot } from '@faircart/schemas';
import { describe, expect, it } from 'vitest';
import { RETAILERS, matchPattern, retailerForUrl } from '../src/retailers';
import { addSnapshot, addTap, IDLE_RESET_MS, MAX_SNAPSHOTS, stripForJourney, type Journey } from '../src/store/journey';

let n = 0;
const snap = (stage: string, at: string, extra: Record<string, unknown> = {}, platform = 'blinkit') =>
  ScreenSnapshot.parse({ schemaVersion: 1, snapshotId: `s${++n}`, journeyId: 'pending', platform, surface: 'web', stage, capturedAt: at, adapterId: 't', adapterVersion: '1', readability: 'full', ...extra });
const ids = () => `j${++n}`;

describe('journey reducer', () => {
  it('appends new pages and replaces re-scans of the same page', () => {
    let j: Journey | undefined;
    ({ journey: j } = addSnapshot(j, snap('product', '2026-10-24T10:00:00Z'), 'p1', ids));
    ({ journey: j } = addSnapshot(j, snap('product', '2026-10-24T10:00:05Z'), 'p1', ids));
    expect(j.snapshots).toHaveLength(1);
    const r = addSnapshot(j, snap('cart', '2026-10-24T10:01:00Z'), 'p2', ids);
    expect(r.journey.snapshots.map((s) => s.stage)).toEqual(['product', 'cart']);
    expect(r.earlier.map((s) => s.stage)).toEqual(['product']);
    expect(r.journey.snapshots.every((s) => s.journeyId === r.journey.id)).toBe(true);
  });

  it('starts a new journey on retailer change or after two idle hours', () => {
    const a = addSnapshot(undefined, snap('cart', '2026-10-24T10:00:00Z'), 'p1', ids).journey;
    expect(addSnapshot(a, snap('cart', '2026-10-24T10:05:00Z', {}, 'zepto'), 'p2', ids).journey.id).not.toBe(a.id);
    const later = new Date(Date.parse('2026-10-24T10:00:00Z') + IDLE_RESET_MS + 1000).toISOString();
    expect(addSnapshot(a, snap('cart', later), 'p2', ids).journey.id).not.toBe(a.id);
    expect(addSnapshot(a, snap('checkout', '2026-10-24T10:30:00Z'), 'p2', ids).journey.id).toBe(a.id);
  });

  it('caps stored snapshots and strips element refs and long text', () => {
    let j: Journey | undefined;
    for (let i = 0; i < MAX_SNAPSHOTS + 5; i++) j = addSnapshot(j, snap('listing', `2026-10-24T10:${String(i).padStart(2, '0')}:00Z`), `p${i}`, ids).journey;
    expect(j!.snapshots).toHaveLength(MAX_SNAPSHOTS);
    const s = stripForJourney(snap('cart', '2026-10-24T10:00:00Z', { fees: [{ id: 'f', kind: 'handling', amount: 15, label: 'x'.repeat(500), elRef: 'fc-9' }] }));
    expect(JSON.stringify(s)).not.toContain('fc-9');
    expect(s.fees[0]!.label).toHaveLength(200);
  });

  it('feeds the engine: a fee that appears only at checkout across a real journey', () => {
    let j: Journey | undefined;
    const steps: [string, Record<string, unknown>][] = [
      ['product', { product: { title: 'Atta 5 kg', retailerSku: 'SKU' }, prices: [{ kind: 'listed', amount: 289 }] }],
      ['cart', { fees: [{ id: 'd', kind: 'delivery', amount: 30, label: 'Delivery', mandatory: true }] }],
      ['checkout', { fees: [{ id: 'd', kind: 'delivery', amount: 30, label: 'Delivery', mandatory: true }, { id: 'h', kind: 'handling', amount: 15, label: 'Handling charge', mandatory: true }] }],
    ];
    let last;
    for (const [i, [stage, extra]] of steps.entries()) {
      const s = snap(stage, `2026-10-24T10:0${i}:00Z`, extra);
      const r = addSnapshot(j, s, `p${i}`, ids);
      j = r.journey;
      last = evaluate({ snapshot: { ...s, journeyId: j.id }, journey: r.earlier, taps: j.taps }, CORE);
    }
    expect(last!.findings.map((f) => f.ruleId)).toEqual(['DRIP-02']);
  });

  it('records taps for the tap ledger', () => {
    const j = addSnapshot(undefined, snap('cart', '2026-10-24T10:00:00Z'), 'p1', ids).journey;
    expect(addTap(j, { controlId: 'chk', action: 'tap', at: '2026-10-24T10:00:01Z' }).taps).toHaveLength(1);
  });
});

describe('retailer registry', () => {
  it('maps URLs to retailers, including path-scoped Instamart', () => {
    expect(retailerForUrl('https://www.amazon.in/dp/B0TEST1234')?.id).toBe('amazon_in');
    expect(retailerForUrl('https://www.flipkart.com/search?q=x')?.id).toBe('flipkart');
    expect(retailerForUrl('https://www.swiggy.com/instamart/item/1')?.id).toBe('swiggy_instamart');
    expect(retailerForUrl('https://www.swiggy.com/restaurants/abc')).toBeUndefined();
    expect(retailerForUrl('https://example.com/')).toBeUndefined();
  });
  it('lists app-only services as not supported, with no origins to request', () => {
    const fm = RETAILERS.find((r) => r.id === 'flipkart_minutes')!;
    expect(fm.support).toBe('not_supported');
    expect(fm.origins).toEqual([]);
  });
  it('requests only https origins', () => {
    for (const r of RETAILERS) for (const o of r.origins) expect(o.startsWith('https://')).toBe(true);
    expect(matchPattern('https://www.amazon.in/*', new URL('http://www.amazon.in/'))).toBe(false);
  });
});
