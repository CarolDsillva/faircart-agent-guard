import type { Finding } from '@faircart/schemas';
import type { Bill, Extraction, HoverKind, ProductIdentity } from './adapters/types';
import type { HistoryStats } from './pricing/history';
import type { EffectiveTotal, MatchResult } from './pricing/match';

/** Typed message protocol between content scripts, the service worker and extension pages. */

export type PanelTab = 'issues' | 'compare' | 'history' | 'saved';

export type ContentToBackground =
  | { type: 'page/snapshot'; pageId: string; url: string; extraction: Extraction }
  | { type: 'tap'; controlId: string; action: 'tap' | 'dismiss' }
  | { type: 'finding/dismiss'; id: string; reason: 'dismissed' | 'false_positive' }
  | { type: 'panel/open'; tab: PanelTab }
  | { type: 'site/pause'; retailer: string; paused: boolean }
  | { type: 'options/open' };

export type BackgroundToContent =
  | { type: 'menu/toggle' }
  | { type: 'findings/update'; findings: Finding[] }
  | { type: 'settings/changed' };

export type PageToBackground =
  | { type: 'state/get'; tabId: number }
  | { type: 'state/mine' }
  | { type: 'watch/set'; productKey: string; target: number | null }
  | { type: 'saved/remove'; productKey: string }
  | { type: 'finding/dismiss'; id: string; reason: 'dismissed' | 'false_positive' }
  | { type: 'finding/restore'; id: string }
  | { type: 'sites/refresh' }
  | { type: 'data/clear' }
  | { type: 'export' }
  | { type: 'tab/rescan'; tabId: number };

export interface Offer {
  productKey: string;
  retailer: string;
  retailerName: string;
  title: string;
  variantLabel?: string;
  seller?: string;
  url: string;
  price: number | null;
  mrp: number | null;
  deliveryFee: number | null;
  total: EffectiveTotal;
  observedAt: string;
  stale: boolean;
  match: MatchResult;
  isCurrent: boolean;
}

export interface NotCheckedStore {
  retailer: string;
  retailerName: string;
  searchUrl: string | null;
  enabled: boolean;
}

export interface ProviderStatus {
  id: string;
  name: string;
  status: 'ok' | 'not_configured' | 'unavailable';
  note: string;
}

export interface SavedProduct {
  productKey: string;
  identity: ProductIdentity;
  watch: { target: number; createdAt: string } | null;
  lastPrice: number | null;
  lastSeen: string;
  lowestSeen: number | null;
}

export interface TabState {
  tabId: number;
  url: string | null;
  retailer: { id: string; name: string; support: 'full' | 'generic' | 'not_supported' } | null;
  enabled: boolean;
  paused: boolean;
  page: {
    stage: string;
    readability: 'full' | 'partial' | 'none';
    sensitive: boolean;
    gaps: string[];
    adapter: string;
    scannedAt: string;
  } | null;
  identity: ProductIdentity | null;
  productKey: string | null;
  findings: Finding[];
  dismissed: Finding[];
  /** Rule trace for "why didn't X fire", limited to rules that were evaluated on something. */
  silentRules: { ruleId: string; reason: string }[];
  journey: { stages: string[]; startedAt: string; snapshots: number } | null;
  bill: Bill | null;
  history: HistoryStats | null;
  offers: Offer[];
  notChecked: NotCheckedStore[];
  providers: ProviderStatus[];
  watch: { target: number; createdAt: string } | null;
  saved: SavedProduct[];
  hoverKinds?: Record<string, HoverKind>;
}

export function productKey(retailer: string, sku: string): string {
  return `${retailer}:${sku}`;
}
