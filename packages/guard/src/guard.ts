import type { Bill, BillRow } from '@faircart/adapters';
import { INR_PER_USD, paiseToUsdCents, toPaise } from '@faircart/money';
import type { Finding, ScreenSnapshot } from '@faircart/schemas';
import { AUTHZ_TTL_MS, signAuthorization, type Authorization, type AuthorizationLine } from './authz';
import { isApproved, type Mandate } from './mandate';

export type ReasonCode =
  | 'UNREQUESTED_ITEM'
  | 'FEE_NOT_ALLOWED'
  | 'UNEXPLAINED_AMOUNT'
  | 'UNREADABLE_AMOUNT'
  | 'ARITHMETIC'
  | 'OVER_BUDGET'
  | 'MONEY_FINDING'
  | 'PAYPAL_ORDER_MISMATCH';

export interface Reason {
  code: ReasonCode;
  label: string;
  /** The bill line this reason is about, verbatim, when there is one. */
  subject?: string;
  paise?: number;
  findingId?: string;
  fixable: boolean;
}

export type GuardResult = { verdict: 'PASS'; authorization: Authorization } | { verdict: 'BLOCK'; reasons: Reason[] };

export interface GuardInput {
  mandate: Mandate;
  snapshot: ScreenSnapshot;
  bill: Bill | null;
  findings: Finding[];
  runId: string;
  now: Date;
  secret: string;
}

/** Taxonomy categories that cost the shopper money. */
export const MONEY_CATEGORIES = ['basket_sneaking', 'drip_pricing', 'subscription_trap'] as const;
/** Money categories the line-by-line checks already enforce, so their findings don't block twice. */
const ENFORCED_BY_LINES = new Set(['basket_sneaking', 'drip_pricing']);

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const amountOf = (r: BillRow) => (r.free ? 0 : toPaise(r.amount ?? 0));

/** A page control that removes this line: "Remove freshness protection" for "Freshness protection (1 year)". */
function hasRemoveControl(snapshot: ScreenSnapshot, label: string): boolean {
  const first = norm(label).split(/[^a-z0-9]+/)[0] ?? '';
  return snapshot.controls.some((c) => /\bremove\b/i.test(c.label) && first.length > 2 && norm(c.label).includes(first));
}

/** A page control for questioning the bill, the only fix for an amount nobody explains. */
function hasBillQuery(snapshot: ScreenSnapshot): boolean {
  return snapshot.controls.some((c) => /\bbill|charge\b/i.test(c.label) && /question|help|dispute|recogni[sz]e/i.test(c.label));
}

/**
 * Decide whether money may move. Pure: it re-adds the bill itself, never trusts
 * the browser's arithmetic, and takes nothing from the planner.
 */
export function guard(input: GuardInput): GuardResult {
  const { mandate, snapshot, bill, findings } = input;
  const reasons: Reason[] = [];
  if (!bill || bill.displayedTotal === null) {
    return { verdict: 'BLOCK', reasons: [{ code: 'UNREADABLE_AMOUNT', label: 'No bill with a total could be read on this page', fixable: false }] };
  }

  for (const label of bill.unreadable) reasons.push({ code: 'UNREADABLE_AMOUNT', label: `Amount for "${label}" could not be read`, fixable: false });

  const items = bill.rows.filter((r) => r.kind === 'item');
  const want = norm(mandate.want.title);
  const productRows = items.filter((r) => norm(r.label).includes(want));
  // The product is the item line that names it; otherwise the subtotal (fare-style bills show it as "Base fare").
  const productRow = productRows[0] ?? bill.rows.find((r) => r.kind === 'subtotal');
  const lines: AuthorizationLine[] = [];
  let computed = 0;

  if (!productRow || productRow.amount === null) {
    reasons.push({ code: 'UNREQUESTED_ITEM', label: `The basket doesn't show "${mandate.want.title}"`, fixable: false });
  } else {
    const paise = amountOf(productRow);
    computed += paise;
    lines.push({ label: mandate.want.title, kind: 'product', qty: 1, paise, usdCents: paiseToUsdCents(paise) });
  }

  for (const r of bill.rows) {
    if (r === productRow || r.kind === 'subtotal' || r.kind === 'total') continue;
    if (r.amount === null && !r.free) {
      reasons.push({ code: 'UNREADABLE_AMOUNT', label: `Amount for "${r.label}" could not be read`, fixable: false });
      continue;
    }
    const paise = amountOf(r);
    if (r.kind === 'discount') {
      computed -= Math.abs(paise);
      continue;
    }
    computed += paise;
    if (r.kind === 'item' || r.kind === 'service' || r.kind === 'membership') {
      reasons.push({ code: 'UNREQUESTED_ITEM', label: `"${r.label}" is not what you asked for`, subject: r.label, paise, fixable: hasRemoveControl(snapshot, r.label) });
      continue;
    }
    if (r.kind === 'fee' && paise > 0) {
      const kind = r.feeKind ?? 'other';
      const cap = mandate.feeCapsPaise?.[kind];
      const allowed = (mandate.allowedFees.includes(kind) && (cap === undefined || paise <= cap)) || isApproved(mandate, r.label, paise);
      if (allowed) lines.push({ label: r.label, kind: 'fee', qty: 1, paise, usdCents: paiseToUsdCents(paise) });
      else reasons.push({ code: 'FEE_NOT_ALLOWED', label: `"${r.label}" wasn't in your instructions`, subject: r.label, paise, fixable: hasRemoveControl(snapshot, r.label) });
    }
  }

  const displayed = toPaise(bill.displayedTotal);
  const gap = displayed - computed;
  if (gap !== 0) {
    reasons.push({ code: 'UNEXPLAINED_AMOUNT', label: `The total includes ${gap > 0 ? 'an extra' : 'a missing'} amount no line explains`, paise: Math.abs(gap), fixable: hasBillQuery(snapshot) });
  }
  if (displayed > mandate.maxTotalPaise) {
    reasons.push({ code: 'OVER_BUDGET', label: 'The total is over your budget', paise: displayed, fixable: false });
  }
  for (const f of findings) {
    if ((MONEY_CATEGORIES as readonly string[]).includes(f.category) && !ENFORCED_BY_LINES.has(f.category)) {
      reasons.push({ code: 'MONEY_FINDING', label: f.title ?? f.category, findingId: f.id, fixable: false });
    }
  }

  if (reasons.length) return { verdict: 'BLOCK', reasons };

  const totalPaise = lines.reduce((s, l) => s + l.paise, 0);
  if (totalPaise !== displayed) {
    return { verdict: 'BLOCK', reasons: [{ code: 'ARITHMETIC', label: 'The approved lines do not add up to the total', paise: displayed, fixable: false }] };
  }
  const issuedAt = input.now.toISOString();
  const authorization = signAuthorization(
    {
      id: crypto.randomUUID(),
      runId: input.runId,
      mandateVersion: mandate.version,
      lines,
      totalPaise,
      totalUsdCents: lines.reduce((s, l) => s + l.usdCents, 0),
      rate: { inrPerUsd: INR_PER_USD },
      issuedAt,
      expiresAt: new Date(input.now.getTime() + AUTHZ_TTL_MS).toISOString(),
    },
    input.secret,
  );
  return { verdict: 'PASS', authorization };
}
