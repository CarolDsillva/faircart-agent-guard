import { asArray, asNumber, asString, isObject, type Json, type JsonObject } from './json';

/**
 * Derivation (SPEC.md §2): the only non-declarative step. It computes journey
 * facts once so rules can stay simple data. Mirrored by Derivation.kt.
 */

const RANK: Record<string, number> = { listing: 0, product: 1, cart: 2, checkout: 3 };

export interface Derived {
  snapshot: JsonObject;
  derived: JsonObject;
}

function stageOf(s: JsonObject): string {
  return asString(s.stage) ?? 'unknown';
}

function itemsOf(s: JsonObject, key: string): JsonObject[] {
  return asArray(s[key]).filter(isObject);
}

function instant(v: Json | undefined): number | null {
  const s = asString(v);
  if (s === null) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

function prominence(style: Json | undefined): number | null {
  if (!isObject(style)) return null;
  const w = asNumber(style.width);
  const h = asNumber(style.height);
  const c = asNumber(style.contrast);
  if (w === null || h === null || c === null) return null;
  const weight = asNumber(style.fontWeight) ?? 400;
  return w * h * c * (weight >= 600 ? 1.25 : 1);
}

export function derive(snapshot: JsonObject, journey: JsonObject[], taps: JsonObject[]): Derived {
  const all = [...journey, snapshot];
  const tapped = new Set(
    taps.filter((t) => t.action === 'tap').map((t) => asString(t.controlId)).filter((x): x is string => x !== null),
  );

  // Snapshot level
  const observedStages: string[] = [];
  for (const s of all) {
    const st = stageOf(s);
    if (!observedStages.includes(st)) observedStages.push(st);
  }

  const sku = isObject(snapshot.product) ? asString(snapshot.product.retailerSku) : null;
  let entry: JsonObject | null = null;
  if (sku !== null) {
    for (let i = journey.length - 1; i >= 0 && entry === null; i--) {
      const s = journey[i]!;
      if (stageOf(s) !== 'listing') continue;
      entry = itemsOf(s, 'cards').find((c) => c.retailerSku === sku) ?? null;
    }
  }
  const entryPrice = entry ? asNumber(entry.price) : null;
  const listed = itemsOf(snapshot, 'prices').find((p) => p.kind === 'listed');
  const currentPrice = listed ? asNumber(listed.amount) : null;
  const priceDelta = currentPrice !== null && entryPrice !== null ? currentPrice - entryPrice : null;
  const priceDeltaPct = priceDelta !== null && entryPrice !== null && entryPrice > 0 ? (priceDelta / entryPrice) * 100 : null;

  const variantSelectorIds = new Set<string>();
  for (const s of all) {
    for (const c of itemsOf(s, 'controls')) {
      if (c.role === 'variant_selector' && typeof c.id === 'string') variantSelectorIds.add(c.id);
    }
  }
  const variantChangedByUser = [...tapped].some((id) => variantSelectorIds.has(id));

  let previousTotal: number | null = null;
  for (let i = journey.length - 1; i >= 0; i--) {
    const s = journey[i]!;
    const t = asNumber(s.total);
    if ((stageOf(s) === 'cart' || stageOf(s) === 'checkout') && t !== null) {
      previousTotal = t;
      break;
    }
  }

  const derived: JsonObject = {
    observedStages,
    startedAtStage: stageOf(all[0]!),
    hasEntry: entry !== null,
    entryPrice,
    entryVariantLabel: entry ? (asString(entry.variantLabel) ?? null) : null,
    entryCardId: entry ? (asString(entry.id) ?? null) : null,
    currentPrice,
    priceDelta,
    priceDeltaPct,
    variantChangedByUser,
    previousTotal,
  };

  // Fees
  const last = journey.length > 0 ? journey[journey.length - 1]! : null;
  const fees = itemsOf(snapshot, 'fees').map((f) => {
    const sameKind = (s: JsonObject) => itemsOf(s, 'fees').some((g) => g.kind === f.kind);
    const first = all.find(sameKind);
    return {
      ...f,
      firstSeenStage: first ? stageOf(first) : stageOf(snapshot),
      disclosedEarly: all.some((s) => (stageOf(s) === 'listing' || stageOf(s) === 'product') && sameKind(s)),
      isNew: last !== null && !sameKind(last),
    };
  });

  const lineItems = itemsOf(snapshot, 'lineItems').map((li) => ({
    ...li,
    userTapped: li.origin === 'user_tap' || (typeof li.controlId === 'string' && tapped.has(li.controlId)),
  }));

  const rawControls = itemsOf(snapshot, 'controls');
  const controls = rawControls.map((c) => {
    let prominenceRatio: number | null = null;
    if (c.role === 'accept' && typeof c.groupId === 'string') {
      const decline = rawControls.find((d) => d.groupId === c.groupId && d.role === 'decline' && isObject(d.style));
      const pa = prominence(c.style);
      const pd = decline ? prominence(decline.style) : null;
      if (pa !== null && pd !== null && pd > 0) prominenceRatio = pa / pd;
    }
    return { ...c, userTapped: typeof c.id === 'string' && tapped.has(c.id), prominenceRatio };
  });

  const cues = itemsOf(snapshot, 'cues').map((cue) => {
    const sameKey = all
      .map((s) => itemsOf(s, 'cues').find((x) => x.cueKey === cue.cueKey))
      .filter((x): x is JsonObject => x !== undefined);
    let resetCount = 0;
    for (let i = 1; i < sameKey.length; i++) {
      const prev = sameKey[i - 1]!;
      const cur = sameKey[i]!;
      const pv = asNumber(prev.value);
      const cv = asNumber(cur.value);
      const sameOffer = (asString(prev.offerRef) ?? null) === (asString(cur.offerRef) ?? null);
      if (pv !== null && cv !== null && cv > pv && sameOffer) resetCount++;
    }
    let timesShownAfterDismiss = 0;
    const promptId = asString(cue.promptId);
    if (promptId !== null) {
      const dismissals = taps
        .filter((t) => t.action === 'dismiss' && t.controlId === promptId)
        .map((t) => instant(t.at))
        .filter((x): x is number => x !== null);
      if (dismissals.length > 0) {
        const t0 = Math.min(...dismissals);
        // A page counts if the prompt first appeared on it after the dismissal.
        timesShownAfterDismiss = all.filter((s) => {
          const shown = itemsOf(s, 'cues').find((x) => x.promptId === promptId);
          const at = shown ? instant(shown.firstSeenAt ?? s.capturedAt) : null;
          return at !== null && at > t0;
        }).length;
      }
    }
    return { ...cue, observations: sameKey.length, resetCount, timesShownAfterDismiss };
  });

  const cards = itemsOf(snapshot, 'cards').map((card) => {
    let labelProminence: number | null = null;
    const ls = card.sponsoredLabelStyle;
    const cs = card.cardTextStyle;
    if (card.sponsored === 'labelled' && isObject(ls) && isObject(cs)) {
      const lf = asNumber(ls.fontSize);
      const lc = asNumber(ls.contrast);
      const cf = asNumber(cs.fontSize);
      const cc = asNumber(cs.contrast);
      if (lf !== null && lc !== null && cf !== null && cc !== null && cf * cc > 0) {
        labelProminence = (lf * lc) / (cf * cc);
      }
    }
    return { ...card, labelProminence };
  });

  return { snapshot: { ...snapshot, fees, lineItems, controls, cues, cards }, derived };
}

export const STAGE_RANK = RANK;
