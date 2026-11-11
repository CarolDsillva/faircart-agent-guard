import type { Bill, BillRow } from '@faircart/adapters';
import type { Finding, ScreenSnapshot } from '@faircart/schemas';
import type { Mandate } from '@faircart/guard';

export const TITLE = 'Sunrise Chakki Atta 5 kg';
export const SECRET = 'test-secret';
export const NOW = new Date('2026-11-12T10:00:00Z');

export function mandate(over: Partial<Mandate> = {}): Mandate {
  return {
    version: 1,
    signedAt: '2026-11-12T09:59:00Z',
    want: { sku: 'DEMO-ATTA-5KG', title: TITLE, maxQuantity: 1 },
    maxTotalPaise: 35000,
    allowedFees: ['delivery'],
    autopay: false,
    amendments: [],
    ...over,
  };
}

const row = (label: string, amount: number | null, kind: BillRow['kind'], extra: Partial<BillRow> = {}): BillRow => ({
  label,
  amount,
  kind,
  free: false,
  elRef: `fc-${label}`,
  ...extra,
});

/** DemoMart's payment page bill, as the bill reader produces it. */
export function demoBill(o: { protection?: boolean; pass?: boolean; hidden?: boolean; handling?: number; platform?: boolean } = {}): Bill {
  const rows: BillRow[] = [row(`5 kg${TITLE}Qty 1`, 289, 'item'), row('Item total', 289, 'subtotal')];
  if (o.protection) rows.push(row('Freshness protection (1 year)', 49, 'service'));
  if (o.pass) rows.push(row('Demo Pass (3 months)', 99, 'membership'));
  rows.push(row('Delivery charge', 0, 'fee', { feeKind: 'delivery', free: true }));
  const handling = o.handling ?? 15;
  if (handling) rows.push(row('Handling charge', handling, 'fee', { feeKind: 'handling' }));
  if (o.platform !== false) rows.push(row('Platform fee', 9, 'fee', { feeKind: 'platform' }));
  const computed = rows.filter((r) => r.kind !== 'subtotal').reduce((s, r) => s + (r.free ? 0 : r.amount ?? 0), 0);
  const displayed = computed + (o.hidden ? 10 : 0);
  rows.push(row('To pay', displayed, 'total'));
  return { rows, displayedTotal: displayed, computedTotal: computed, difference: displayed - computed, unreadable: [] };
}

/** FairMart's honest bill: item and free delivery only. */
export function honestBill(): Bill {
  const rows = [row(`5 kg${TITLE}Qty 1`, 289, 'item'), row('Item total', 289, 'subtotal'), row('Delivery charge', 0, 'fee', { feeKind: 'delivery', free: true }), row('To pay', 289, 'total')];
  return { rows, displayedTotal: 289, computedTotal: 289, difference: 0, unreadable: [] };
}

export function snapshot(controls: { id: string; label: string }[] = []): ScreenSnapshot {
  return {
    schemaVersion: 1,
    snapshotId: 's1',
    journeyId: 'j1',
    platform: 'generic',
    surface: 'web',
    stage: 'checkout',
    capturedAt: NOW.toISOString(),
    adapterId: 'generic:generic',
    adapterVersion: 'test',
    readability: 'full',
    prices: [],
    fees: [],
    lineItems: [],
    controls: controls.map((c) => ({ id: c.id, kind: 'link', label: c.label, checked: null, role: 'other' })),
    cues: [],
    cards: [],
    total: null,
  } as ScreenSnapshot;
}

export function finding(category: string, id = `f-${category}`): Finding {
  return { id, ruleId: 'X', category } as unknown as Finding;
}
