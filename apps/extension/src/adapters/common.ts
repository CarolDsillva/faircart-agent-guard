import type { Stage } from '@faircart/schemas';
import { readAddOnControls, readBill } from './bill';
import { readChoicePairs } from './choices';
import { scanCues } from './cues';
import type { Extraction, ProductIdentity, RefRegistry } from './types';
import { jsonLd, ldType, parseQuantity } from './util';

/** Fills cues, add-on controls and (on cart/checkout) the bill. Shared by all adapters. */
export function addPageWideFacts(x: Extraction, doc: Document, refs: RefRegistry, root: ParentNode = doc.body): Extraction {
  x.cues = scanCues(root, refs, x.product?.retailerSku);
  x.controls.push(...readAddOnControls(root, refs).filter((c) => !x.controls.some((o) => o.id === c.id)));
  // Upsell prompts are often appended to <body>, outside an adapter's main region.
  x.controls.push(...readChoicePairs(doc.body, refs).filter((c) => !x.controls.some((o) => o.id === c.id)));
  if (x.stage === 'cart' || x.stage === 'checkout') {
    const { bill, fees, lineItems } = readBill(root, refs);
    x.bill = bill;
    x.fees.push(...fees);
    x.lineItems.push(...lineItems.filter((li) => !x.lineItems.some((o) => o.id === li.id)));
    if (x.total === null && bill) x.total = bill.displayedTotal;
    if (!bill) x.gaps.push('No order summary with a total was found on this page.');
    else if (bill.unreadable.length) x.gaps.push(`Could not read the amount for: ${bill.unreadable.join(', ')}.`);
  }
  return x;
}

/** Product facts from schema.org JSON-LD, which many Indian retailers publish. */
export function productFromJsonLd(doc: Document): Partial<ProductIdentity> & { found: boolean } {
  const p = jsonLd(doc).find((o) => ldType(o).includes('Product'));
  if (!p) return { found: false };
  const offers = (Array.isArray(p.offers) ? p.offers[0] : p.offers) as Record<string, unknown> | undefined;
  const brand = p.brand as { name?: string } | string | undefined;
  const price = offers ? Number(offers.price ?? offers.lowPrice) : NaN;
  const ship = (offers?.shippingDetails as { shippingRate?: { value?: unknown } } | undefined)?.shippingRate?.value;
  const avail = String(offers?.availability ?? '');
  const cond = String(offers?.itemCondition ?? '');
  const name = typeof p.name === 'string' ? p.name : '';
  return {
    found: true,
    title: name,
    brand: typeof brand === 'string' ? brand : brand?.name,
    retailerSku: p.sku ? String(p.sku) : undefined,
    gtin: [p.gtin13, p.gtin, p.gtin12, p.gtin14, p.gtin8].find((g) => g) as string | undefined,
    mpn: p.mpn ? String(p.mpn) : undefined,
    model: typeof p.model === 'string' ? p.model : undefined,
    color: typeof p.color === 'string' ? p.color : undefined,
    price: Number.isFinite(price) && price > 0 ? price : null,
    deliveryFee: ship !== undefined && Number.isFinite(Number(ship)) ? Number(ship) : null,
    availability: /InStock/i.test(avail) ? 'in_stock' : /OutOfStock|SoldOut/i.test(avail) ? 'out_of_stock' : 'unknown',
    condition: /Refurbished/i.test(cond) ? 'refurbished' : /Used/i.test(cond) ? 'used' : /New/i.test(cond) ? 'new' : 'unknown',
    quantity: parseQuantity(name),
  };
}

export function stageFromUrl(url: URL): Stage | null {
  const p = `${url.pathname}${url.search}`.toLowerCase();
  if (/(payment|pay-select|payselect|\/pay\b)/.test(p)) return 'checkout';
  if (/(checkout|place-?order|\/buy\/|order-?summary)/.test(p)) return 'checkout';
  if (/(\/cart|viewcart|\/basket|\/bag\b)/.test(p)) return 'cart';
  if (/(membership|\/pass\b|\/plus\b|subscription)/.test(p)) return 'membership';
  if (/(\/account|your-account|\/profile|\/settings)/.test(p)) return 'account';
  return null;
}
