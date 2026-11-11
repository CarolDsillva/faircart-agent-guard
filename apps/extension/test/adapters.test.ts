// @vitest-environment jsdom
import { CORE, evaluate } from '@faircart/rules';
import { describe, expect, it } from 'vitest';
import { extractPage, RefRegistry, toSnapshot } from '../src/adapters';
import { readBill } from '../src/adapters/bill';
import { scanCues } from '../src/adapters/cues';
import { isSensitivePage } from '../src/adapters/gate';

/**
 * Synthetic pages that mirror structures measured on live amazon.in and
 * flipkart.com pages on 2026-10-24. Product names and prices are fictional.
 */

function page(html: string, url: string): { doc: Document; url: URL } {
  document.documentElement.innerHTML = `<head></head><body>${html}</body>`;
  return { doc: document, url: new URL(url) };
}

const AMAZON_PRODUCT = `
<div id="dp">
  <span id="productTitle"> Acme Buds Pro, 40H Battery, Bluetooth Earbuds (Jet Black) </span>
  <a id="bylineInfo">Visit the Acme Store</a>
  <input type="hidden" id="ASIN" value="B0TEST1234">
  <div id="corePriceDisplay_desktop_feature_div">
    <span class="a-price aok-align-center priceToPay apex-pricetopay-value"><span class="a-offscreen"> </span><span aria-hidden="true">₹799</span></span>
    <span class="a-price aok-align-center apex-pricetopay-value"><span class="a-offscreen">₹799.00</span></span>
    <span class="savingsPercentage">-77%</span>
    <span class="basisPrice">M.R.P.: <span class="a-price a-text-price apex-basisprice-value" data-a-strike="true"><span class="a-offscreen">₹3,490</span></span></span>
  </div>
  <div id="inline-twister-row-color_name">
    <span id="inline-twister-expanded-dimension-text-color_name">Jet Black</span>
    <ul><li data-asin="B0TEST1234"><style>/* Temporary CSS overrides */ .x{}</style>Jet Black ₹799</li><li data-asin="B0TEST9999">Blue ₹899</li></ul>
  </div>
  <div id="mir-layout-DELIVERY_BLOCK">FREE delivery Tuesday, 27 October.</div>
  <div id="availability"><span>In stock</span></div>
  <a id="sellerProfileTriggerId">Example Retail Pvt Ltd</a>
  <div id="mbb_feature_div">
    <label><input type="checkbox" id="mbb-offeringID-1"> 1 Year Extended Warranty for ₹79.00</label>
    <label><input type="checkbox" id="mbb-offeringID-2" checked> 2 Years Extended Warranty for ₹149.00</label>
  </div>
  <table><tr><th>Brand</th><td>Acme</td></tr><tr><th>Model Name</th><td>Buds Pro</td></tr><tr><th>Manufacturer Part Number</th><td>ACM-BP-01</td></tr></table>
  <div class="social-proofing-faceout"><span id="social-proofing-faceout-title-tk_bought"> <span class="a-text-bold">5K+ bought</span><span> in past month</span> </span></div>
</div>`;

const AMAZON_SEARCH = `
<div id="search">
  <div data-component-type="s-search-result" data-asin="B0AD000001" class="s-result-item AdHolder">
    <span class="puis-label-popover-default"><span>Sponsored</span></span>
    <h2><span>Brand X Atta 5kg</span></h2>
    <span class="a-price"><span class="a-offscreen">₹857</span></span>
  </div>
  <div data-component-type="s-search-result" data-asin="B0AD000002" class="s-result-item AdHolder">
    <h2><span>Brand Y Atta 5kg</span></h2>
    <span class="a-price"><span class="a-offscreen">₹656</span></span>
  </div>
  <div data-component-type="s-search-result" data-asin="B0ORG00003" class="s-result-item">
    <h2><span>Brand Z Atta 5kg</span></h2>
    <span class="a-price"><span class="a-offscreen">₹239</span></span>
    <span class="a-price a-text-price" data-a-strike="true"><span class="a-offscreen">₹399</span></span>
  </div>
</div>`;

const FLIPKART_PRODUCT = `
<script type="application/ld+json">[{"@context":"https://schema.org","@type":"Product","name":"Acme Buds Alpha, 35H Battery","sku":"ACCTEST0000001","color":"Jet Black","brand":{"@type":"Brand","name":"Acme"},"offers":{"@type":"Offer","price":799,"priceCurrency":"INR","availability":"https://schema.org/InStock","itemCondition":"https://schema.org/NewCondition","shippingDetails":{"@type":"OfferShippingDetails","shippingRate":{"@type":"MonetaryAmount","value":0,"currency":"INR"}}}}]</script>
<main>
  <h1>Acme Buds Alpha, 35H Battery...more</h1>
  <div><div><div style="text-decoration: line-through">3,490</div><div style="font-size:24px">₹799</div></div></div>
  <div><div style="text-decoration: line-through">₹5,990</div></div>
</main>`;

describe('Amazon adapter', () => {
  it('reads a product page: price, MRP, identity, variant, delivery, add-ons', () => {
    const { doc, url } = page(AMAZON_PRODUCT, 'https://www.amazon.in/Acme-Buds/dp/B0TEST1234/ref=sr_1_1');
    const x = extractPage(doc, url, new RefRegistry())!;
    expect(x.stage).toBe('product');
    expect(x.identity).toMatchObject({
      retailer: 'amazon_in',
      retailerSku: 'B0TEST1234',
      brand: 'Acme',
      model: 'Buds Pro',
      mpn: 'ACM-BP-01',
      color: 'Jet Black',
      price: 799,
      mrp: 3490,
      deliveryFee: 0,
      availability: 'in_stock',
      seller: 'Example Retail Pvt Ltd',
      url: 'https://www.amazon.in/dp/B0TEST1234',
    });
    expect(x.controls.filter((c) => c.role === 'variant_selector').map((c) => c.id)).toEqual(['var:B0TEST1234', 'var:B0TEST9999']);
    const addOns = x.controls.filter((c) => c.role === 'add_on');
    expect(addOns.map((c) => [c.paidAmount, c.checked])).toEqual([
      [79, false],
      [149, true],
    ]);
    // Live markup splits this phrase across spans (seen 2026-10-24).
    expect(x.cues.filter((c) => c.kind === 'social_proof').map((c) => c.value)).toEqual([5000]);
    // Labels must not include <style> contents.
    expect(x.controls.find((c) => c.id === 'var:B0TEST1234')!.label).toBe('Jet Black ₹799');
    expect(x.readability).toBe('full');
  });

  it('flags a pre-ticked warranty only when the shopper did not tick it', () => {
    const { doc, url } = page(AMAZON_PRODUCT, 'https://www.amazon.in/dp/B0TEST1234');
    const x = extractPage(doc, url, new RefRegistry())!;
    const snapshot = toSnapshot(x, { snapshotId: 's1', journeyId: 'j1', capturedAt: '2026-10-24T10:00:00Z' });
    expect(evaluate({ snapshot }, CORE).findings.map((f) => f.ruleId)).toEqual(['BASKET-02']);
    const tapped = evaluate({ snapshot, taps: [{ controlId: 'mbb-offeringID-2', action: 'tap', at: '2026-10-24T09:59:00Z' }] }, CORE);
    expect(tapped.findings).toHaveLength(0);
  });

  it('says why when there is no price', () => {
    const { doc, url } = page(AMAZON_PRODUCT.replace(/<div id="corePriceDisplay_desktop_feature_div">[\s\S]*?<\/div>\n  <div id="inline/, '<div id="inline'), 'https://www.amazon.in/dp/B0TEST1234');
    const x = extractPage(doc, url, new RefRegistry())!;
    expect(x.identity?.price).toBeNull();
    expect(x.gaps.join(' ')).toMatch(/delivery location/);
    expect(x.readability).toBe('partial');
  });

  it('reads search cards and their sponsored state without guessing', () => {
    const { doc, url } = page(AMAZON_SEARCH, 'https://www.amazon.in/s?k=atta+5+kg');
    const x = extractPage(doc, url, new RefRegistry())!;
    expect(x.stage).toBe('listing');
    expect(x.cards.map((c) => [c.retailerSku, c.price, c.sponsored])).toEqual([
      ['B0AD000001', 857, 'labelled'],
      ['B0AD000002', 656, 'unlabelled'],
      ['B0ORG00003', 239, 'no'],
    ]);
  });
});

describe('Flipkart adapter', () => {
  it('uses JSON-LD and finds the struck MRP next to the price, not in carousels', () => {
    const { doc, url } = page(FLIPKART_PRODUCT, 'https://www.flipkart.com/acme-buds/p/itm123?pid=ACCTEST0000001');
    const x = extractPage(doc, url, new RefRegistry())!;
    expect(x.identity).toMatchObject({ retailer: 'flipkart', retailerSku: 'ACCTEST0000001', brand: 'Acme', color: 'Jet Black', price: 799, mrp: 3490, deliveryFee: 0, condition: 'new' });
  });
  it('never marks Flipkart cards as unlabelled ads', () => {
    const html = `<div><div data-id="ACC1"><a href="/x/p/itm1" title="Acme Buds">Acme Buds</a><div>₹799</div></div><div data-id="ACC2"><a href="/y/p/itm2" title="Other Buds">Other</a><div>₹899</div><span>Ad</span></div></div>`;
    const { doc, url } = page(html, 'https://www.flipkart.com/search?q=buds');
    const x = extractPage(doc, url, new RefRegistry())!;
    expect(x.cards.map((c) => [c.retailerSku, c.price, c.sponsored])).toEqual([
      ['ACC1', 799, 'unknown'],
      ['ACC2', 899, 'labelled'],
    ]);
  });
});

describe('safety gate', () => {
  it('skips pages with password, OTP, card or UPI fields', () => {
    for (const field of ['<input type="password">', '<input autocomplete="one-time-code">', '<input name="cardNumber">', '<input placeholder="Enter UPI PIN">', '<iframe src="https://api.razorpay.com/x"></iframe>']) {
      const { doc, url } = page(`<span id="productTitle">X</span>${field}`, 'https://www.amazon.in/dp/B0TEST1234');
      expect(isSensitivePage(doc)).toBe(true);
      const x = extractPage(doc, url, new RefRegistry())!;
      expect(x.sensitive).toBe(true);
      expect(x.identity).toBeNull();
    }
  });
  it('does not trip on ordinary search boxes', () => {
    const { doc } = page('<input type="search" name="field-keywords"><input type="text" name="pincode">', 'https://www.amazon.in/');
    expect(isSensitivePage(doc)).toBe(false);
  });
  it('returns null for sites the user has not got a retailer for', () => {
    const { doc, url } = page('<p>hi</p>', 'https://example.com/');
    expect(extractPage(doc, url, new RefRegistry())).toBeNull();
  });
});

describe('bill reader (generic, quick commerce)', () => {
  const QC_BILL = `
  <div class="bill">
    <div class="row"><span>Item total</span><span>₹289</span></div>
    <div class="row"><span>Delivery pass (3 months)</span><span>₹99</span></div>
    <div class="row"><span>Delivery charge</span><span><s>₹30</s> FREE</span></div>
    <div class="row"><span>Handling charge</span><span>₹15</span></div>
    <div class="row"><span>Small cart fee</span><span>₹20</span></div>
    <div class="row"><span>Tip for your delivery partner</span><span>₹10</span></div>
    <div class="row"><span>Coupon discount</span><span>-₹25</span></div>
    <div class="row"><span>To pay</span><span>₹408</span></div>
  </div>`;

  it('itemises every line and checks the arithmetic', () => {
    const { doc } = page(QC_BILL, 'https://blinkit.com/checkout');
    const { bill, fees, lineItems } = readBill(doc.body, new RefRegistry());
    expect(bill!.rows.map((r) => [r.label, r.kind, r.amount])).toEqual([
      ['Item total', 'subtotal', 289],
      ['Delivery pass (3 months)', 'membership', 99],
      ['Delivery charge', 'fee', 0],
      ['Handling charge', 'fee', 15],
      ['Small cart fee', 'fee', 20],
      ['Tip for your delivery partner', 'fee', 10],
      ['Coupon discount', 'discount', -25],
      ['To pay', 'total', 408],
    ]);
    expect(bill!.computedTotal).toBe(408);
    expect(bill!.difference).toBe(0);
    expect(fees.map((f) => [f.kind, f.mandatory])).toEqual([
      ['delivery', null],
      ['handling', true],
      ['small_cart', true],
      ['tip', false],
    ]);
    expect(lineItems.map((l) => [l.itemType, l.amount])).toEqual([['membership', 99]]);
  });

  it('reports an unexplained difference instead of hiding it', () => {
    const { doc } = page(QC_BILL.replace('₹408', '₹420'), 'https://blinkit.com/checkout');
    expect(readBill(doc.body, new RefRegistry()).bill!.difference).toBe(12);
  });

  it('finds no bill on a page without a total', () => {
    const { doc } = page('<div><span>Delivery charge</span><span>₹30</span></div>', 'https://blinkit.com/cart');
    expect(readBill(doc.body, new RefRegistry()).bill).toBeNull();
  });
});

describe('cue scanner', () => {
  it('reads countdowns, stock and social proof without judging them', () => {
    const { doc } = page('<span>Deal ends in 02:15:30</span><span>Only 3 left in stock</span><span>2K+ bought in past month</span><span>Free delivery on orders above ₹199</span>', 'https://www.amazon.in/dp/B0TEST1234');
    const cues = scanCues(doc.body, new RefRegistry(), 'B0TEST1234');
    expect(cues.map((c) => [c.kind, c.value])).toEqual([
      ['countdown', 8130],
      ['stock', 3],
      ['social_proof', 2000],
    ]);
    expect(cues[0]!.offerRef).toBe('B0TEST1234');
  });
  it('recognises app-install gates and scareware', () => {
    const { doc } = page('<p>Download the app to unlock this price</p><p>Your phone is infected with a virus! Install cleaner now</p>', 'https://blinkit.com/');
    expect(scanCues(doc.body, new RefRegistry()).map((c) => c.kind)).toEqual(['gate', 'scareware']);
  });
});
