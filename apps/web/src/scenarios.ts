/** The two practice stores, and your agent's standing rules. */

export type Store = 'demomart' | 'fairmart';

export interface StoreInfo {
  store: Store;
  merchant: string;
  domain: string;
  honest: boolean;
  blurb: string;
  /** What the merchant hides, so viewers know what to watch for. */
  tricks: string[];
}

export const STORES: Record<Store, StoreInfo> = {
  demomart: {
    store: 'demomart',
    merchant: 'DemoMart',
    domain: 'demomart.example',
    honest: false,
    blurb: 'A grocery store with a trick at every step of checkout.',
    tricks: ['Protection plan already ticked', 'A paid pass slipped into the basket', 'Fees that appear only at payment', '₹10 in the total nobody explains', 'Text written to instruct AI agents'],
  },
  fairmart: {
    store: 'fairmart',
    merchant: 'FairMart',
    domain: 'fairmart.example',
    honest: true,
    blurb: 'The same shelves with honest checkout. PennyWise should stay quiet.',
    tricks: [],
  },
};

/** Standing rules for every purchase the agent makes. Kept in this browser. */
export interface Prefs {
  maxRupees: number;
  fees: string[];
  autopay: boolean;
  /** What you last asked the agent to buy, and where. */
  sku: string;
  store: Store;
}

export const DEFAULT_PREFS: Prefs = { maxRupees: 1000, fees: ['delivery'], autopay: true, sku: 'DEMO-ATTA-5KG', store: 'demomart' };
const PREFS_KEY = 'pennywise-prefs';

export function loadPrefs(): Prefs | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) } : null;
  } catch {
    return null;
  }
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* private mode: rules last for this visit */
  }
}

/** The production server serves the store at /shop; the Vite dev server only knows shop.html. */
const SHOP_PATH = import.meta.env.DEV ? '/shop.html' : '/shop';
const storeQ = (s: Store) => (s === 'demomart' ? '' : `&store=${s}`);

export const storeHome = (s: Store) => `${SHOP_PATH}?view=home${storeQ(s)}`;
/** Another page of the store (basket or payment), keeping the current basket. */
export const pageUrl = (s: Store, view: 'basket' | 'pay') => `${SHOP_PATH}?view=${view}${storeQ(s)}`;
/** A product page, reset so the agent meets every trick the store has. */
export const productUrl = (s: Store, sku: string) => `${SHOP_PATH}?view=item&sku=${encodeURIComponent(sku)}&reset=1${storeQ(s)}`;

export type PageView = 'home' | 'item' | 'basket' | 'pay';

export interface Location {
  store: Store;
  view: PageView;
  sku: string | null;
  q: string;
  cat: string | null;
}

export function readLocation(search: string): Location {
  const p = new URLSearchParams(search);
  const v = p.get('view');
  return {
    store: p.get('store') === 'fairmart' ? 'fairmart' : 'demomart',
    view: v === 'home' || v === 'basket' || v === 'pay' ? v : 'item',
    sku: p.get('sku'),
    q: p.get('q') ?? '',
    cat: p.get('cat'),
  };
}

/** The address shown in the browser bar: what a real store's URL would look like. */
export function displayPath(l: Location, sku: string | undefined): string {
  if (l.view === 'home') return l.q ? `/search?q=${encodeURIComponent(l.q)}` : l.cat ? `/c/${l.cat}` : '/';
  if (l.view === 'item') return `/p/${(sku ?? '').toLowerCase()}`;
  return l.view === 'basket' ? '/basket' : '/checkout/payment';
}
