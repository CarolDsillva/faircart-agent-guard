/** Viewport-aware placement that keeps floating UI off the element being discussed. */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const M = 10;

export function rectOf(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function clamp(b: Box): Box {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return { ...b, x: Math.min(Math.max(M, b.x), vw - b.w - M), y: Math.min(Math.max(M, b.y), vh - b.h - M) };
}

/**
 * Place a w×h box next to `anchor`, trying right, left, below, above, and
 * returning the first candidate that fits without covering the anchor or any
 * box in `avoid` (e.g. the primary buy button).
 */
export function placeBeside(anchor: Box, w: number, h: number, avoid: Box[] = [], gap = 10): Box {
  const candidates: Box[] = [
    { x: anchor.x + anchor.w + gap, y: anchor.y, w, h },
    { x: anchor.x - w - gap, y: anchor.y, w, h },
    { x: anchor.x, y: anchor.y + anchor.h + gap, w, h },
    { x: anchor.x, y: anchor.y - h - gap, w, h },
  ];
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  for (const c of candidates) {
    const fits = c.x >= M && c.y >= M && c.x + w <= vw - M && c.y + h <= vh - M;
    const cc = clamp(c);
    if (fits && !overlaps(cc, anchor) && !avoid.some((a) => overlaps(cc, a))) return cc;
  }
  for (const c of candidates) {
    const cc = clamp(c);
    if (!overlaps(cc, anchor)) return cc;
  }
  return clamp(candidates[0]!);
}

/** Primary purchase controls on the page, which FairCart UI must never cover. */
export function primaryButtons(): Box[] {
  const sel = '#add-to-cart-button, #buy-now-button, input[name="proceedToRetailCheckout"], button[type="submit"]';
  const out: Box[] = [];
  for (const el of document.querySelectorAll(sel)) out.push(rectOf(el));
  for (const el of document.querySelectorAll('button')) {
    const t = (el.textContent ?? '').trim().toLowerCase();
    if (/^(add to cart|buy now|place order|proceed to (pay|buy|checkout)|pay now|checkout)$/.test(t)) out.push(rectOf(el));
  }
  return out.filter((b) => b.w > 0 && b.h > 0).slice(0, 8);
}
