import type { ProductIdentity } from '../adapters/types';

/**
 * Identity ladder (architecture §Price intelligence). A similar-looking product
 * is never treated as an exact match; every tier carries the reason.
 */
export type MatchTier = 'exact' | 'same_model' | 'variant_differs' | 'substitute' | 'different';

export interface MatchResult {
  tier: MatchTier;
  confidence: number;
  reasons: string[];
}

const norm = (s: string | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const compact = (s: string | undefined) => norm(s).replace(/\s+/g, '');

const STOP = new Set(['with', 'for', 'and', 'the', 'new', 'latest', 'pack', 'of', 'in', 'by', 'mic', 'buy', 'online']);
function tokens(s: string): Set<string> {
  return new Set(norm(s).split(' ').filter((t) => t.length > 1 && !STOP.has(t)));
}
function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter || 1);
}

/** Storage-like and size-like attributes that must match for an exact product. */
function variantAxes(p: ProductIdentity): Record<string, string> {
  const out: Record<string, string> = {};
  const title = p.title;
  const storage = /(\d+)\s*(gb|tb)\b/gi;
  const caps = [...title.matchAll(storage)].map((m) => `${m[1]}${m[2]!.toLowerCase()}`);
  if (caps.length) out.storage = caps.join('+');
  if (p.color) out.colour = norm(p.color);
  if (p.quantity) out.quantity = `${normaliseQty(p.quantity.value, p.quantity.unit)}`;
  for (const [k, v] of Object.entries(p.attributes)) {
    if (/size|style|pattern|flavour|flavor/.test(k)) out[k] = norm(v);
  }
  return out;
}

function normaliseQty(value: number, unit: string): string {
  const u = unit.toLowerCase();
  if (u === 'kg') return `${value * 1000}g`;
  if (u === 'l') return `${value * 1000}ml`;
  if (u === 'tb') return `${value * 1024}gb`;
  return `${value}${u}`;
}

export function matchProducts(a: ProductIdentity, b: ProductIdentity): MatchResult {
  const reasons: string[] = [];
  if (a.retailer === b.retailer && a.retailerSku === b.retailerSku) {
    return { tier: 'exact', confidence: 1, reasons: ['Same listing at the same retailer.'] };
  }
  const brandA = compact(a.brand);
  const brandB = compact(b.brand);
  if (brandA && brandB && brandA !== brandB) {
    return { tier: 'different', confidence: 0.95, reasons: [`Different brands (${a.brand} vs ${b.brand}).`] };
  }

  const axesA = variantAxes(a);
  const axesB = variantAxes(b);
  const diffs = Object.keys(axesA).filter((k) => k in axesB && axesA[k] !== axesB[k]);
  const variantNote = diffs.map((k) => `${k}: ${axesA[k]} vs ${axesB[k]}`).join(', ');

  if (a.gtin && b.gtin) {
    if (a.gtin === b.gtin) return { tier: 'exact', confidence: 0.98, reasons: ['Same barcode (GTIN).'] };
    return { tier: diffs.length ? 'variant_differs' : 'different', confidence: 0.9, reasons: ['Different barcodes (GTIN).', ...(variantNote ? [variantNote] : [])] };
  }

  const modelA = compact(a.mpn) || compact(a.model);
  const modelB = compact(b.mpn) || compact(b.model);
  const sameModel = !!modelA && !!modelB && modelA === modelB;
  if (sameModel) reasons.push('Same brand and model number.');

  const sim = jaccard(tokens(a.title), tokens(b.title));
  if (diffs.length) {
    if (sameModel || sim >= 0.55) return { tier: 'variant_differs', confidence: 0.7, reasons: [...reasons, `Variant differs (${variantNote}).`] };
    return { tier: 'substitute', confidence: 0.4, reasons: [`Similar product, variant differs (${variantNote}).`] };
  }

  const sharedAxes = Object.keys(axesA).filter((k) => k in axesB);
  if (sameModel) {
    const sellerOrCondition = (a.condition !== 'unknown' && b.condition !== 'unknown' && a.condition !== b.condition) || (a.seller && b.seller && norm(a.seller) !== norm(b.seller));
    if (sellerOrCondition) return { tier: 'same_model', confidence: 0.8, reasons: [...reasons, 'Seller or condition differs.'] };
    return sharedAxes.length || (!Object.keys(axesA).length && !Object.keys(axesB).length)
      ? { tier: 'exact', confidence: 0.85, reasons: [...reasons, ...(sharedAxes.length ? ['Variant attributes match.'] : [])] }
      : { tier: 'same_model', confidence: 0.7, reasons: [...reasons, 'Variant could not be confirmed on both pages.'] };
  }

  if (sim >= 0.75 && brandA && brandA === brandB && sharedAxes.length) {
    return { tier: 'same_model', confidence: 0.55, reasons: ['Same brand, closely matching title and variant; no model number to confirm.'] };
  }
  if (sim >= 0.4 && (!brandA || !brandB || brandA === brandB)) {
    return { tier: 'substitute', confidence: Math.round(sim * 50) / 100, reasons: ['Similar title only. Treat as an alternative, not the same product.'] };
  }
  return { tier: 'different', confidence: 0.6, reasons: ['Titles do not match closely.'] };
}

export interface EffectiveTotal {
  /** null when the item price itself is unknown. */
  amount: number | null;
  /** False when any mandatory charge (e.g. delivery) is unknown: amount is then a lower bound. */
  complete: boolean;
  parts: { label: string; amount: number | null }[];
}

export function effectiveTotal(p: Pick<ProductIdentity, 'price' | 'deliveryFee'>): EffectiveTotal {
  const parts = [
    { label: 'Item', amount: p.price },
    { label: 'Delivery', amount: p.deliveryFee },
  ];
  if (p.price === null) return { amount: null, complete: false, parts };
  return { amount: p.price + (p.deliveryFee ?? 0), complete: p.deliveryFee !== null, parts };
}

/** Lowest complete total first; incomplete totals after all complete ones; unknown prices last. */
export function rankOffers<T extends { total: EffectiveTotal }>(offers: T[]): T[] {
  const key = (o: T) => (o.total.amount === null ? 2 : o.total.complete ? 0 : 1);
  return [...offers].sort((a, b) => key(a) - key(b) || (a.total.amount ?? 0) - (b.total.amount ?? 0));
}

/** Search text for user-mediated comparison: brand + model if known, else a trimmed title. */
export function searchQuery(p: ProductIdentity): string {
  const model = p.model && !norm(p.title).includes(norm(p.model)) ? ` ${p.model}` : '';
  const base = p.brand && p.model ? `${p.brand} ${p.model}` : `${p.title.split(/[,|(]/)[0]}${model}`;
  const qty = p.quantity ? ` ${p.quantity.value} ${p.quantity.unit}` : '';
  return cleanQuery(`${base}${qty}`);
}
const cleanQuery = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 80);
