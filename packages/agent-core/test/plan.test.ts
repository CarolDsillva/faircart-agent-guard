import { describe, expect, it } from 'vitest';
import { planWithRetry, ScriptedProvider, validatePlan, PLAN_JSON_SCHEMA } from '@faircart/agent-core';
import type { ScreenSnapshot } from '@faircart/schemas';

const snap = {
  controls: [
    { id: 'protect', kind: 'checkbox', label: 'Add 1-year freshness protection for ₹49', checked: true, role: 'add_on' },
    { id: 'act:add-to-basket', kind: 'link', label: 'Add to basket', checked: null, role: 'other' },
  ],
  cues: [{ id: 'cue-2', kind: 'prompt', text: 'Get Demo Pass', value: null, cueKey: 'prompt:pass', promptId: 'pass-popup' }],
} as unknown as ScreenSnapshot;

const good = {
  actions: [
    { tool: 'set_control', controlId: 'protect', checked: false, explanation: 'Protection was pre-ticked and is not in your instructions.' },
    { tool: 'dismiss_prompt', promptId: 'pass-popup', explanation: 'Declining the pass pop-up.' },
    { tool: 'click', controlId: 'act:add-to-basket', explanation: 'Adding the atta to the basket.' },
  ],
};
const messages = { system: 's', user: 'u' };

describe('validatePlan', () => {
  it('accepts a plan whose ids exist on the page', () => {
    const r = validatePlan(good, snap);
    expect(r.ok).toBe(true);
  });
  it('rejects an id that is not on the page', () => {
    const r = validatePlan({ actions: [{ tool: 'click', controlId: 'act:buy-now', explanation: 'x' }] }, snap);
    expect(r).toEqual({ ok: false, error: expect.stringContaining('act:buy-now') });
  });
  it('rejects an unknown tool', () => {
    expect(validatePlan({ actions: [{ tool: 'pay', explanation: 'x' }] }, snap).ok).toBe(false);
  });
  it('rejects a malformed object', () => {
    expect(validatePlan('{"actions":', snap).ok).toBe(false);
    expect(validatePlan({ actions: [] }, snap).ok).toBe(false);
  });
  it('has no tool that touches money or the mandate', () => {
    const tools = JSON.stringify(PLAN_JSON_SCHEMA);
    for (const t of ['set_control', 'click', 'dismiss_prompt', 'request_checkout', 'ask_user', 'stop']) expect(tools).toContain(t);
    for (const bad of ['amend', 'pay', 'capture', 'approve']) expect(tools).not.toMatch(new RegExp(`"${bad}`));
  });
});

describe('planWithRetry', () => {
  it('retries once after an invalid plan', async () => {
    const p = new ScriptedProvider([{ nonsense: true }, good]);
    const r = await planWithRetry(p, messages, snap);
    expect(r.ok).toBe(true);
    expect(p.calls[1]!.user).toContain('invalid');
  });
  it('gives up after two invalid plans with a readable error', async () => {
    const r = await planWithRetry(new ScriptedProvider([{ nonsense: true }, 'garbage']), messages, snap);
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/planner/i) });
  });
  it('reports a provider failure without throwing', async () => {
    const r = await planWithRetry({ plan: async () => { throw new Error('rate_limited'); } }, messages, snap);
    expect(r).toEqual({ ok: false, error: expect.stringContaining('rate_limited') });
  });
});
