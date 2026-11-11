import { describe, expect, it } from 'vitest';
import { amendMandate, guard, type GuardResult } from '@faircart/guard';
import { demoBill, finding, honestBill, mandate, NOW, SECRET, snapshot } from './helpers';

const removeLinks = snapshot([
  { id: 'act:remove-freshness-protection', label: 'Remove freshness protection' },
  { id: 'act:remove-demo-pass', label: 'Remove demo pass' },
  { id: 'act:question-about-your-bill', label: 'Question about your bill?' },
]);

function run(opts: Partial<Parameters<typeof guard>[0]>): GuardResult {
  return guard({ mandate: mandate(), snapshot: removeLinks, bill: demoBill(), findings: [], runId: 'r1', now: NOW, secret: SECRET, ...opts });
}
const codes = (r: GuardResult) => (r.verdict === 'BLOCK' ? r.reasons.map((x) => x.code).sort() : []);

describe('guard', () => {
  it('blocks every trap on the full DemoMart bill', () => {
    const r = run({ bill: demoBill({ protection: true, pass: true, hidden: true }) });
    expect(r.verdict).toBe('BLOCK');
    expect(codes(r)).toEqual(['FEE_NOT_ALLOWED', 'FEE_NOT_ALLOWED', 'OVER_BUDGET', 'UNEXPLAINED_AMOUNT', 'UNREQUESTED_ITEM', 'UNREQUESTED_ITEM']);
    if (r.verdict !== 'BLOCK') return;
    const unexplained = r.reasons.find((x) => x.code === 'UNEXPLAINED_AMOUNT')!;
    expect(unexplained.paise).toBe(1000);
    expect(r.reasons.filter((x) => x.code === 'UNREQUESTED_ITEM').every((x) => x.fixable)).toBe(true);
  });

  it('after the add-ons are removed, only fees and the ₹10 remain', () => {
    expect(codes(run({ bill: demoBill({ hidden: true }) }))).toEqual(['FEE_NOT_ALLOWED', 'FEE_NOT_ALLOWED', 'UNEXPLAINED_AMOUNT']);
  });

  it('passes once a human approves the fees by name and the ₹10 is gone', () => {
    const m = amendMandate(mandate(), [
      { label: 'Handling charge', kind: 'handling', paise: 1500 },
      { label: 'Platform fee', kind: 'platform', paise: 900 },
    ], NOW.toISOString());
    expect(m.version).toBe(2);
    const r = run({ mandate: m, bill: demoBill() });
    expect(r.verdict).toBe('PASS');
    if (r.verdict !== 'PASS') return;
    expect(r.authorization.totalPaise).toBe(31300);
    expect(r.authorization.totalUsdCents).toBe(355);
    expect(r.authorization.lines.map((l) => [l.label, l.kind, l.paise, l.usdCents])).toEqual([
      ['Sunrise Chakki Atta 5 kg', 'product', 28900, 328],
      ['Handling charge', 'fee', 1500, 17],
      ['Platform fee', 'fee', 900, 10],
    ]);
    expect(r.authorization.mandateVersion).toBe(2);
  });

  it('an approval for a different amount than the page now shows does not count', () => {
    const m = amendMandate(mandate(), [{ label: 'Handling charge', kind: 'handling', paise: 1500 }, { label: 'Platform fee', kind: 'platform', paise: 900 }], NOW.toISOString());
    expect(codes(run({ mandate: m, bill: demoBill({ handling: 20 }) }))).toEqual(['FEE_NOT_ALLOWED']);
  });

  it('the unexplained ₹10 can never be approved', () => {
    const m = amendMandate(mandate(), [
      { label: 'Handling charge', kind: 'handling', paise: 1500 },
      { label: 'Platform fee', kind: 'platform', paise: 900 },
      { label: 'To pay', kind: 'other', paise: 1000 },
    ], NOW.toISOString());
    const r = run({ mandate: m, bill: demoBill({ hidden: true }) });
    expect(codes(r)).toEqual(['UNEXPLAINED_AMOUNT']);
    if (r.verdict === 'BLOCK') expect(r.reasons[0]!.fixable).toBe(true); // via the bill help link
  });

  it('the ₹10 is not fixable when the page offers no way to question the bill', () => {
    const r = run({ snapshot: snapshot(), bill: demoBill({ hidden: true, handling: 0, platform: false }) });
    expect(r.verdict === 'BLOCK' && r.reasons[0]!.fixable).toBe(false);
  });

  it('blocks a total over budget', () => {
    expect(codes(run({ mandate: mandate({ maxTotalPaise: 30000, allowedFees: ['delivery', 'handling', 'platform'] }) }))).toEqual(['OVER_BUDGET']);
  });

  it('blocks an unreadable amount', () => {
    const bill = demoBill({ handling: 0, platform: false });
    bill.rows.splice(2, 0, { label: 'Convenience fee', amount: null, kind: 'fee', feeKind: 'convenience', free: false, elRef: 'x' });
    expect(codes(run({ bill }))).toContain('UNREADABLE_AMOUNT');
  });

  it('blocks a money finding the line checks do not cover, but not urgency', () => {
    const bill = honestBill();
    expect(codes(run({ bill, findings: [finding('subscription_trap')] }))).toEqual(['MONEY_FINDING']);
    expect(run({ bill, findings: [finding('false_urgency')] }).verdict).toBe('PASS');
  });

  it('drip-pricing findings do not block once the fees themselves are approved', () => {
    const m = amendMandate(mandate(), [{ label: 'Handling charge', kind: 'handling', paise: 1500 }, { label: 'Platform fee', kind: 'platform', paise: 900 }], NOW.toISOString());
    expect(run({ mandate: m, findings: [finding('drip_pricing')] }).verdict).toBe('PASS');
  });

  it('the honest store passes first time', () => {
    const r = run({ bill: honestBill() });
    expect(r.verdict).toBe('PASS');
    if (r.verdict === 'PASS') expect(r.authorization.totalPaise).toBe(28900);
  });

  it('blocks when there is no bill to check', () => {
    expect(codes(run({ bill: null }))).toEqual(['UNREADABLE_AMOUNT']);
  });
});

describe('reason subjects', () => {
  it('names the exact bill line a fee reason is about', () => {
    const r = guard({ mandate: mandate(), snapshot: snapshot(), bill: demoBill(), findings: [], runId: 'r', now: NOW, secret: SECRET });
    expect(r.verdict === 'BLOCK' && r.reasons.filter((x) => x.code === 'FEE_NOT_ALLOWED').map((x) => [x.subject, x.paise])).toEqual([
      ['Handling charge', 1500],
      ['Platform fee', 900],
    ]);
  });
});
