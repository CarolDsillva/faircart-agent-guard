/**
 * Builds fixtures/cases/*.json — synthetic, clearly labelled test screens.
 * Every fixture uses platform "generic" so no fixture implies anything about a
 * real retailer. Run: npx tsx scripts/build-fixtures.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Obj = Record<string, unknown>;
const OUT = join(import.meta.dirname, '..', 'fixtures', 'cases');

let n = 0;
function snap(stage: string, extra: Obj = {}, at?: string): Obj {
  n++;
  return {
    schemaVersion: 1,
    snapshotId: `s${n}`,
    journeyId: 'j1',
    platform: 'generic',
    surface: 'web',
    stage,
    capturedAt: at ?? `2026-10-24T10:${String(n).padStart(2, '0')}:00Z`,
    adapterId: 'fixture',
    adapterVersion: '1',
    readability: 'full',
    ...extra,
  };
}

const product = (sku: string, title = 'Whole wheat atta 5 kg') => ({ title, retailerSku: sku, variantLabel: '5 kg' });

interface Fixture {
  id: string;
  description: string;
  context: Obj;
  /** Rule ids of every expected finding, in emission order. */
  fired: string[];
}

const fixtures: Fixture[] = [];
function add(id: string, description: string, context: Obj, fired: string[]) {
  fixtures.push({ id, description, context, fired });
}

// ── Exit fixture: quick-commerce journey from the architecture doc ──────────
{
  const listing = snap('listing', { cards: [{ id: 'card-1', retailerSku: 'SKU-ATTA', title: 'Whole wheat atta 5 kg', price: 289, variantLabel: '5 kg', sponsored: 'no' }] });
  const productPage = snap('product', {
    product: product('SKU-ATTA'),
    prices: [{ kind: 'listed', amount: 289 }],
    fees: [{ id: 'f-del-disc', kind: 'delivery', amount: 30, label: 'Delivery ₹30 below ₹199', context: 'disclosure' }],
  });
  const cart = snap('cart', {
    lineItems: [
      { id: 'li-atta', title: 'Whole wheat atta 5 kg', amount: 289, paid: true, itemType: 'product', origin: 'user_tap', retailerSku: 'SKU-ATTA' },
      { id: 'li-pass', title: 'Delivery pass (3 months)', amount: 99, paid: true, itemType: 'membership', origin: 'preselected', controlId: 'chk-pass' },
    ],
    fees: [{ id: 'f-del', kind: 'delivery', amount: 30, label: 'Delivery fee', mandatory: true }],
    total: 418,
  });
  const checkout = snap('checkout', {
    lineItems: [
      { id: 'li-atta', title: 'Whole wheat atta 5 kg', amount: 289, paid: true, itemType: 'product', origin: 'user_tap', retailerSku: 'SKU-ATTA' },
      { id: 'li-pass', title: 'Delivery pass (3 months)', amount: 99, paid: true, itemType: 'membership', origin: 'unknown', controlId: 'chk-pass' },
    ],
    fees: [
      { id: 'f-del', kind: 'delivery', amount: 30, label: 'Delivery fee', mandatory: true },
      { id: 'f-hand', kind: 'handling', amount: 15, label: 'Handling charge', mandatory: true },
    ],
    total: 433,
  });
  add('journey-quick-commerce-checkout', 'Listing → product → cart → checkout. Pass preselected; handling fee appears only at checkout; delivery was disclosed.', { snapshot: checkout, journey: [listing, productPage, cart], taps: [] }, ['BASKET-01', 'DRIP-02']);
}

// ── Drip pricing ───────────────────────────────────────────────────────────
add('drip-negative-started-at-checkout', 'FairCart only saw checkout, so it cannot claim the fee was hidden earlier.', {
  snapshot: snap('checkout', { fees: [{ id: 'f-hand', kind: 'handling', amount: 15, label: 'Handling charge', mandatory: true }], total: 304 }),
}, []);
add('drip-negative-disclosed-early', 'Handling fee was disclosed on the product page.', {
  snapshot: snap('checkout', { fees: [{ id: 'f-hand', kind: 'handling', amount: 15, label: 'Handling charge', mandatory: true }] }),
  journey: [
    snap('product', { product: product('SKU-1'), prices: [{ kind: 'listed', amount: 289 }], fees: [{ id: 'd', kind: 'handling', amount: 15, label: 'A ₹15 handling charge applies', context: 'disclosure' }] }),
    snap('cart', { fees: [] }),
  ],
}, []);
add('drip-negative-optional-fee', 'A fee explicitly marked optional is not drip pricing.', {
  snapshot: snap('checkout', { fees: [{ id: 'f-plat', kind: 'platform', amount: 5, label: 'Support the platform (optional)', mandatory: false }] }),
  journey: [snap('product', { product: product('SKU-1') }), snap('cart')],
}, []);

// ── Basket sneaking ────────────────────────────────────────────────────────
add('basket-positive-preselected', 'Protection plan preselected in cart, no tap recorded.', {
  snapshot: snap('cart', { lineItems: [
    { id: 'li-phone', title: 'Phone 128 GB', amount: 15999, paid: true, itemType: 'product', origin: 'user_tap' },
    { id: 'li-prot', title: 'Screen protection plan', amount: 449, paid: true, itemType: 'protection', origin: 'preselected', controlId: 'chk-prot' },
  ] }),
}, ['BASKET-01']);
add('basket-negative-user-chose', 'Membership added by a recorded tap; a ₹0 gift is not a paid item.', {
  snapshot: snap('cart', { lineItems: [
    { id: 'li-pass', title: 'Delivery pass', amount: 99, paid: true, itemType: 'membership', origin: 'unknown', controlId: 'chk-pass' },
    { id: 'li-gift', title: 'Free sample', amount: 0, paid: false, itemType: 'gift', origin: 'preselected' },
  ] }),
  journey: [snap('product', { product: product('SKU-1') })],
  taps: [{ controlId: 'chk-pass', action: 'tap', at: '2026-10-24T09:00:00Z' }],
}, []);

add('basket-positive-ticked-addon', 'Extended warranty checkbox already ticked on the product page.', {
  snapshot: snap('product', { product: product('SKU-EAR', 'Wireless earbuds'), controls: [
    { id: 'mbb-1', kind: 'checkbox', label: '1 Year Extended Warranty for ₹79', role: 'add_on', checked: true, paidAmount: 79 },
  ] }),
}, ['BASKET-02']);
add('basket-negative-unticked-addon', 'Warranty offers start unticked; one the shopper ticked is fine.', {
  snapshot: snap('product', { product: product('SKU-EAR', 'Wireless earbuds'), controls: [
    { id: 'mbb-1', kind: 'checkbox', label: '1 Year Extended Warranty for ₹79', role: 'add_on', checked: false, paidAmount: 79 },
    { id: 'mbb-2', kind: 'checkbox', label: '2 Year Warranty for ₹149', role: 'add_on', checked: true, paidAmount: 149 },
  ] }),
  taps: [{ controlId: 'mbb-2', action: 'tap', at: '2026-10-24T09:00:00Z' }],
}, []);

// ── False urgency ──────────────────────────────────────────────────────────
add('urgency-positive-reset', 'Countdown for the same offer goes from 10 min back up to 60 min after reload.', {
  snapshot: snap('product', { product: product('SKU-2', 'Headphones'), cues: [{ id: 'c1', kind: 'countdown', text: 'Deal ends in 59:59', value: 3599, cueKey: 'countdown:deal', offerRef: 'deal-7' }] }),
  journey: [snap('product', { product: product('SKU-2', 'Headphones'), cues: [{ id: 'c1', kind: 'countdown', text: 'Deal ends in 10:00', value: 600, cueKey: 'countdown:deal', offerRef: 'deal-7' }] })],
}, ['URG-01']);
add('urgency-negative-new-offer', 'Timer went up because a different offer started; a single observation never fires.', {
  snapshot: snap('product', { product: product('SKU-2', 'Headphones'), cues: [
    { id: 'c1', kind: 'countdown', text: 'Deal ends in 59:59', value: 3599, cueKey: 'countdown:deal', offerRef: 'deal-8' },
    { id: 'c2', kind: 'countdown', text: 'Sale ends in 2h', value: 7200, cueKey: 'countdown:sale' },
  ] }),
  journey: [snap('product', { product: product('SKU-2', 'Headphones'), cues: [{ id: 'c1', kind: 'countdown', text: 'Deal ends in 0:05', value: 5, cueKey: 'countdown:deal', offerRef: 'deal-7' }] })],
}, []);

// ── Confirm shaming ────────────────────────────────────────────────────────
add('shame-positive', 'Decline reads "No thanks, I\'ll pay more".', {
  snapshot: snap('cart', { controls: [
    { id: 'b-yes', kind: 'button', label: 'Add pass & save', role: 'accept', groupId: 'g1' },
    { id: 'b-no', kind: 'link', label: "No thanks, I'll pay more", role: 'decline', groupId: 'g1' },
  ] }),
}, ['SHAME-01']);
add('shame-negative', 'Neutral decline wording.', {
  snapshot: snap('cart', { controls: [
    { id: 'b-yes', kind: 'button', label: 'Add pass', role: 'accept', groupId: 'g1' },
    { id: 'b-no', kind: 'button', label: 'No thanks', role: 'decline', groupId: 'g1' },
  ] }),
}, []);

// ── Forced action ──────────────────────────────────────────────────────────
add('forced-positive-app-gate', 'Offer gated behind an app install.', {
  snapshot: snap('product', { product: product('SKU-3', 'Shoes'), cues: [{ id: 'g', kind: 'gate', text: 'Download the app to unlock this price', cueKey: 'gate:app', gateType: 'app_install' }] }),
}, ['FORCED-01']);
add('forced-negative-login', 'Login before checkout can be needed for delivery, so it is not flagged.', {
  snapshot: snap('checkout', { cues: [{ id: 'g', kind: 'gate', text: 'Log in to continue', cueKey: 'gate:login', gateType: 'login' }] }),
}, []);

// ── Subscription trap ──────────────────────────────────────────────────────
add('sub-positive-no-cancel', 'Membership management screen with no cancel option.', {
  snapshot: snap('account', { membership: { name: 'Plus membership', price: 149, cadence: 'monthly', renewalDisclosed: true, cancelRouteVisible: false, enrolled: true } }),
}, ['SUB-01']);
add('sub-negative-cancel-visible', 'Cancel option visible.', {
  snapshot: snap('account', { membership: { name: 'Plus membership', price: 149, cadence: 'monthly', renewalDisclosed: true, cancelRouteVisible: true, enrolled: true } }),
}, []);

// ── Interface interference ─────────────────────────────────────────────────
add('iface-positive-asymmetry', 'Bold full-width accept next to a tiny faint decline.', {
  snapshot: snap('cart', { controls: [
    { id: 'b-yes', kind: 'button', label: 'Join now', role: 'accept', groupId: 'g1', style: { width: 320, height: 48, contrast: 7, fontWeight: 700 } },
    { id: 'b-no', kind: 'link', label: 'skip', role: 'decline', groupId: 'g1', style: { width: 80, height: 16, contrast: 2.5, fontWeight: 400 } },
  ] }),
}, ['IFACE-01']);
add('iface-negative-balanced', 'Two buttons of similar size and contrast.', {
  snapshot: snap('cart', { controls: [
    { id: 'b-yes', kind: 'button', label: 'Join now', role: 'accept', groupId: 'g1', style: { width: 160, height: 44, contrast: 7, fontWeight: 600 } },
    { id: 'b-no', kind: 'button', label: 'Not now', role: 'decline', groupId: 'g1', style: { width: 160, height: 44, contrast: 7, fontWeight: 600 } },
  ] }),
}, []);

// ── Bait and switch ────────────────────────────────────────────────────────
{
  const listing = () => snap('listing', { cards: [{ id: 'card-9', retailerSku: 'SKU-9', title: 'Olive oil 1 L', price: 499, variantLabel: '1 L', sponsored: 'no' }] });
  add('bait-positive-entry-price', 'Listing card said ₹499; product page says ₹649 for the same SKU.', {
    snapshot: snap('product', { product: product('SKU-9', 'Olive oil 1 L'), prices: [{ kind: 'listed', amount: 649 }] }),
    journey: [listing()],
  }, ['BAIT-01']);
  add('bait-negative-variant-changed', 'Price rose because the shopper picked a larger size.', {
    snapshot: snap('product', {
      product: product('SKU-9', 'Olive oil 2 L'),
      prices: [{ kind: 'listed', amount: 949 }],
      controls: [{ id: 'v-2l', kind: 'radio', label: '2 L', role: 'variant_selector', checked: true }],
    }),
    journey: [listing()],
    taps: [{ controlId: 'v-2l', action: 'tap', at: '2026-10-24T09:00:00Z' }],
  }, []);
}

// ── Disguised advertisement ────────────────────────────────────────────────
add('ad-positive-unlabelled-and-faint', 'One ad slot with no label, one with a faint label.', {
  snapshot: snap('listing', { cards: [
    { id: 'a1', retailerSku: 'SKU-A1', title: 'Brand X shampoo', price: 299, sponsored: 'unlabelled' },
    { id: 'a2', retailerSku: 'SKU-A2', title: 'Brand Y shampoo', price: 319, sponsored: 'labelled', sponsoredLabelStyle: { width: 40, height: 10, contrast: 1.6, fontSize: 9 }, cardTextStyle: { width: 200, height: 18, contrast: 12, fontSize: 14 } },
  ] }),
}, ['AD-01', 'AD-01']);
add('ad-negative-clear-label', 'Clearly labelled sponsored card and an organic card.', {
  snapshot: snap('listing', { cards: [
    { id: 'a1', retailerSku: 'SKU-A1', title: 'Brand X shampoo', price: 299, sponsored: 'labelled', sponsoredLabelStyle: { width: 60, height: 14, contrast: 7, fontSize: 12 }, cardTextStyle: { width: 200, height: 18, contrast: 12, fontSize: 14 } },
    { id: 'a2', retailerSku: 'SKU-A2', title: 'Brand Z shampoo', price: 279, sponsored: 'no' },
  ] }),
}, []);

// ── Nagging ────────────────────────────────────────────────────────────────
{
  const prompt = { id: 'p', kind: 'prompt', text: 'Get free delivery with Pass', cueKey: 'prompt:pass', promptId: 'pass-upsell' };
  add('nag-positive-reshown', 'Pass pop-up dismissed, then shown twice more.', {
    snapshot: snap('product', { cues: [prompt] }, '2026-10-24T11:20:00Z'),
    journey: [snap('listing', { cues: [prompt] }, '2026-10-24T11:00:00Z'), snap('listing', { cues: [prompt] }, '2026-10-24T11:10:00Z')],
    taps: [{ controlId: 'pass-upsell', action: 'dismiss', at: '2026-10-24T11:01:00Z' }],
  }, ['NAG-01']);
  add('nag-negative-once', 'Pop-up shown once after dismissal.', {
    snapshot: snap('product', { cues: [prompt] }, '2026-10-24T11:20:00Z'),
    journey: [snap('listing', { cues: [prompt] }, '2026-10-24T11:00:00Z')],
    taps: [{ controlId: 'pass-upsell', action: 'dismiss', at: '2026-10-24T11:01:00Z' }],
  }, []);
}

// ── Trick wording ──────────────────────────────────────────────────────────
add('trick-positive-double-negative', 'Checkbox with a double negative.', {
  snapshot: snap('checkout', { controls: [{ id: 'c-wa', kind: 'checkbox', label: 'Uncheck to not stop receiving offers on WhatsApp', role: 'consent', checked: true }] }),
}, ['TRICK-01']);
add('trick-negative-plain', 'Plain opt-in wording.', {
  snapshot: snap('checkout', { controls: [{ id: 'c-wa', kind: 'checkbox', label: 'Send me offers on WhatsApp', role: 'consent', checked: false }] }),
}, []);

// ── SaaS billing ───────────────────────────────────────────────────────────
add('saas-positive-trial-no-renewal', 'Trial offer with no renewal price or date shown.', {
  snapshot: snap('membership', { membership: { name: 'Pass free trial', price: 99, trial: true, renewalDisclosed: false } }),
}, ['SAAS-01']);
add('saas-negative-terms-shown', 'Renewal terms shown before signup.', {
  snapshot: snap('membership', { membership: { name: 'Pass free trial', price: 99, cadence: 'monthly', trial: true, renewalDisclosed: true } }),
}, []);

// ── Rogue malware ──────────────────────────────────────────────────────────
add('malware-positive-scareware', 'Fake infection warning on a shopping page.', {
  snapshot: snap('listing', { cues: [{ id: 'm', kind: 'scareware', text: 'Your phone is infected! Install cleaner to continue', cueKey: 'scare:1' }] }),
}, ['MAL-01']);
add('malware-negative-own-app', "The retailer's own app link is not flagged.", {
  snapshot: snap('listing', { cues: [{ id: 'm', kind: 'download_prompt', text: 'Get our app', cueKey: 'dl:app', targetOffRetailer: false }] }),
}, []);

mkdirSync(OUT, { recursive: true });
for (const f of fixtures) {
  const body = { id: f.id, description: f.description, synthetic: true, context: f.context, expect: { fired: f.fired } };
  writeFileSync(join(OUT, `${f.id}.json`), JSON.stringify(body, null, 2) + '\n');
}
console.log(`Wrote ${fixtures.length} fixtures to ${OUT}`);
