import type { RetailerId } from '@faircart/schemas';

/**
 * Retailer registry. `support` is what this build can actually do:
 *  - full: site-specific adapter tested against live markup
 *  - generic: generic adapter only (JSON-LD, Open Graph, visible text), limited
 *  - not_supported: no usable web shopping flow (app-only); a browser extension can't help
 * Origins are requested one by one when the user enables a site.
 */
export interface Retailer {
  id: RetailerId;
  name: string;
  kind: 'marketplace' | 'quick_commerce';
  /** Host permission patterns requested on enable. */
  origins: string[];
  /** Content-script match patterns (may be narrower than origins). */
  matches: string[];
  support: 'full' | 'generic' | 'not_supported';
  note: string;
  /** Builds a search URL on this retailer for user-mediated comparison. */
  searchUrl?: (q: string) => string;
}

const enc = encodeURIComponent;

export const RETAILERS: readonly Retailer[] = [
  { id: 'amazon_in', name: 'Amazon India', kind: 'marketplace', origins: ['https://www.amazon.in/*'], matches: ['https://www.amazon.in/*'], support: 'full', note: 'Search, product and cart pages. Includes Amazon Fresh on amazon.in.', searchUrl: (q) => `https://www.amazon.in/s?k=${enc(q)}` },
  { id: 'flipkart', name: 'Flipkart', kind: 'marketplace', origins: ['https://www.flipkart.com/*'], matches: ['https://www.flipkart.com/*'], support: 'full', note: 'Search and product pages. Cart uses the generic bill reader.', searchUrl: (q) => `https://www.flipkart.com/search?q=${enc(q)}` },
  { id: 'myntra', name: 'Myntra', kind: 'marketplace', origins: ['https://www.myntra.com/*'], matches: ['https://www.myntra.com/*'], support: 'generic', note: 'Generic reader only in this build.', searchUrl: (q) => `https://www.myntra.com/${enc(q.replace(/\s+/g, '-'))}` },
  { id: 'nykaa', name: 'Nykaa', kind: 'marketplace', origins: ['https://www.nykaa.com/*'], matches: ['https://www.nykaa.com/*'], support: 'generic', note: 'Generic reader only in this build.', searchUrl: (q) => `https://www.nykaa.com/search/result/?q=${enc(q)}` },
  { id: 'meesho', name: 'Meesho', kind: 'marketplace', origins: ['https://www.meesho.com/*'], matches: ['https://www.meesho.com/*'], support: 'generic', note: 'Generic reader only in this build.', searchUrl: (q) => `https://www.meesho.com/search?q=${enc(q)}` },
  { id: 'ajio', name: 'AJIO', kind: 'marketplace', origins: ['https://www.ajio.com/*'], matches: ['https://www.ajio.com/*'], support: 'generic', note: 'Generic reader only in this build.', searchUrl: (q) => `https://www.ajio.com/search/?text=${enc(q)}` },
  { id: 'tata_neu', name: 'Tata Neu', kind: 'marketplace', origins: ['https://www.tataneu.com/*'], matches: ['https://www.tataneu.com/*'], support: 'generic', note: 'Often hands off to brand sites, which are not covered.' },
  { id: 'jiomart', name: 'JioMart', kind: 'marketplace', origins: ['https://www.jiomart.com/*'], matches: ['https://www.jiomart.com/*'], support: 'generic', note: 'Generic reader only in this build.', searchUrl: (q) => `https://www.jiomart.com/search/${enc(q)}` },
  { id: 'blinkit', name: 'Blinkit', kind: 'quick_commerce', origins: ['https://blinkit.com/*'], matches: ['https://blinkit.com/*'], support: 'generic', note: 'Generic reader and checkout scan. Prices depend on your delivery location.', searchUrl: (q) => `https://blinkit.com/s/?q=${enc(q)}` },
  { id: 'zepto', name: 'Zepto', kind: 'quick_commerce', origins: ['https://www.zeptonow.com/*'], matches: ['https://www.zeptonow.com/*'], support: 'generic', note: 'Generic reader and checkout scan. Domain to re-verify.' },
  { id: 'swiggy_instamart', name: 'Swiggy Instamart', kind: 'quick_commerce', origins: ['https://www.swiggy.com/*'], matches: ['https://www.swiggy.com/instamart*'], support: 'generic', note: 'Runs only on /instamart pages, not food delivery.' },
  { id: 'bigbasket', name: 'BigBasket', kind: 'quick_commerce', origins: ['https://www.bigbasket.com/*'], matches: ['https://www.bigbasket.com/*'], support: 'generic', note: 'Generic reader. BB Now is largely app-first.', searchUrl: (q) => `https://www.bigbasket.com/ps/?q=${enc(q)}` },
  { id: 'flipkart_minutes', name: 'Flipkart Minutes', kind: 'quick_commerce', origins: [], matches: [], support: 'not_supported', note: 'App-only. A browser extension cannot read native apps.' },
];

/**
 * FairCart's own practice store (demo.html inside the extension). Fictional,
 * labelled as a demo everywhere, read by the generic adapter like any other
 * site, and kept out of price history and comparisons.
 */
export const DEMO_RETAILER: Retailer = {
  id: 'generic',
  name: 'FairCart demo shop',
  kind: 'quick_commerce',
  origins: [],
  matches: [],
  support: 'generic',
  note: 'A fictional practice store with deliberate dark patterns. Nothing here is real.',
};

export function isDemoUrl(u: URL): boolean {
  return u.protocol === 'chrome-extension:' && u.pathname === '/demo.html';
}

export function retailerById(id: string): Retailer | undefined {
  return id === DEMO_RETAILER.id ? DEMO_RETAILER : RETAILERS.find((r) => r.id === id);
}

/** Which retailer a URL belongs to (only those with web flows). */
export function retailerForUrl(url: string): Retailer | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  if (isDemoUrl(u)) return DEMO_RETAILER;
  return RETAILERS.find((r) => r.matches.some((m) => matchPattern(m, u)));
}

/** Minimal Chrome match-pattern check for https host + path prefix patterns used above. */
export function matchPattern(pattern: string, u: URL): boolean {
  const m = /^(https):\/\/([^/]+)(\/.*)$/.exec(pattern);
  if (!m) return false;
  const [, scheme, host, path] = m;
  if (u.protocol !== `${scheme}:` || u.host !== host) return false;
  const prefix = path!.replace(/\*$/, '');
  return path!.endsWith('*') ? u.pathname.startsWith(prefix) || `${u.pathname}${u.search}`.startsWith(prefix) : u.pathname === path;
}
