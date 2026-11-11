// @vitest-environment jsdom
import { ScriptedProvider } from '@faircart/agent-core';
import { initialState } from '@faircart/shop';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { MockPayPal } from '../src/paypal/mock';
import { RunStore } from '../src/runs';
import { checkoutPlan, MANDATE_REQUEST, observation, untickPlan } from './fixtures';

function setup(plans: unknown[]) {
  const store = new RunStore();
  const app = createApp({ store, provider: new ScriptedProvider(plans), secret: 'test-secret', now: () => new Date('2026-11-12T10:00:00Z'), paypal: new MockPayPal(), paypalConfig: { clientId: 'mock-client', mode: 'mock' } });
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(path, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, json: (await res.json()) as any };
  };
  return { call, store };
}

async function start(call: ReturnType<typeof setup>['call']) {
  const r = await call('POST', '/api/runs', MANDATE_REQUEST);
  expect(r.status).toBe(200);
  return r.json.runId as string;
}

const trap = initialState('demomart');
const clean = { ...trap, protection: false, pass: false };

describe('runs API', () => {
  it('walks DemoMart from traps to a signed ₹313 authorization', async () => {
    const { call } = setup([untickPlan, checkoutPlan, checkoutPlan, checkoutPlan, checkoutPlan]);
    const id = await start(call);

    const item = await call('POST', `/api/runs/${id}/observe`, observation('demomart', 'item', trap));
    expect(item.json.plan.actions[0].tool).toBe('set_control');
    expect(item.json.findings.map((f: any) => f.ruleId)).toContain('BASKET-02');

    await call('POST', `/api/runs/${id}/observe`, observation('demomart', 'pay', trap, { pageId: 'pay' }));
    let g = await call('POST', `/api/runs/${id}/checkout`);
    expect(g.json.verdict).toBe('BLOCK');
    expect(g.json.state).toBe('shopping'); // add-ons are removable, so the agent fixes them first

    await call('POST', `/api/runs/${id}/observe`, observation('demomart', 'pay', clean, { pageId: 'pay' }));
    g = await call('POST', `/api/runs/${id}/checkout`);
    expect(g.json.reasons.map((r: any) => r.code).sort()).toEqual(['FEE_NOT_ALLOWED', 'FEE_NOT_ALLOWED', 'UNEXPLAINED_AMOUNT']);
    expect(g.json.state).toBe('shopping'); // the ₹10 can be questioned through the help link

    await call('POST', `/api/runs/${id}/observe`, observation('demomart', 'pay', { ...clean, disputed: true }, { pageId: 'pay' }));
    g = await call('POST', `/api/runs/${id}/checkout`);
    expect(g.json.state).toBe('awaiting_human');

    const a = await call('POST', `/api/runs/${id}/amend`, {
      approved: [
        { label: 'Handling charge', kind: 'handling', paise: 1500 },
        { label: 'Platform fee', kind: 'platform', paise: 900 },
      ],
    });
    expect(a.json).toMatchObject({ state: 'shopping', mandateVersion: 2 });

    await call('POST', `/api/runs/${id}/observe`, observation('demomart', 'pay', { ...clean, disputed: true }, { pageId: 'pay' }));
    g = await call('POST', `/api/runs/${id}/checkout`);
    expect(g.json.verdict).toBe('PASS');
    expect(g.json.authorization.totalPaise).toBe(31300);

    const run = await call('GET', `/api/runs/${id}`);
    expect(run.json.state).toBe('authorized');
    expect(run.json.receipt.triedPaise).toBe(47100);
    expect(run.json.audit.some((e: any) => e.actor === 'human' && e.event === 'amended')).toBe(true);
  });

  it('FairMart passes on the first checkout', async () => {
    const { call } = setup([checkoutPlan]);
    const id = await start(call);
    await call('POST', `/api/runs/${id}/observe`, observation('fairmart', 'pay', initialState('fairmart')));
    const g = await call('POST', `/api/runs/${id}/checkout`);
    expect(g.json.verdict).toBe('PASS');
    expect(g.json.authorization.totalPaise).toBe(28900);
  });

  it('refuses an amendment while the agent is still shopping', async () => {
    const { call } = setup([]);
    const id = await start(call);
    const r = await call('POST', `/api/runs/${id}/amend`, { approved: [] });
    expect(r.status).toBe(409);
    expect(r.json).toEqual({ error: 'bad_state', state: 'shopping' });
  });

  it('only lets the human approve charges the checker actually raised', async () => {
    const { call } = setup([checkoutPlan]);
    const id = await start(call);
    await call('POST', `/api/runs/${id}/observe`, observation('demomart', 'pay', { ...clean, disputed: true }, { pageId: 'pay' }));
    await call('POST', `/api/runs/${id}/checkout`);
    const r = await call('POST', `/api/runs/${id}/amend`, { approved: [{ label: 'Tip', kind: 'tip', paise: 5000 }] });
    expect(r.status).toBe(400);
  });

  it('answers run_expired for an unknown run', async () => {
    const { call } = setup([]);
    const r = await call('GET', '/api/runs/nope');
    expect(r.status).toBe(404);
    expect(r.json).toEqual({ error: 'run_expired' });
  });

  it('stops planning after 8 planner calls', async () => {
    const { call } = setup(Array.from({ length: 9 }, () => untickPlan));
    const id = await start(call);
    let last: any;
    for (let i = 0; i < 9; i++) last = await call('POST', `/api/runs/${id}/observe`, observation('demomart', 'item', trap, { pageId: `p${i}` }));
    expect(last.json.plan).toBeNull();
    expect(last.json.state).toBe('failed');
  });

  it('fails the run with a readable reason when the planner returns garbage twice', async () => {
    const { call } = setup(['garbage', { actions: [] }]);
    const id = await start(call);
    const r = await call('POST', `/api/runs/${id}/observe`, observation('demomart', 'item', trap));
    expect(r.json).toMatchObject({ plan: null, state: 'failed', error: expect.stringMatching(/planner/i) });
  });

  it('serves a health check', async () => {
    const { call } = setup([]);
    expect((await call('GET', '/healthz')).json).toEqual({ ok: true });
  });
});
