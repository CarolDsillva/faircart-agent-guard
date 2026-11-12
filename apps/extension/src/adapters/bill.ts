import type { ControlFact, FeeFact, LineItem } from '@faircart/schemas';
import type { Bill, BillRow, RefRegistry } from './types';
import { cleanText, isVisible, parseRupees, rupeeCount } from './util';

/**
 * Generic, read-only bill reader for cart and checkout summaries on any enabled
 * site. It finds "label … ₹amount" rows, groups them under the container that
 * holds a total, classifies each line and checks the arithmetic. It never
 * clicks, unticks or changes anything.
 */

const TOTAL = /^(order total|grand total|total amount|amount payable|total payable|to pay|bill total|net payable|total)\b/i;
const SUBTOTAL = /(items?\s*total|sub\s*-?total|item\(s\) total|price\s*\(\d+\s*items?\)|mrp total|bag total|cart value|base fare|fare total|items?:?$)/i;
const DISCOUNT = /(discount|savings?|coupon|promo|offer applied|you save|off\b)/i;
const FEES: [RegExp, FeeFact['kind']][] = [
  [/handling/i, 'handling'],
  [/platform/i, 'platform'],
  [/packag/i, 'packaging'],
  [/small\s*(cart|order|basket)/i, 'small_cart'],
  [/(surge|rain|late.?night|high demand|peak)/i, 'surge'],
  [/convenience/i, 'convenience'],
  [/(cash on delivery|\bcod\b)/i, 'cod'],
  [/\btip\b|tip for|delivery partner tip/i, 'tip'],
  [/(donat|charity|feeding india|contribution)/i, 'donation'],
  [/(delivery|shipping)/i, 'delivery'],
  [/\b(fee|charge|charges)\b/i, 'other'],
];
const MEMBERSHIP = /\b(pass|membership|plus|prime|one|vip|super)\b/i;
const SERVICE = /\b(protect|protection|warranty|insurance|assurance|care plan|installation)\b/i;
const FREE = /^free$|\bfree\b/i;
const FREE_WORD = /\bfree\b/gi;
const FEE_WORD = /\b(fee|charge)s?\b/i;

function classify(label: string, amount: number | null): Pick<BillRow, 'kind' | 'feeKind'> {
  if (TOTAL.test(label) && !SUBTOTAL.test(label)) return { kind: 'total' };
  if (SUBTOTAL.test(label)) return { kind: 'subtotal' };
  if ((amount !== null && amount < 0) || DISCOUNT.test(label)) return { kind: 'discount' };
  // Memberships and protection plans before fees: "Delivery pass" is a membership, not a delivery fee.
  if (SERVICE.test(label)) return { kind: 'service' };
  if (MEMBERSHIP.test(label) && !FEE_WORD.test(label)) return { kind: 'membership' };
  for (const [re, k] of FEES) if (re.test(label)) return { kind: 'fee', feeKind: k };
  return { kind: 'item' };
}

interface RawRow {
  el: Element;
  label: string;
  amount: number | null;
  free: boolean;
}

/** Find the smallest elements whose text is "<label> <one amount or FREE>". */
function candidateRows(root: ParentNode): RawRow[] {
  const rows: RawRow[] = [];
  for (const el of root.querySelectorAll('div, li, tr, p, section')) {
    if (el.closest('[data-faircart-ui], script, style')) continue;
    const t = cleanText(el.textContent);
    if (t.length < 3 || t.length > 120) continue;
    const count = rupeeCount(t);
    const hasFree = FREE.test(t);
    if (count === 0 && !hasFree) continue;
    if (count > 2) continue;
    // Skip if a child already forms a complete row (we want the tightest row).
    const childIsRow = [...el.children].some((c) => {
      const ct = cleanText(c.textContent);
      return ct.length >= 3 && (rupeeCount(ct) >= 1 || FREE.test(ct)) && /[A-Za-z]{3,}/.test(ct.replace(/(?:₹|Rs\.?|US\$|\$)\s*[\d,.]+/g, '').replace(FREE_WORD, ''));
    });
    if (childIsRow) continue;
    // Label = text without amounts; must contain words.
    const label = cleanText(t.replace(/(?:[-−]\s*)?(?:₹|Rs\.?|US\$|\$)\s*[\d,]+(?:\.\d+)?/gi, ' ').replace(/\bfree\b/gi, ' ')).replace(/[:\-–]+$/, '').trim();
    if (!/[A-Za-z]{3,}/.test(label) || label.length > 70) continue;
    // When two amounts appear (struck original + current), the last one is what is charged.
    const amounts = [...t.matchAll(/([-−])?\s*(?:₹|Rs\.?|US\$|\$)\s*([\d,]+(?:\.\d+)?)/gi)].map((m) => (m[1] ? -1 : 1) * Number(m[2]!.replace(/,/g, '')));
    const free = hasFree && (count === 0 || /free\s*$/i.test(t) || /(?:₹|Rs\.?|US\$|\$)\s*[\d,]+(?:\.\d+)?\s*free/i.test(t));
    const amount = free ? 0 : (amounts.at(-1) ?? null);
    rows.push({ el, label, amount: amount !== null && Number.isFinite(amount) ? amount : null, free });
  }
  return rows;
}

function commonAncestor(a: Element, b: Element): Element | null {
  const set = new Set<Element>();
  for (let x: Element | null = a; x; x = x.parentElement) set.add(x);
  for (let y: Element | null = b; y; y = y.parentElement) if (set.has(y)) return y;
  return null;
}

export interface BillRead {
  bill: Bill | null;
  fees: FeeFact[];
  lineItems: LineItem[];
}

export function readBill(root: ParentNode, refs: RefRegistry): BillRead {
  const raw = candidateRows(root).filter((r) => isVisible(r.el));
  const totals = raw.filter((r) => classify(r.label, r.amount).kind === 'total');
  if (totals.length === 0) return { bill: null, fees: [], lineItems: [] };

  // Use the last total on the page (summaries usually end with it) and keep rows sharing its container.
  const totalRow = totals[totals.length - 1]!;
  // The summary is the nearest ancestor (within 5 levels) holding the most bill rows.
  let container: Element | null = null;
  let best = 0;
  let cur: Element | null = totalRow.el.parentElement;
  for (let hops = 0; cur && cur !== root && hops < 5; hops++, cur = cur.parentElement) {
    const n = raw.filter((r) => cur!.contains(r.el)).length;
    if (n > best) {
      best = n;
      container = cur;
    }
  }
  const group = raw.filter((r) => (container ? container.contains(r.el) : r === totalRow));
  // Drop nested duplicates (a row inside another row).
  const rowsRaw = group.filter((r) => !group.some((o) => o !== r && o.el.contains(r.el) && o.label === r.label));

  const rows: BillRow[] = rowsRaw.map((r) => {
    const c = classify(r.label, r.amount);
    const kindHover = c.kind === 'total' ? 'total' : c.kind === 'fee' ? 'fee' : c.kind === 'membership' ? 'membership' : 'price';
    return { label: r.label, amount: r.amount, free: r.free, ...c, elRef: refs.tag(r.el, kindHover) };
  });

  const total = rows.filter((r) => r.kind === 'total').at(-1)?.amount ?? null;
  const unreadable = rows.filter((r) => r.amount === null).map((r) => r.label);
  const subtotal = rows.find((r) => r.kind === 'subtotal')?.amount ?? null;
  const parts = rows.filter((r) => r.kind !== 'total' && r.kind !== 'subtotal');
  let computed: number | null = null;
  if (unreadable.length === 0) {
    const sum = (rs: BillRow[]) => rs.reduce((s, r) => s + (r.amount ?? 0), 0);
    const isGoods = (r: BillRow) => r.kind === 'item' || r.kind === 'membership' || r.kind === 'service';
    // With a subtotal, item lines before it are already counted in it; paid add-ons listed after it are not.
    const subIdx = rows.findIndex((r) => r.kind === 'subtotal');
    const goods = subtotal !== null ? subtotal + sum(rows.slice(subIdx + 1).filter((r) => r.kind === 'membership' || r.kind === 'service')) : sum(parts.filter(isGoods));
    const fees = sum(parts.filter((r) => r.kind === 'fee'));
    const discounts = parts.filter((r) => r.kind === 'discount').reduce((s, r) => s - Math.abs(r.amount ?? 0), 0);
    computed = Math.round((goods + fees + discounts) * 100) / 100;
  }
  const difference = total !== null && computed !== null ? Math.round((total - computed) * 100) / 100 : null;

  const fees: FeeFact[] = rows
    .filter((r) => r.kind === 'fee' && r.feeKind)
    .map((r, i) => ({
      id: `fee-${r.feeKind}-${i}`,
      kind: r.feeKind!,
      amount: r.amount,
      label: r.label,
      mandatory: r.feeKind === 'tip' || r.feeKind === 'donation' ? false : r.free ? null : true,
      context: 'line' as const,
      elRef: r.elRef,
    }));
  const lineItems: LineItem[] = rows
    .filter((r) => r.kind === 'membership' || r.kind === 'service')
    .map((r, i) => ({
      id: `li-${r.kind}-${i}-${r.label.slice(0, 20).toLowerCase().replace(/\W+/g, '-')}`,
      title: r.label,
      quantity: 1,
      amount: r.amount,
      paid: (r.amount ?? 0) > 0,
      itemType: r.kind === 'membership' ? ('membership' as const) : ('protection' as const),
      origin: 'unknown' as const,
      elRef: r.elRef,
    }));

  return { bill: { rows, displayedTotal: total, computedTotal: computed, difference, unreadable }, fees, lineItems };
}

/**
 * Checkboxes and switches anywhere on the page: priced ones become paid add-ons
 * (warranty, pass, tip, donation); unpriced ones with a real label become
 * consent controls, so wording rules (trick questions) can read them.
 */
export function readAddOnControls(root: ParentNode, refs: RefRegistry): ControlFact[] {
  const out: ControlFact[] = [];
  for (const input of root.querySelectorAll('input[type="checkbox"], [role="checkbox"], [role="switch"]')) {
    if (input.closest('[data-faircart-ui]')) continue;
    const labelEl = input.closest('label') ?? (input.id ? root.querySelector(`label[for="${CSS.escape(input.id)}"]`) : null) ?? input.parentElement;
    const label = cleanText(labelEl?.textContent).slice(0, 140);
    const amount = parseRupees(label);
    if (!label || !/[A-Za-z]{3,}/.test(label)) continue;
    // tagName, not instanceof: the page may live in another frame (the Agent Guard console reads an iframe).
    const checked = input.tagName === 'INPUT' ? (input as HTMLInputElement).checked : input.getAttribute('aria-checked') === 'true';
    const id = input.id || `${amount ? 'addon' : 'consent'}-${out.length + 1}-${label.slice(0, 16).toLowerCase().replace(/\W+/g, '-')}`;
    const kind = input.getAttribute('role') === 'switch' ? 'toggle' : 'checkbox';
    if (amount !== null && amount > 0) {
      out.push({ id, kind, label, checked, role: 'add_on', paidAmount: amount, elRef: refs.tag(labelEl ?? input, 'addon') });
    } else if (label.length >= 12) {
      // Unpriced checkboxes are consent-style choices (marketing, WhatsApp updates, terms).
      out.push({ id, kind, label, checked, role: 'consent', elRef: refs.ref(labelEl ?? input) });
    }
  }
  return out;
}
