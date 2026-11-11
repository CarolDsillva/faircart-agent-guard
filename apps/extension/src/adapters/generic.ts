import type { RetailerId, Stage } from '@faircart/schemas';
import { extractActions } from './actions';
import { stageFromContent } from './choices';
import { addPageWideFacts, productFromJsonLd, stageFromUrl } from './common';
import { emptyExtraction, type SiteAdapter } from './types';
import { jsonLd, ldType, parseRupees } from './util';

/**
 * Generic adapter for enabled retailers without a site-specific adapter. It only
 * trusts structured data (JSON-LD, Open Graph product meta) for products, uses
 * the generic bill reader on cart/checkout, and never labels listing cards as
 * sponsored or unlabelled because it can't tell ad slots apart.
 */
export function genericAdapter(retailer: RetailerId): SiteAdapter {
  return {
    id: `generic:${retailer}`,
    version: '2026.10.24',
    extract(doc, url, refs) {
      const ld = productFromJsonLd(doc);
      const og = (p: string) => doc.querySelector(`meta[property="${p}"]`)?.getAttribute('content') ?? null;
      const ogPrice = parseRupees(`₹${og('product:price:amount') ?? og('og:price:amount') ?? ''}`);
      const isProduct = ld.found || og('og:type') === 'product' || ogPrice !== null;
      const hasList = jsonLd(doc).some((o) => ldType(o).includes('ItemList'));
      // URL first; then what the page offers (many quick-commerce carts live at "/" or "/s").
      const stage: Stage = stageFromUrl(url) ?? stageFromContent(doc.body) ?? (isProduct ? 'product' : hasList ? 'listing' : 'unknown');
      const x = emptyExtraction(this, retailer, stage);

      if (stage === 'product') {
        const title = ld.title || og('og:title') || doc.title;
        const sku = ld.retailerSku ?? url.pathname.split('/').filter(Boolean).pop() ?? url.pathname;
        const price = ld.price ?? ogPrice;
        x.product = {
          title,
          brand: ld.brand,
          model: ld.model,
          mpn: ld.mpn,
          gtin: ld.gtin,
          retailerSku: sku,
          variant: ld.color ? { colour: ld.color } : {},
          variantLabel: ld.color,
          condition: ld.condition ?? 'unknown',
          ...(ld.quantity ? { quantity: ld.quantity } : {}),
        };
        if (price !== null && price !== undefined) x.prices.push({ kind: 'listed', amount: price, label: 'Price' });
        else x.gaps.push('This site does not publish a machine-readable price on this page.');
        x.identity = {
          retailer,
          retailerSku: sku,
          title,
          brand: ld.brand,
          model: ld.model,
          mpn: ld.mpn,
          gtin: ld.gtin,
          color: ld.color,
          variantLabel: ld.color,
          attributes: ld.color ? { colour: ld.color } : {},
          condition: ld.condition ?? 'unknown',
          quantity: ld.quantity,
          url: `${url.origin}${url.pathname}`,
          price: price ?? null,
          mrp: null,
          deliveryFee: ld.deliveryFee ?? null,
          availability: ld.availability ?? 'unknown',
        };
      }
      addPageWideFacts(x, doc, refs);
      x.controls.push(...extractActions(doc, refs).filter((c) => !x.controls.some((o) => o.id === c.id)));
      x.readability = x.product || x.bill ? (x.gaps.length ? 'partial' : 'full') : 'none';
      if (x.readability === 'none') x.gaps.push('Limited support: FairCart found no structured product or bill data on this page.');
      return x;
    },
  };
}
