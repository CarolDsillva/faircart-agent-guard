import type { ScreenSnapshot, TapEvent } from '@faircart/schemas';

/**
 * Per-tab shopping journey (architecture §Journey comparison). Pure reducer so
 * it can be tested without Chrome. Journeys hold at most MAX_SNAPSHOTS
 * snapshots, without element refs, and reset when the retailer changes or the
 * tab sits idle for two hours.
 */
export interface Journey {
  id: string;
  retailer: string;
  startedAt: string;
  lastAt: string;
  /** pageId of each stored snapshot, parallel to `snapshots`. */
  pageIds: string[];
  snapshots: ScreenSnapshot[];
  taps: TapEvent[];
}

export const MAX_SNAPSHOTS = 12;
export const MAX_TAPS = 100;
export const IDLE_RESET_MS = 2 * 60 * 60 * 1000;

/** Remove element refs and long free text before a snapshot is kept in the journey. */
export function stripForJourney(s: ScreenSnapshot): ScreenSnapshot {
  return JSON.parse(
    JSON.stringify(s, (k, v) => {
      if (k === 'elRef') return undefined;
      if (typeof v === 'string' && v.length > 200) return v.slice(0, 200);
      return v;
    }),
  );
}

export function needsNewJourney(prev: Journey | undefined, retailer: string, now: number): boolean {
  return !prev || prev.retailer !== retailer || now - Date.parse(prev.lastAt) > IDLE_RESET_MS;
}

/**
 * Add a snapshot. A re-scan of the same page instance (same pageId) replaces
 * that page's last snapshot; a new page load appends. Returns the journey and
 * the earlier snapshots to evaluate against (excluding this page's own entry).
 */
export function addSnapshot(
  prev: Journey | undefined,
  snap: ScreenSnapshot,
  pageId: string,
  newId: () => string,
): { journey: Journey; earlier: ScreenSnapshot[]; current: ScreenSnapshot } {
  const now = Date.parse(snap.capturedAt);
  const fresh = needsNewJourney(prev, snap.platform, now);
  const base: Journey = fresh
    ? { id: newId(), retailer: snap.platform, startedAt: snap.capturedAt, lastAt: snap.capturedAt, pageIds: [], snapshots: [], taps: [] }
    : { ...prev!, pageIds: [...prev!.pageIds], snapshots: [...prev!.snapshots], taps: [...prev!.taps] };

  const lastIdx = base.pageIds.length - 1;
  const samePage = lastIdx >= 0 && base.pageIds[lastIdx] === pageId;
  const current = samePage ? mergePageView(base.snapshots[lastIdx]!, snap) : { ...snap, cues: snap.cues.map((c) => ({ ...c, firstSeenAt: c.firstSeenAt ?? snap.capturedAt })) };
  const stored = stripForJourney({ ...current, journeyId: base.id });
  if (samePage) {
    base.snapshots[lastIdx] = stored;
  } else {
    base.pageIds.push(pageId);
    base.snapshots.push(stored);
  }
  while (base.snapshots.length > MAX_SNAPSHOTS) {
    base.snapshots.shift();
    base.pageIds.shift();
  }
  base.lastAt = snap.capturedAt;
  const earlier = base.snapshots.slice(0, base.snapshots.length - 1);
  return { journey: base, earlier, current: { ...current, journeyId: base.id } };
}

/**
 * A rescan of the same page view keeps when each cue first appeared, and keeps
 * prompts that were shown earlier on this page even after the shopper closed
 * them: a dismissed pop-up was still shown.
 */
function mergePageView(prior: ScreenSnapshot, next: ScreenSnapshot): ScreenSnapshot {
  const priorByKey = new Map(prior.cues.map((c) => [c.cueKey, c]));
  const cues: ScreenSnapshot['cues'] = next.cues.map((c) => ({ ...c, firstSeenAt: priorByKey.get(c.cueKey)?.firstSeenAt ?? c.firstSeenAt ?? next.capturedAt }));
  for (const p of prior.cues) {
    if (p.kind === 'prompt' && !cues.some((c) => c.cueKey === p.cueKey)) cues.push(p);
  }
  return { ...next, cues };
}

export function addTap(j: Journey, tap: TapEvent): Journey {
  const taps = [...j.taps, tap].slice(-MAX_TAPS);
  return { ...j, taps };
}
