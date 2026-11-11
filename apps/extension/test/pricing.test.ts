import { describe, expect, it } from 'vitest';
import type { ProductIdentity } from '../src/adapters/types';
import { computeHistory, shouldRecord, type Observation } from '../src/pricing/history';
import { effectiveTotal, matchProducts, rankOffers, searchQuery } from '../src/pricing/match';

const NOW = new Date('2026-10-24T12:00:00Z');
const day = (n: number, price: number, mrp: number | null = 3490): Observation => ({
  at: new Date(NOW.getTime() - n * 86_400_000).toISOString(),
  price,
  mrp,
  source: 'device',
});

describe('price history', () => {
  it('has no history before the first observation', () => {
    const h = computeHistory([], NOW);
    expect(h.count).toBe(0);
    expect(h.message).toMatch(/not recorded/);
  });

  it('never calls a single observation a historical low', () => {
    const h = computeHistory([day(0, 799)], NOW);
    expect(h.full30).toBe(false);
    expect(h.low30).toBeNull();
    expect(h.lowestSeen).toBe(799);
    expect(h.message).toMatch(/seen this price once/);
  });

  it('reports incomplete history honestly: "Tracking began 4 days ago"', () => {
    const h = computeHistory([day(4, 899), day(2, 849), day(0, 799)], NOW);
    expect(h.full30).toBe(false);
    expect(h.low30).toBeNull();
    expect(h.message).toBe('Tracking began 4 days ago. A full 30-day low is not available yet.');
    expect(h.discountCheck).toBe('insufficient_data');
  });

  it('gives a real 30-day low with full, regular coverage', () => {
    const obs = Array.from({ length: 16 }, (_, i) => day(32 - i * 2, i === 5 ? 699 : 899)).concat(day(0, 799));
    const h = computeHistory(obs, NOW);
    expect(h.full30).toBe(true);
    expect(h.low30).toBe(699);
    expect(h.high30).toBe(899);
    expect(h.median30).not.toBeNull();
    expect(h.aboveLow).toBe(100);
    expect(h.discountCheck).toBe('supported');
  });

  it('withholds the 30-day low when there are long gaps', () => {
    const h = computeHistory([day(40, 899), day(20, 899), day(0, 799)], NOW);
    expect(h.trackingDays).toBeGreaterThan(30);
    expect(h.full30).toBe(false);
    expect(h.message).toMatch(/gaps longer than 3 days/);
  });

  it('flags a discount against a price it never sold at', () => {
    const obs = Array.from({ length: 17 }, (_, i) => day(32 - i * 2, 799));
    expect(computeHistory(obs, NOW).discountCheck).toBe('not_supported');
  });

  it('ignores demo observations in live history', () => {
    const h = computeHistory([{ ...day(1, 100), source: 'demo' }, day(0, 799)], NOW);
    expect(h.count).toBe(1);
    expect(h.lowestSeen).toBe(799);
  });

  it('records on price change or after 30 minutes, not on every reload', () => {
    const a = day(0, 799);
    expect(shouldRecord(undefined, a)).toBe(true);
    expect(shouldRecord(a, { ...a, at: new Date(NOW.getTime() + 5 * 60_000).toISOString() })).toBe(false);
    expect(shouldRecord(a, { ...a, price: 749 })).toBe(true);
    expect(shouldRecord(a, { ...a, at: new Date(NOW.getTime() + 31 * 60_000).toISOString() })).toBe(true);
  });
});

const base = (p: Partial<ProductIdentity>): ProductIdentity => ({
  retailer: 'amazon_in',
  retailerSku: 'A1',
  title: 'Acme Buds Pro Bluetooth Earbuds',
  attributes: {},
  condition: 'new',
  url: 'https://example.invalid',
  price: 799,
  mrp: null,
  deliveryFee: 0,
  availability: 'in_stock',
  ...p,
});

describe('product matching', () => {
  it('matches on GTIN', () => {
    expect(matchProducts(base({ gtin: '8901234567890' }), base({ retailer: 'flipkart', retailerSku: 'F1', gtin: '8901234567890', title: 'Totally different title' })).tier).toBe('exact');
  });
  it('rejects different brands even with similar titles', () => {
    expect(matchProducts(base({ brand: 'Acme' }), base({ retailer: 'flipkart', retailerSku: 'F1', brand: 'Zenith' })).tier).toBe('different');
  });
  it('separates variants (storage, colour, pack size)', () => {
    const a = base({ brand: 'Acme', model: 'Phone 12', title: 'Acme Phone 12 (128 GB, Black)', color: 'Black' });
    const b = base({ retailer: 'flipkart', retailerSku: 'F1', brand: 'Acme', model: 'Phone 12', title: 'Acme Phone 12 (256 GB, Black)', color: 'Black' });
    const r = matchProducts(a, b);
    expect(r.tier).toBe('variant_differs');
    expect(r.reasons.join(' ')).toMatch(/128gb vs 256gb/);
    const atta1 = base({ brand: 'Fortune', title: 'Fortune Chakki Atta 5 kg', quantity: { value: 5, unit: 'kg' } });
    const atta10 = base({ retailer: 'flipkart', retailerSku: 'F2', brand: 'Fortune', title: 'Fortune Chakki Atta 10 kg', quantity: { value: 10, unit: 'kg' } });
    expect(matchProducts(atta1, atta10).tier).toBe('variant_differs');
  });
  it('treats same model with matching variant as exact, and other seller as same model', () => {
    const a = base({ brand: 'Acme', model: 'Buds Pro', color: 'Jet Black' });
    expect(matchProducts(a, base({ retailer: 'flipkart', retailerSku: 'F1', brand: 'acme', model: 'Buds-Pro', color: 'jet black' })).tier).toBe('exact');
    expect(matchProducts({ ...a, seller: 'Seller A' }, base({ retailer: 'flipkart', retailerSku: 'F1', brand: 'Acme', model: 'Buds Pro', color: 'Jet Black', seller: 'Seller B' })).tier).toBe('same_model');
  });
  it('never calls a title-only match exact', () => {
    const r = matchProducts(base({ title: 'Acme Buds Pro Wireless Earbuds Black' }), base({ retailer: 'flipkart', retailerSku: 'F1', title: 'Acme Buds Pro Wireless Earbuds' }));
    expect(['substitute', 'same_model']).toContain(r.tier);
    expect(r.tier).not.toBe('exact');
  });
});

describe('effective totals and ranking', () => {
  it('does not treat unknown delivery as zero', () => {
    expect(effectiveTotal({ price: 500, deliveryFee: null })).toMatchObject({ amount: 500, complete: false });
    expect(effectiveTotal({ price: 500, deliveryFee: 40 })).toMatchObject({ amount: 540, complete: true });
    expect(effectiveTotal({ price: null, deliveryFee: 0 }).amount).toBeNull();
  });
  it('ranks complete totals first, then lower bounds, then unknown prices', () => {
    const offers = [
      { id: 'partial-cheap', total: effectiveTotal({ price: 450, deliveryFee: null }) },
      { id: 'complete', total: effectiveTotal({ price: 480, deliveryFee: 40 }) },
      { id: 'unknown', total: effectiveTotal({ price: null, deliveryFee: null }) },
      { id: 'complete-cheaper', total: effectiveTotal({ price: 499, deliveryFee: 0 }) },
    ];
    expect(rankOffers(offers).map((o) => o.id)).toEqual(['complete-cheaper', 'complete', 'partial-cheap', 'unknown']);
  });
  it('builds a search query from brand and model', () => {
    expect(searchQuery(base({ brand: 'Acme', model: 'Buds Pro' }))).toBe('Acme Buds Pro');
    expect(searchQuery(base({ title: 'Fortune Chakki Atta, 100% Atta', quantity: { value: 5, unit: 'kg' } }))).toBe('Fortune Chakki Atta 5 kg');
  });
});
