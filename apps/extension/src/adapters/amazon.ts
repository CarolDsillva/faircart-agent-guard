import type { ControlFact, ListingCard, Stage } from '@faircart/schemas';
import { addPageWideFacts, stageFromUrl } from './common';
import { emptyExtraction, type Extraction, type RefRegistry, type SiteAdapter } from './types';
import { cleanText, isVisible, keyValues, parseQuantity, parseRupees, styleOf, text } from './util';

/**
 * Amazon India adapter. Selectors were checked against live amazon.in pages on
 * 2026-10-24 (search results, product page). Cart selectors use Amazon's
 * long-standing data-asin / data-price attributes with the generic bill reader
 * as a fallback.
 */
const ASIN_IN_PATH = /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/;

function stageOf(url: URL): Stage {
  if (ASIN_IN_PATH.test(url.pathname)) return 'product';
  if (url.pathname === '/s' || url.pathname.startsWith('/s/') || url.searchParams.has('k')) return 'listing';
  if (/\/gp\/cart|\/cart\b/.test(url.pathname)) return 'cart';
  return stageFromUrl(url) ?? 'unknown';
}

function firstPrice(doc: Document, selectors: string[]): { amount: number; el: Element } | null {
  for (const sel of selectors) {
    for (const el of doc.querySelectorAll(sel)) {
      const amount = parseRupees(el.textContent);
      if (amount !== null && amount > 0) return { amount, el: el.closest('.a-price') ?? el };
    }
  }
  return null;
}

function extractProduct(doc: Document, url: URL, refs: RefRegistry, x: Extraction) {
  const asin = (doc.querySelector<HTMLInputElement>('input#ASIN')?.value || ASIN_IN_PATH.exec(url.pathname)?.[1]) ?? null;
  const title = text(doc.querySelector('#productTitle'));
  if (!asin || !title) {
    x.gaps.push('Product title or ASIN not found.');
    return;
  }
  const kv = keyValues(doc);
  const price = firstPrice(doc, [
    '#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen',
    '#corePrice_feature_div .priceToPay .a-offscreen',
    '#corePriceDisplay_desktop_feature_div .apex-pricetopay-value .a-offscreen',
    '#corePrice_feature_div .a-price .a-offscreen',
    '#corePrice_desktop .a-price .a-offscreen',
  ]);
  const mrp = firstPrice(doc, [
    '#corePriceDisplay_desktop_feature_div .basisPrice .a-offscreen',
    '#corePriceDisplay_desktop_feature_div .apex-basisprice-value .a-offscreen',
    '#corePriceDisplay_desktop_feature_div .a-price[data-a-strike="true"] .a-offscreen',
    '#corePrice_desktop .a-price[data-a-strike="true"] .a-offscreen',
  ]);

  const byline = text(doc.querySelector('#bylineInfo'));
  const brand = kv['brand'] ?? kv['brand name'] ?? (/(?:Visit the|Brand:)\s*(.+?)(?:\s+Store)?$/i.exec(byline)?.[1] || undefined);
  const variant: Record<string, string> = {};
  for (const el of doc.querySelectorAll('[id^="inline-twister-expanded-dimension-text-"]')) {
    const dim = el.id.replace('inline-twister-expanded-dimension-text-', '').replace(/_name$/, '');
    variant[dim === 'color' ? 'colour' : dim] = text(el);
  }
  for (const el of doc.querySelectorAll('#twister .a-row .selection')) {
    const dim = cleanText(el.parentElement?.querySelector('label')?.textContent).replace(/:$/, '').toLowerCase();
    if (dim) variant[dim] = text(el);
  }
  const colour = variant['colour'] ?? kv['colour'] ?? kv['color'];
  const variantLabel = Object.values(variant).join(' / ') || undefined;

  // Variant selectors, so a shopper-chosen variant change is recorded in the tap ledger.
  const selectors: ControlFact[] = [];
  for (const li of doc.querySelectorAll('[id^="inline-twister-row-"] li[data-asin], #twister li[data-defaultasin]')) {
    const vAsin = li.getAttribute('data-asin') ?? li.getAttribute('data-defaultasin');
    if (!vAsin) continue;
    selectors.push({ id: `var:${vAsin}`, kind: 'radio', label: text(li).slice(0, 60), checked: vAsin === asin, role: 'variant_selector', elRef: refs.ref(li) });
  }

  const delivery = text(doc.querySelector('#mir-layout-DELIVERY_BLOCK, #deliveryBlockMessage'));
  const deliveryFee = /FREE delivery/i.test(delivery) ? 0 : parseRupees(/(₹\s*[\d,.]+)\s*delivery/i.exec(delivery)?.[1]);
  const seller = text(doc.querySelector('#sellerProfileTriggerId')) || /Sold by\s+(.+?)(?:\s+Sold by|$)/.exec(text(doc.querySelector('#merchantInfoFeature_feature_div, #merchant-info')))?.[1];
  const availability = text(doc.querySelector('#availability'));
  const qty = parseQuantity(kv['net quantity'] ?? '') ?? parseQuantity(title);

  x.product = {
    title,
    brand,
    model: kv['model name'] ?? kv['item model number'] ?? kv['model number'],
    mpn: kv['manufacturer part number'] ?? kv['item part number'],
    retailerSku: asin,
    variant,
    variantLabel,
    seller: seller || undefined,
    condition: 'new',
    ...(qty ? { quantity: qty } : {}),
  };
  if (price) x.prices.push({ kind: 'listed', amount: price.amount, label: 'Price', elRef: refs.tag(price.el, 'price') });
  else x.gaps.push('No price shown. Amazon may need a delivery location for this item.');
  if (mrp) x.prices.push({ kind: 'reference', amount: mrp.amount, label: 'M.R.P.', elRef: refs.tag(mrp.el, 'mrp') });
  x.controls.push(...selectors);

  // Warranty / protection add-ons offered on the product page.
  for (const input of doc.querySelectorAll<HTMLInputElement>('input[type="checkbox"][id^="mbb-offeringID"]')) {
    const label = text(input.closest('label') ?? input.parentElement);
    const amount = parseRupees(label);
    if (amount === null) continue;
    x.controls.push({ id: input.id, kind: 'checkbox', label, checked: input.checked, role: 'add_on', paidAmount: amount, elRef: refs.tag(input.closest('label') ?? input, 'addon') });
  }

  x.identity = {
    retailer: 'amazon_in',
    retailerSku: asin,
    title,
    brand,
    model: x.product.model,
    mpn: x.product.mpn,
    color: colour,
    variantLabel,
    attributes: variant,
    seller: x.product.seller,
    condition: 'new',
    quantity: qty,
    url: `https://www.amazon.in/dp/${asin}`,
    price: price?.amount ?? null,
    mrp: mrp?.amount ?? null,
    deliveryFee: deliveryFee ?? null,
    availability: /in stock/i.test(availability) ? 'in_stock' : /unavailable|out of stock/i.test(availability) ? 'out_of_stock' : 'unknown',
  };
}

function extractListing(doc: Document, refs: RefRegistry, x: Extraction) {
  const cards: ListingCard[] = [];
  for (const card of doc.querySelectorAll('div[data-component-type="s-search-result"][data-asin]')) {
    const asin = card.getAttribute('data-asin');
    if (!asin) continue;
    const title = text(card.querySelector('h2'));
    const priceEl = card.querySelector('.a-price:not(.a-text-price) .a-offscreen');
    const isAdSlot = card.classList.contains('AdHolder');
    const label = [...card.querySelectorAll('span, a')].find((e) => /^\s*Sponsored\s*$/i.test(e.textContent ?? '') && isVisible(e));
    const titleEl = card.querySelector('h2');
    const sponsored = isAdSlot ? (label ? 'labelled' : 'unlabelled') : label ? 'labelled' : 'no';
    const ls = label ? styleOf(label) : undefined;
    const ts = titleEl ? styleOf(titleEl) : undefined;
    cards.push({
      id: `card-${asin}`,
      retailerSku: asin,
      title,
      price: parseRupees(priceEl?.textContent),
      sponsored,
      ...(ls ? { sponsoredLabelStyle: ls } : {}),
      ...(ts ? { cardTextStyle: ts } : {}),
      elRef: refs.tag(card, sponsored === 'no' ? 'card' : 'sponsored'),
    });
  }
  x.cards = cards;
  if (cards.length === 0) x.gaps.push('No search result cards recognised.');
}

function extractCart(doc: Document, refs: RefRegistry, x: Extraction) {
  for (const item of doc.querySelectorAll('#sc-active-cart .sc-list-item[data-asin], [data-name="Active Items"] [data-asin]')) {
    const asin = item.getAttribute('data-asin');
    if (!asin) continue;
    const price = Number(item.getAttribute('data-price'));
    const qty = Number(item.getAttribute('data-quantity')) || 1;
    x.lineItems.push({
      id: `li-${asin}`,
      title: text(item.querySelector('.sc-product-title, .a-truncate-full')).slice(0, 120) || asin,
      quantity: qty,
      amount: Number.isFinite(price) && price > 0 ? price * qty : null,
      paid: true,
      itemType: 'product',
      origin: 'unknown',
      retailerSku: asin,
      elRef: refs.tag(item, 'price'),
    });
  }
  const sub = doc.querySelector('#sc-subtotal-amount-activecart, #sc-subtotal-amount-buybox');
  if (sub) x.total = parseRupees(sub.textContent);
}

export const amazonAdapter: SiteAdapter = {
  id: 'amazon_in',
  version: '2026.10.24',
  extract(doc, url, refs) {
    const stage = stageOf(url);
    const x = emptyExtraction(this, 'amazon_in', stage);
    if (stage === 'product') extractProduct(doc, url, refs, x);
    else if (stage === 'listing') extractListing(doc, refs, x);
    else if (stage === 'cart') extractCart(doc, refs, x);
    addPageWideFacts(x, doc, refs, doc.querySelector('#dp, #search, #sc-active-cart, #a-page') ?? doc.body);
    x.readability = x.product || x.cards.length || x.bill ? (x.gaps.length ? 'partial' : 'full') : stage === 'unknown' ? 'none' : 'partial';
    return x;
  },
};
