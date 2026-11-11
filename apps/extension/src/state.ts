import type { Finding, TraceEntry } from '@faircart/schemas';
import { CORE_PACK } from '@faircart/rules';
import type { Extraction, ProductIdentity } from './adapters/types';
import type { NotCheckedStore, Offer, ProviderStatus, SavedProduct, TabState } from './messages';
import { productKey } from './messages';
import { computeHistory } from './pricing/history';
import { effectiveTotal, matchProducts, rankOffers, searchQuery } from './pricing/match';
import { RETAILERS, retailerById, retailerForUrl } from './retailers';
import type { Journey } from './store/journey';
import { allProducts, allWatches, getDismissed, getObservations, getWatch, type ProductRecord } from './store/storage';

/** Builds the side panel's view of a tab from what the service worker knows. Read-only. */

export interface TabRuntime {
  url: string;
  pageId: string;
  extraction: Extraction;
  findings: Finding[];
  trace: TraceEntry[];
  scannedAt: string;
}

const STALE_MS: Record<string, number> = { marketplace: 24 * 3600_000, quick_commerce: 30 * 60_000 };

export const PROVIDERS: ProviderStatus[] = [
  { id: 'device', name: 'Your browsing on this device', status: 'ok', note: 'Prices FairCart saw on pages you opened.' },
  { id: 'shared', name: 'Shared price history', status: 'unavailable', note: 'Needs the FairCart backend, which this build does not use.' },
  { id: 'amazon_api', name: 'Amazon product API', status: 'not_configured', note: 'Requires an approved affiliate account. Not connected.' },
  { id: 'flipkart_api', name: 'Flipkart affiliate API', status: 'not_configured', note: 'Requires affiliate approval. Not connected.' },
];

function whyNot(trace: TraceEntry[]): { ruleId: string; reason: string }[] {
  const out: { ruleId: string; reason: string }[] = [];
  for (const t of trace) {
    if (t.result !== 'requires_false' && t.result !== 'unless_true') continue;
    const rule = CORE_PACK.rules.find((r) => r.id === t.ruleId);
    const reason =
      t.result === 'requires_false'
        ? t.ruleId.startsWith('DRIP')
          ? 'FairCart did not see the earlier product and cart pages in this journey, so it cannot say a fee was hidden.'
          : 'Not enough of the journey was observed to judge this.'
        : 'Checked and cleared: the condition that would make this a concern was not met.';
    if (rule && !out.some((o) => o.ruleId === t.ruleId)) out.push({ ruleId: `${t.ruleId} · ${rule.emit.title}`, reason });
  }
  return out;
}

async function offersFor(identity: ProductIdentity, current: ProductRecord | undefined, enabledIds: Set<string>) {
  const products = await allProducts();
  const selfKey = productKey(identity.retailer, identity.retailerSku);
  const offers: Offer[] = [];
  for (const [key, rec] of Object.entries(products)) {
    if (rec.identity.retailer === 'generic' && key !== selfKey) continue;
    const match = key === selfKey ? { tier: 'exact' as const, confidence: 1, reasons: ['This page.'] } : matchProducts(identity, rec.identity);
    if (match.tier === 'different') continue;
    const r = retailerById(rec.identity.retailer);
    const obs = await getObservations(key);
    const last = obs.at(-1);
    const id = key === selfKey ? identity : rec.identity;
    const observedAt = key === selfKey ? new Date().toISOString() : (last?.at ?? rec.lastSeen);
    const staleAfter = STALE_MS[r?.kind ?? 'marketplace']!;
    offers.push({
      productKey: key,
      retailer: id.retailer,
      retailerName: r?.name ?? id.retailer,
      title: id.title,
      variantLabel: id.variantLabel,
      seller: id.seller,
      url: id.url,
      price: key === selfKey ? id.price : (last?.price ?? id.price),
      mrp: key === selfKey ? id.mrp : (last?.mrp ?? id.mrp),
      deliveryFee: id.deliveryFee,
      total: effectiveTotal({ price: key === selfKey ? id.price : (last?.price ?? id.price), deliveryFee: id.deliveryFee }),
      observedAt,
      stale: key !== selfKey && Date.now() - Date.parse(observedAt) > staleAfter,
      match,
      isCurrent: key === selfKey,
    });
  }
  void current;
  const ranked = rankOffers(offers);
  const covered = new Set(offers.filter((o) => o.match.tier === 'exact' || o.match.tier === 'same_model').map((o) => o.retailer));
  const q = searchQuery(identity);
  const notChecked: NotCheckedStore[] = RETAILERS.filter((r) => r.kind === 'marketplace' && r.support !== 'not_supported' && !covered.has(r.id)).map((r) => ({
    retailer: r.id,
    retailerName: r.name,
    searchUrl: r.searchUrl ? r.searchUrl(q) : null,
    enabled: enabledIds.has(r.id),
  }));
  return { offers: ranked, notChecked };
}

export async function savedProducts(): Promise<SavedProduct[]> {
  const [products, watches] = await Promise.all([allProducts(), allWatches()]);
  const out: SavedProduct[] = [];
  for (const [key, w] of Object.entries(watches)) {
    const rec = products[key];
    if (!rec) continue;
    const obs = await getObservations(key);
    out.push({
      productKey: key,
      identity: rec.identity,
      watch: { target: w.target, createdAt: w.createdAt },
      lastPrice: obs.at(-1)?.price ?? rec.identity.price,
      lastSeen: obs.at(-1)?.at ?? rec.lastSeen,
      lowestSeen: obs.length ? Math.min(...obs.map((o) => o.price)) : null,
    });
  }
  return out.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}

export async function buildTabState(
  tabId: number,
  url: string | null,
  rt: TabRuntime | undefined,
  journey: Journey | undefined,
  enabledIds: Set<string>,
  pausedIds: Set<string>,
): Promise<TabState> {
  const retailer = url ? retailerForUrl(url) : undefined;
  const identity = rt?.extraction.identity ?? null;
  const key = identity ? productKey(identity.retailer, identity.retailerSku) : null;
  const dismissedMap = await getDismissed();
  const findings = (rt?.findings ?? []).filter((f) => !dismissedMap[f.id]);
  const dismissed = (rt?.findings ?? []).filter((f) => dismissedMap[f.id]);
  const history = key ? computeHistory(await getObservations(key), new Date()) : null;
  const { offers, notChecked } = identity ? await offersFor(identity, undefined, enabledIds) : { offers: [], notChecked: [] };
  const watch = key ? ((await getWatch(key)) ?? null) : null;

  return {
    tabId,
    url,
    retailer: retailer ? { id: retailer.id, name: retailer.name, support: retailer.support } : null,
    enabled: retailer ? enabledIds.has(retailer.id) : false,
    paused: retailer ? pausedIds.has(retailer.id) : false,
    page: rt
      ? {
          stage: rt.extraction.stage,
          readability: rt.extraction.readability,
          sensitive: rt.extraction.sensitive,
          gaps: rt.extraction.gaps,
          adapter: `${rt.extraction.adapterId}@${rt.extraction.adapterVersion}`,
          scannedAt: rt.scannedAt,
        }
      : null,
    identity,
    productKey: key,
    findings,
    dismissed,
    silentRules: rt ? whyNot(rt.trace) : [],
    journey: journey ? { stages: [...new Set(journey.snapshots.map((s) => s.stage))], startedAt: journey.startedAt, snapshots: journey.snapshots.length } : null,
    bill: rt?.extraction.bill ?? null,
    history,
    offers,
    notChecked,
    providers: PROVIDERS,
    watch: watch ? { target: watch.target, createdAt: watch.createdAt } : null,
    saved: await savedProducts(),
  };
}
