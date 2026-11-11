import type { Mandate, Reason } from '@faircart/guard';
import { formatInr } from '@faircart/money';
import type { Finding, ScreenSnapshot } from '@faircart/schemas';

/**
 * What the planner sees: a compact description of the page, never HTML. The
 * trusted part (mandate, FairCart findings, guard reasons) is kept apart from
 * everything the page itself says, which goes in `page`.
 */
export interface PageBrief {
  mandate: { product: string; maxTotal: string; allowedFees: string[]; approvedByHuman: string[] };
  findings: { ruleId: string; category: string; title: string; severity: string }[];
  lastGuard: { code: string; label: string; amount?: string; fixable: boolean }[] | null;
  page: {
    stage: string;
    product: { title: string; sku?: string } | null;
    price: number | null;
    lineItems: { id: string; title: string; amount: number | null; type: string }[];
    fees: { id: string; label: string; amount: number | null }[];
    total: number | null;
    controls: { id: string; kind: string; label: string; checked: boolean | null; role: string }[];
    prompts: { promptId: string; text: string }[];
    otherCues: { kind: string; text: string }[];
  };
}

export function buildBrief(input: { mandate: Mandate; snapshot: ScreenSnapshot; findings: Finding[]; lastGuard: Reason[] | null }): PageBrief {
  const { mandate: m, snapshot: s } = input;
  return {
    mandate: {
      product: m.want.title,
      maxTotal: formatInr(m.maxTotalPaise),
      allowedFees: m.allowedFees,
      approvedByHuman: m.amendments.flatMap((a) => a.approved.map((x) => `${x.label} ${formatInr(x.paise)}`)),
    },
    findings: input.findings.map((f) => ({ ruleId: f.ruleId, category: f.category, title: f.title, severity: f.severity })),
    lastGuard: input.lastGuard?.map((r) => ({ code: r.code, label: r.label, ...(r.paise !== undefined ? { amount: formatInr(r.paise) } : {}), fixable: r.fixable })) ?? null,
    page: {
      stage: s.stage,
      product: s.product ? { title: s.product.title, sku: s.product.retailerSku } : null,
      price: s.prices.find((p) => p.kind === 'listed')?.amount ?? null,
      lineItems: s.lineItems.map((l) => ({ id: l.id, title: l.title, amount: l.amount, type: l.itemType })),
      fees: s.fees.map((f) => ({ id: f.id, label: f.label, amount: f.amount })),
      total: s.total,
      controls: s.controls.map((c) => ({ id: c.id, kind: c.kind, label: c.label, checked: c.checked, role: c.role })),
      prompts: s.cues.filter((c) => c.kind === 'prompt' && c.promptId).map((c) => ({ promptId: c.promptId!, text: c.text })),
      otherCues: s.cues.filter((c) => c.kind !== 'prompt').map((c) => ({ kind: c.kind, text: c.text })),
    },
  };
}
