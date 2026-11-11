/** The tasks you can give the agent, one per practice merchant. */

export type Store = 'demomart' | 'skyhop' | 'fairmart';

export interface Scenario {
  store: Store;
  merchant: string;
  category: string;
  /** The task, as you'd say it to an assistant. */
  task: string;
  product: { sku: string; title: string; priceLabel: string };
  maxRupees: number;
  fees: string[];
  /** What the merchant hides. Shown on the home screen so viewers know what to watch for. */
  tricks: string[];
  domain: string;
  paths: Record<'item' | 'basket' | 'pay', string>;
}

export const SCENARIOS: Record<Store, Scenario> = {
  demomart: {
    store: 'demomart',
    merchant: 'DemoMart',
    category: 'Groceries',
    task: 'Buy a 5 kg bag of atta',
    product: { sku: 'DEMO-ATTA-5KG', title: 'Sunrise Chakki Atta 5 kg', priceLabel: '₹289' },
    maxRupees: 350,
    fees: ['delivery'],
    tricks: ['Protection plan already ticked', 'A paid pass slipped into the basket', 'Fees that appear only at payment', '₹10 in the total nobody explains'],
    domain: 'demomart.example',
    paths: { item: '/atta/sunrise-chakki-atta-5kg', basket: '/basket', pay: '/checkout/payment' },
  },
  skyhop: {
    store: 'skyhop',
    merchant: 'SkyHop',
    category: 'Flights',
    task: 'Book Bengaluru to Delhi on 14 Nov',
    product: { sku: 'SH204-BLR-DEL-20261114', title: 'Flight BLR → DEL · SH 204 · Fri 14 Nov', priceLabel: '₹5,849' },
    maxRupees: 7000,
    fees: [],
    tricks: ['Travel insurance already ticked', 'A seat and a Flexi Pass added for you', 'A convenience fee on the last page', '"Only 2 seats left" pressure'],
    domain: 'skyhop.example',
    paths: { item: '/flights/blr-del/2026-11-14', basket: '/booking/review', pay: '/booking/payment' },
  },
  fairmart: {
    store: 'fairmart',
    merchant: 'FairMart',
    category: 'Control',
    task: 'Buy the same atta from an honest store',
    product: { sku: 'DEMO-ATTA-5KG', title: 'Sunrise Chakki Atta 5 kg', priceLabel: '₹289' },
    maxRupees: 350,
    fees: ['delivery'],
    tricks: ['No tricks at all: PennyWise should stay quiet and let the agent pay'],
    domain: 'fairmart.example',
    paths: { item: '/atta/sunrise-chakki-atta-5kg', basket: '/basket', pay: '/checkout/payment' },
  },
};

/** The production server serves the store at /shop; the Vite dev server only knows shop.html. */
const SHOP_PATH = import.meta.env.DEV ? '/shop.html' : '/shop';

export const shopUrl = (s: Store) => `${SHOP_PATH}?view=item&reset=1${s === 'demomart' ? '' : `&store=${s}`}`;
