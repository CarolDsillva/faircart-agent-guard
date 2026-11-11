import type { ListingCard, Stage } from '@faircart/schemas';
import { addPageWideFacts, productFromJsonLd, stageFromUrl } from './common';
import { emptyExtraction, type Extraction, type RefRegistry, type SiteAdapter } from './types';
import { cleanText, isVisible, parseQuantity, parseRupees, styleOf, text } from './util';

/**
 * Flipkart adapter. Flipkart's class names are generated and change often, so
 * this adapter relies on JSON-LD (verified 2026-10-24: Product with sku = FSN,
 * brand, color, offers.price, availability, condition, shipping rate), the
 * `pid` URL parameter, `[data-id]` result cards and visual cues (line-through
 * for MRP, largest ₹ figure for the selling price).
 */

function stageOf(url: URL, doc: Document): Stage {
  if (url.pathname.includes('/p/itm') || url.searchParams.has('pid')) return 'product';
  if (url.pathname.startsWith('/search') || doc.querySelector('[data-id] a[href*="/p/itm"]')) {
    if (!/viewcart|checkout/.test(url.pathname)) return 'listing';
  }
  if (url.pathname.startsWith('/viewcart')) return 'cart';
  return stageFromUrl(url) ?? 'unknown';
}

/** Leaf elements whose whole text is a single rupee amount. */
function rupeeLeaves(root: ParentNode): Element[] {
  return [...root.querySelectorAll('div, span')].filter((e) => e.children.length === 0 && /^₹\s*[\d,]+(\.\d+)?$/.test(cleanText(e.textContent)));
}

function isStruck(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  for (let cur: Element | null = el; cur && cur !== el.ownerDocument.body; cur = cur.parentElement) {
    if (cur.tagName === 'S' || cur.tagName === 'DEL') return true;
    const cs = view?.getComputedStyle(cur);
    if (cs && (cs.textDecorationLine?.includes('line-through') || cs.textDecoration?.includes('line-through'))) return true;
  }
  return false;
}

function extractProduct(doc: Document, url: URL, refs: RefRegistry, x: Extraction) {
  const ld = productFromJsonLd(doc);
  const pid = url.searchParams.get('pid') ?? ld.retailerSku ?? null;
  const title = ld.title || text(doc.querySelector('h1')).replace(/\.\.\.more$/, '');
  if (!pid || !title) {
    x.gaps.push('Product id or title not found.');
    return;
  }
  // Selling price: the ₹ figure matching JSON-LD, else the largest visible one.
  const leaves = rupeeLeaves(doc.querySelector('main') ?? doc.body).filter((e) => isVisible(e) && !isStruck(e));
  const fontSize = (e: Element) => parseFloat(e.ownerDocument.defaultView?.getComputedStyle(e).fontSize ?? '0') || 0;
  const priceEl = (ld.price ? leaves.find((e) => parseRupees(e.textContent) === ld.price) : undefined) ?? [...leaves].sort((a, b) => fontSize(b) - fontSize(a))[0];
  const price = ld.price ?? (priceEl ? parseRupees(priceEl.textContent) : null);
  // MRP: a struck figure in the price's own block. Flipkart renders it without the ₹ sign
  // (verified 2026-10-24: "3,490" with line-through beside "₹799"). Carousels lower on the page
  // also contain struck prices, so the search stays within 4 levels of the price element.
  let mrpEl: Element | undefined;
  if (priceEl) {
    let block: Element | null = priceEl.parentElement;
    for (let i = 0; block && i < 4 && !mrpEl; i++, block = block.parentElement) {
      mrpEl = [...block.querySelectorAll('div, span, s, del')].find(
        (e) => e !== priceEl && e.children.length === 0 && /^₹?\s*[\d,]+(\.\d+)?$/.test(cleanText(e.textContent)) && isStruck(e),
      );
    }
  }
  const mrp = mrpEl ? Number(cleanText(mrpEl.textContent).replace(/[₹,\s]/g, '')) || null : null;

  x.product = {
    title,
    brand: ld.brand,
    model: ld.model,
    mpn: ld.mpn,
    gtin: ld.gtin,
    retailerSku: pid,
    variant: ld.color ? { colour: ld.color } : {},
    variantLabel: ld.color,
    condition: ld.condition ?? 'unknown',
    ...(ld.quantity ? { quantity: ld.quantity } : {}),
  };
  if (price !== null) x.prices.push({ kind: 'listed', amount: price, label: 'Price', ...(priceEl ? { elRef: refs.tag(priceEl, 'price') } : {}) });
  else x.gaps.push('No price found.');
  if (mrp !== null && price !== null && mrp > price) x.prices.push({ kind: 'reference', amount: mrp, label: 'MRP', elRef: refs.tag(mrpEl!, 'mrp') });

  x.identity = {
    retailer: 'flipkart',
    retailerSku: pid,
    title,
    brand: ld.brand,
    model: ld.model,
    mpn: ld.mpn,
    gtin: ld.gtin,
    color: ld.color,
    variantLabel: ld.color,
    attributes: ld.color ? { colour: ld.color } : {},
    condition: ld.condition ?? 'unknown',
    quantity: ld.quantity ?? parseQuantity(title),
    url: `https://www.flipkart.com${url.pathname}?pid=${pid}`,
    price,
    mrp: mrp !== null && price !== null && mrp > price ? mrp : null,
    deliveryFee: ld.deliveryFee ?? null,
    availability: ld.availability ?? 'unknown',
  };
}

function extractListing(doc: Document, refs: RefRegistry, x: Extraction) {
  const seen = new Set<string>();
  const cards: ListingCard[] = [];
  for (const card of doc.querySelectorAll('[data-id]')) {
    const id = card.getAttribute('data-id');
    const link = card.querySelector('a[href*="/p/itm"]');
    if (!id || !link || seen.has(id)) continue;
    // Skip outer wrappers that contain several cards.
    if (card.querySelectorAll('[data-id]').length > 0) continue;
    seen.add(id);
    const leaves = rupeeLeaves(card);
    const priceEl = leaves.find((e) => !isStruck(e));
    const title = cleanText(link.getAttribute('title')) || cleanText(card.querySelector('img[alt]')?.getAttribute('alt')) || text(link).slice(0, 120);
    const label = [...card.querySelectorAll('div, span')].find((e) => e.children.length === 0 && /^(Ad|Sponsored)$/i.test(cleanText(e.textContent)) && isVisible(e));
    const ls = label ? styleOf(label) : undefined;
    const ts = link ? styleOf(link) : undefined;
    cards.push({
      id: `card-${id}`,
      retailerSku: id,
      title,
      price: priceEl ? parseRupees(priceEl.textContent) : null,
      // Flipkart's ad slots aren't identifiable from markup, so absence of a label is "unknown", never "unlabelled".
      sponsored: label ? 'labelled' : 'unknown',
      ...(ls ? { sponsoredLabelStyle: ls } : {}),
      ...(ts ? { cardTextStyle: ts } : {}),
      elRef: refs.tag(card, label ? 'sponsored' : 'card'),
    });
  }
  x.cards = cards;
  if (cards.length === 0) x.gaps.push('No search result cards recognised.');
}

export const flipkartAdapter: SiteAdapter = {
  id: 'flipkart',
  version: '2026.10.24',
  extract(doc, url, refs) {
    const stage = stageOf(url, doc);
    const x = emptyExtraction(this, 'flipkart', stage);
    if (stage === 'product') extractProduct(doc, url, refs, x);
    else if (stage === 'listing') extractListing(doc, refs, x);
    addPageWideFacts(x, doc, refs);
    x.readability = x.product || x.cards.length || x.bill ? (x.gaps.length ? 'partial' : 'full') : 'none';
    return x;
  },
};
