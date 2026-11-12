/** DOM helpers shared by adapters. Pure functions of the document; no site mutations. */

export function cleanText(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

/** Visible-ish text of an element: skips <style>, <script> and <noscript> contents. */
export function text(el: Element | null | undefined): string {
  if (!el) return '';
  if (!el.querySelector('style, script, noscript')) return cleanText(el.textContent);
  const doc = el.ownerDocument;
  const walker = doc.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  let out = '';
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.parentElement?.closest('style, script, noscript')) out += n.textContent;
  }
  return cleanText(out);
}

/** "₹3,490.00", "Rs. 99", "₹ 15" → number. Returns null when no amount is present. */
export function parseRupees(s: string | null | undefined): number | null {
  const m = /(?:₹|Rs\.?|INR|US\$|USD|\$)\s*(-?[\d,]+(?:\.\d+)?)/i.exec(s ?? '');
  if (!m) return null;
  const n = Number(m[1]!.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Count of rupee amounts in a string. */
export function rupeeCount(s: string): number {
  return (s.match(/(?:₹|Rs\.?|US\$|\$)\s*-?[\d,]+/gi) ?? []).length;
}

export function isVisible(el: Element): boolean {
  if ((el as HTMLElement).hidden) return false;
  const view = el.ownerDocument.defaultView;
  if (!view) return true;
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    const cs = view.getComputedStyle(cur);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
  }
  return true;
}

function parseColor(c: string): [number, number, number, number] | null {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/.exec(c);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
}

function luminance([r, g, b]: [number, number, number, number]): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** WCAG contrast of an element's text against the first opaque background behind it (white if none). */
export function contrastOf(el: Element): number | null {
  const view = el.ownerDocument.defaultView;
  if (!view) return null;
  const fg = parseColor(view.getComputedStyle(el).color);
  if (!fg) return null;
  let bg: [number, number, number, number] = [255, 255, 255, 1];
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    const c = parseColor(view.getComputedStyle(cur).backgroundColor);
    if (c && c[3] > 0.5) {
      bg = c;
      break;
    }
  }
  const [l1, l2] = [luminance(fg), luminance(bg)].sort((a, b) => b - a) as [number, number];
  return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
}

export interface StyleFact {
  width: number;
  height: number;
  contrast: number;
  fontWeight: number;
  fontSize?: number;
}

export function styleOf(el: Element): StyleFact | undefined {
  const view = el.ownerDocument.defaultView;
  const contrast = contrastOf(el);
  if (!view || contrast === null) return undefined;
  const cs = view.getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const fontSize = parseFloat(cs.fontSize);
  const weight = cs.fontWeight === 'bold' ? 700 : cs.fontWeight === 'normal' ? 400 : Number(cs.fontWeight) || 400;
  return {
    width: Math.round(r.width),
    height: Math.round(r.height),
    contrast: Math.max(1, Math.min(21, contrast)),
    fontWeight: weight,
    ...(Number.isFinite(fontSize) && fontSize > 0 ? { fontSize } : {}),
  };
}

/** All JSON-LD objects on the page, flattened through arrays and @graph. */
export function jsonLd(doc: Document): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const visit = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      out.push(o);
      if (Array.isArray(o['@graph'])) visit(o['@graph']);
    }
  };
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      visit(JSON.parse(s.textContent ?? ''));
    } catch {
      /* malformed JSON-LD is common; ignore */
    }
  }
  return out;
}

export function ldType(o: Record<string, unknown>): string[] {
  const t = o['@type'];
  return Array.isArray(t) ? t.map(String) : t ? [String(t)] : [];
}

/**
 * Key/value pairs from spec tables and detail bullets ("Brand boAt", "Model Name: X").
 * First occurrence of a key wins.
 */
export function keyValues(root: ParentNode): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (k: string, v: string) => {
    const key = cleanText(k).replace(/[:‎‏]/g, '').trim().toLowerCase();
    const val = cleanText(v).replace(/^[:‎‏\s]+/, '');
    if (key && val && key.length < 40 && !(key in out)) out[key] = val;
  };
  for (const tr of root.querySelectorAll('tr')) {
    const cells = tr.querySelectorAll('th, td');
    if (cells.length >= 2) put(cells[0]!.textContent ?? '', cells[1]!.textContent ?? '');
  }
  for (const li of root.querySelectorAll('#detailBullets_feature_div li, .detail-bullet-list li')) {
    const t = cleanText(li.textContent).replace(/[‎‏]/g, '');
    const m = /^([^:]{2,40}?)\s*:\s*(.+)$/.exec(t);
    if (m) put(m[1]!, m[2]!);
  }
  return out;
}

/** "5 kg", "500 g", "1 L", "Pack of 2", "128 GB" → normalised quantity, if present. */
export function parseQuantity(s: string): { value: number; unit: string } | undefined {
  const m = /(\d+(?:\.\d+)?)\s*(kg|kilogram|g|gram|gm|l|litre|liter|ml|millilitre|gb|tb|count|pcs|pieces|pack)\b/i.exec(s);
  if (!m) return undefined;
  const value = Number(m[1]);
  const u = m[2]!.toLowerCase();
  const unit =
    u.startsWith('kilo') || u === 'kg' ? 'kg'
    : u.startsWith('gram') || u === 'gm' || u === 'g' ? 'g'
    : u === 'l' || u.startsWith('lit') ? 'L'
    : u === 'ml' || u.startsWith('milli') ? 'ml'
    : u === 'gb' ? 'GB'
    : u === 'tb' ? 'TB'
    : 'pc';
  return { value, unit };
}

export function hashString(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
