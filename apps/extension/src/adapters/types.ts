import type { ControlFact, CueFact, FeeFact, LineItem, ListingCard, Product, RetailerId, ScreenSnapshotInput, Stage } from '@faircart/schemas';

/** Element handles stay in the content script. Rules and storage only ever see the string ref. */
export class RefRegistry {
  private next = 1;
  private byEl = new WeakMap<Element, string>();
  private byRef = new Map<string, WeakRef<Element>>();

  ref(el: Element): string {
    let r = this.byEl.get(el);
    if (!r) {
      r = `fc-${this.next++}`;
      this.byEl.set(el, r);
      this.byRef.set(r, new WeakRef(el));
    }
    return r;
  }
  get(ref: string): Element | undefined {
    return this.byRef.get(ref)?.deref();
  }
  /** Existing ref for an element, without creating one. */
  refOf(el: Element): string | undefined {
    return this.byEl.get(el);
  }
  /** What kind of thing an element is, for hover actions. */
  readonly kinds = new Map<string, HoverKind>();
  tag(el: Element, kind: HoverKind): string {
    const r = this.ref(el);
    this.kinds.set(r, kind);
    return r;
  }
}

export type HoverKind = 'price' | 'mrp' | 'fee' | 'countdown' | 'stock' | 'sponsored' | 'addon' | 'membership' | 'card' | 'total';

/** Comparable product identity used by price history and comparison. */
export interface ProductIdentity {
  retailer: RetailerId;
  retailerSku: string;
  title: string;
  brand?: string;
  model?: string;
  mpn?: string;
  gtin?: string;
  color?: string;
  variantLabel?: string;
  attributes: Record<string, string>;
  seller?: string;
  condition: 'new' | 'refurbished' | 'used' | 'unknown';
  quantity?: { value: number; unit: string };
  url: string;
  price: number | null;
  mrp: number | null;
  /** 0 = free delivery shown; null = not determinable from this page. */
  deliveryFee: number | null;
  availability: 'in_stock' | 'out_of_stock' | 'unknown';
}

export interface BillRow {
  label: string;
  amount: number | null;
  kind: 'item' | 'subtotal' | 'discount' | 'fee' | 'total' | 'membership' | 'service';
  feeKind?: FeeFact['kind'];
  /** "FREE" shown, possibly with a struck-out amount. */
  free: boolean;
  elRef: string;
}

export interface Bill {
  rows: BillRow[];
  displayedTotal: number | null;
  computedTotal: number | null;
  /** displayed − computed, when both exist. */
  difference: number | null;
  /** Rows that look like bill lines but whose amount couldn't be read. */
  unreadable: string[];
}

export interface Extraction {
  adapterId: string;
  adapterVersion: string;
  retailer: RetailerId;
  stage: Stage;
  readability: 'full' | 'partial' | 'none';
  /** True when the page holds credentials or payment fields: nothing else is extracted. */
  sensitive: boolean;
  product?: Product;
  identity: ProductIdentity | null;
  prices: { kind: 'listed' | 'reference' | 'unit' | 'member'; amount: number; label?: string; elRef?: string }[];
  fees: FeeFact[];
  lineItems: LineItem[];
  controls: ControlFact[];
  cues: CueFact[];
  cards: ListingCard[];
  total: number | null;
  bill: Bill | null;
  /** Human-readable notes on what could not be read. */
  gaps: string[];
}

export interface SiteAdapter {
  id: string;
  version: string;
  extract(doc: Document, url: URL, refs: RefRegistry): Extraction;
}

export function emptyExtraction(adapter: Pick<SiteAdapter, 'id' | 'version'>, retailer: RetailerId, stage: Stage): Extraction {
  return {
    adapterId: adapter.id,
    adapterVersion: adapter.version,
    retailer,
    stage,
    readability: 'none',
    sensitive: false,
    identity: null,
    prices: [],
    fees: [],
    lineItems: [],
    controls: [],
    cues: [],
    cards: [],
    total: null,
    bill: null,
    gaps: [],
  };
}

/** Shape the extraction into the shared ScreenSnapshot (journey id and timestamp added by the caller). */
export function toSnapshot(x: Extraction, ids: { snapshotId: string; journeyId: string; capturedAt: string }): ScreenSnapshotInput {
  return {
    schemaVersion: 1,
    ...ids,
    platform: x.retailer,
    surface: 'web',
    stage: x.stage,
    adapterId: x.adapterId,
    adapterVersion: x.adapterVersion,
    readability: x.readability,
    ...(x.product ? { product: x.product } : {}),
    prices: x.prices,
    fees: x.fees,
    lineItems: x.lineItems,
    controls: x.controls,
    cues: x.cues,
    cards: x.cards,
    total: x.total,
  };
}
