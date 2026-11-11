/**
 * Price history from observations FairCart actually made. A "30-day low" is
 * only reported when observations cover the full 30 days without long gaps;
 * otherwise the UI says how long tracking has run. Nothing is interpolated.
 */

export interface Observation {
  /** ISO timestamp. */
  at: string;
  price: number;
  mrp: number | null;
  seller?: string;
  variantLabel?: string;
  source: 'device' | 'demo';
}

export interface HistoryStats {
  count: number;
  distinctDays: number;
  current: Observation | null;
  /** Days since the first observation (fractional). */
  trackingDays: number;
  /** Largest gap in days between consecutive observations inside the window. */
  maxGapDays: number;
  full30: boolean;
  low30: number | null;
  high30: number | null;
  median30: number | null;
  lowestSeen: number | null;
  highestSeen: number | null;
  /** current − lowest in window (or lowest seen when not full). */
  aboveLow: number | null;
  /** Whether the shown MRP-based discount is backed by a higher observed price. */
  discountCheck: 'supported' | 'not_supported' | 'insufficient_data' | 'no_claim';
  message: string;
  points: { at: string; price: number }[];
}

const DAY = 86_400_000;
export const FULL_WINDOW_DAYS = 30;
export const MAX_GAP_DAYS = 3;
export const MIN_MEDIAN_DAYS = 7;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function computeHistory(all: Observation[], now: Date): HistoryStats {
  const obs = all.filter((o) => o.source === 'device').sort((a, b) => a.at.localeCompare(b.at));
  const t = now.getTime();
  const empty: HistoryStats = {
    count: 0, distinctDays: 0, current: null, trackingDays: 0, maxGapDays: 0, full30: false,
    low30: null, high30: null, median30: null, lowestSeen: null, highestSeen: null, aboveLow: null,
    discountCheck: 'insufficient_data', message: 'FairCart has not recorded a price for this product yet.', points: [],
  };
  if (obs.length === 0) return empty;

  const first = Date.parse(obs[0]!.at);
  const current = obs[obs.length - 1]!;
  const trackingDays = Math.max(0, (t - first) / DAY);
  const windowStart = t - FULL_WINDOW_DAYS * DAY;
  const inWindow = obs.filter((o) => Date.parse(o.at) >= windowStart);
  // Gaps: include the window start (if tracking began before it) and "now" as boundaries.
  const stamps = inWindow.map((o) => Date.parse(o.at));
  const bounds = [first < windowStart ? windowStart : stamps[0]!, ...stamps, t];
  let maxGap = 0;
  for (let i = 1; i < bounds.length; i++) maxGap = Math.max(maxGap, (bounds[i]! - bounds[i - 1]!) / DAY);
  // Observations just before the window carry their price into it.
  const carried = obs.filter((o) => Date.parse(o.at) < windowStart).at(-1);
  const windowPrices = [...(carried ? [carried.price] : []), ...inWindow.map((o) => o.price)];
  const days = new Set(obs.map((o) => o.at.slice(0, 10)));
  const windowDays = new Set(inWindow.map((o) => o.at.slice(0, 10)));
  const full30 = trackingDays >= FULL_WINDOW_DAYS && maxGap <= MAX_GAP_DAYS;
  const prices = obs.map((o) => o.price);
  const lowestSeen = Math.min(...prices);
  const highestSeen = Math.max(...prices);
  const low30 = full30 ? Math.min(...windowPrices) : null;
  const high30 = full30 ? Math.max(...windowPrices) : null;
  const median30 = full30 && windowDays.size >= MIN_MEDIAN_DAYS ? median(windowPrices) : null;

  let discountCheck: HistoryStats['discountCheck'] = 'no_claim';
  if (current.mrp !== null && current.mrp > current.price) {
    if (!full30) discountCheck = 'insufficient_data';
    else discountCheck = high30! > current.price ? 'supported' : 'not_supported';
  }

  const whole = Math.floor(trackingDays);
  const message = full30
    ? `Based on ${inWindow.length} observation${inWindow.length === 1 ? '' : 's'} over the last 30 days.`
    : obs.length === 1
      ? 'FairCart has seen this price once. History builds each time this page is opened.'
      : trackingDays >= FULL_WINDOW_DAYS
        ? `Tracking for ${whole} days, but with gaps longer than ${MAX_GAP_DAYS} days, so a reliable 30-day low isn't available.`
        : `Tracking began ${whole === 0 ? 'today' : whole === 1 ? '1 day ago' : `${whole} days ago`}. A full 30-day low is not available yet.`;

  return {
    count: obs.length,
    distinctDays: days.size,
    current,
    trackingDays,
    maxGapDays: Math.round(maxGap * 10) / 10,
    full30,
    low30,
    high30,
    median30,
    lowestSeen,
    highestSeen,
    aboveLow: current.price - (low30 ?? lowestSeen),
    discountCheck,
    message,
    points: obs.map((o) => ({ at: o.at, price: o.price })),
  };
}

/** Whether a new observation is worth storing: price changed, or 30+ minutes since the last one. */
export function shouldRecord(last: Observation | undefined, next: Observation): boolean {
  if (!last) return true;
  if (last.price !== next.price || last.mrp !== next.mrp || last.seller !== next.seller) return true;
  return Date.parse(next.at) - Date.parse(last.at) >= 30 * 60_000;
}
