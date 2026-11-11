// @vitest-environment jsdom
import { backupPlan, buildBrief, validatePlan } from '@faircart/agent-core';
import type { Reason } from '@faircart/guard';
import { CORE, evaluate } from '@faircart/rules';
import { ScreenSnapshot } from '@faircart/schemas';
import { initialState } from '@faircart/shop';
import { describe, expect, it } from 'vitest';
import { MANDATE_REQUEST, observation } from './fixtures';

const mandate = { ...MANDATE_REQUEST.mandate, version: 1, signedAt: 'x', amendments: [] } as any;
const trap = initialState('demomart');

function planFor(obs: ReturnType<typeof observation>, lastGuard: Reason[] | null = null) {
  const snapshot = ScreenSnapshot.parse({ ...obs.snapshot, journeyId: 'j' });
  const { findings } = evaluate({ snapshot, journey: [], taps: [] }, CORE);
  const plan = backupPlan(buildBrief({ mandate, snapshot, findings, lastGuard }));
  expect(validatePlan(plan, snapshot)).toMatchObject({ ok: true });
  return plan.actions.map((a) => [a.tool, 'controlId' in a ? a.controlId : 'promptId' in a ? a.promptId : '']);
}

describe('backup planner (no AI)', () => {
  it('on the product page: unticks the add-on, declines the pop-up, adds to basket', () => {
    const steps = planFor(observation('demomart', 'item', trap, { popup: true }));
    expect(steps[0]).toEqual(['set_control', 'protect']);
    expect(steps.some(([t]) => t === 'dismiss_prompt')).toBe(true);
    expect(steps.at(-1)).toEqual(['click', 'act:add-to-basket']);
  });

  it('in the basket: removes what was not asked for, then proceeds', () => {
    const steps = planFor(observation('demomart', 'basket', trap));
    expect(steps).toEqual([
      ['click', 'act:remove-freshness-protection'],
      ['click', 'act:remove-demo-pass'],
      ['click', 'act:proceed-to-checkout'],
    ]);
  });

  it('on the payment page: asks the checker', () => {
    expect(planFor(observation('demomart', 'pay', { ...trap, protection: false, pass: false }))).toEqual([['request_checkout', '']]);
  });

  it('questions an unexplained amount through the bill help, step by step', () => {
    const blocked: Reason[] = [{ code: 'UNEXPLAINED_AMOUNT', label: 'x', paise: 1000, fixable: true }];
    const clean = { ...trap, protection: false, pass: false };
    expect(planFor(observation('demomart', 'pay', clean), blocked)).toEqual([['click', 'act:question-about-your-bill']]);
    expect(planFor(observation('demomart', 'pay', clean, { help: true }), blocked)).toEqual([
      ['click', 'act:i-don-t-recognise-a-charge'],
      ['request_checkout', ''],
    ]);
  });
});
