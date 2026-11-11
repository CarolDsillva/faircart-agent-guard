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
    expect(run.json.receipt.caught).toEqual([
      { label: 'Freshness protection (1 year)', paise: 4900 },
      { label: 'Demo Pass (3 months)', paise: 9900 },
      { label: 'Unexplained amount in the total', paise: 1000 },
    ]);
    expect(run.json.receipt.approved).toEqual([
      { label: 'Handling charge', paise: 1500 },
      { label: 'Platform fee', paise: 900 },
    ]);
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

  it('stops planning after 12 AI planner calls', async () => {
    const { call } = setup(Array.from({ length: 13 }, () => untickPlan));
    const id = await start(call);
    let last: any;
    for (let i = 0; i < 13; i++) last = await call('POST', `/api/runs/${id}/observe`, observation('demomart', 'item', trap, { pageId: `p${i}` }));
    expect(last.json.plan).toBeNull();
    expect(last.json.state).toBe('failed');
  });

  it('falls back to the labelled backup planner when the AI returns garbage twice', async () => {
    const { call } = setup(['garbage', { actions: [] }]);
    const id = await start(call);
    const r = await call('POST', `/api/runs/${id}/observe`, observation('demomart', 'item', trap));
    expect(r.json).toMatchObject({ planner: 'backup', state: 'shopping', plannerError: expect.stringMatching(/planner/i) });
    expect(r.json.plan.actions[0]).toMatchObject({ tool: 'set_control', controlId: 'protect' });
    const audit = (await call('GET', `/api/runs/${id}`)).json.audit;
    expect(audit.some((e: any) => e.event === 'backup_planner')).toBe(true);
  });

  it('labels plans from the AI planner', async () => {
    const { call } = setup([untickPlan]);
    const id = await start(call);
    const r = await call('POST', `/api/runs/${id}/observe`, observation('demomart', 'item', trap));
    expect(r.json.planner).toBe('ai');
  });

  it('stops the run when the planner says stop', async () => {
    const { call } = setup([{ actions: [{ tool: 'stop', reason: 'Not the right product.', explanation: 'Stopping.' }] }]);
    const id = await start(call);
    const r = await call('POST', `/api/runs/${id}/observe`, observation('demomart', 'item', trap));
    expect(r.json.state).toBe('stopped');
  });

  it('serves a health check', async () => {
    const { call } = setup([]);
    expect((await call('GET', '/healthz')).json).toEqual({ ok: true });
  });
});

describe('receipt', () => {
  it('counts what the store tried even when the agent removed it before the payment page', async () => {
    const { call } = setup([untickPlan, checkoutPlan, checkoutPlan]);
    const id = await start(call);
    await call('POST', `/api/runs/${id}/observe`, observation('demomart', 'item', trap)); // protection pre-ticked: ₹49
    await call('POST', `/api/runs/${id}/observe`, observation('demomart', 'basket', { ...trap, protection: false })); // pass: ₹99
    await call('POST', `/api/runs/${id}/observe`, observation('demomart', 'pay', { ...clean, disputed: true }, { pageId: 'pay' }));
    await call('POST', `/api/runs/${id}/checkout`);
    const r = (await call('GET', `/api/runs/${id}`)).json.receipt;
    expect(r.caught).toEqual([
      { label: '1-year freshness protection', paise: 4900 },
      { label: 'Demo Pass (3 months)', paise: 9900 },
    ]);
    expect(r.triedPaise).toBe(31300 + 4900 + 9900);
  });
});

describe('observe without planning', () => {
  it('records a fresh reading for the checker without a planner call', async () => {
    const { call } = setup([]); // no scripted plans: any planner call would fall back to backup
    const id = await start(call);
    const r = await call('POST', `/api/runs/${id}/observe`, { ...observation('demomart', 'pay', { ...clean, disputed: true }), plan: false });
    expect(r.json).toMatchObject({ plan: null, state: 'shopping' });
    const audit = (await call('GET', `/api/runs/${id}`)).json.audit;
    expect(audit.some((e: any) => e.actor === 'planner')).toBe(false);
    expect((await call('POST', `/api/runs/${id}/checkout`)).json.reasons.map((x: any) => x.code)).toEqual(['FEE_NOT_ALLOWED', 'FEE_NOT_ALLOWED']);
  });
});

describe('step limits', () => {
  it('does not count backup-planner steps against the AI limit', async () => {
    const { call } = setup([]); // AI always fails, so every step is the backup planner
    const id = await start(call);
    let last: any;
    for (let i = 0; i < 12; i++) last = await call('POST', `/api/runs/${id}/observe`, observation('demomart', 'item', trap, { pageId: `p${i}` }));
    expect(last.json.state).toBe('shopping');
    expect(last.json.plan).not.toBeNull();
  });

  it('still ends a run that never finishes after 20 planning steps', async () => {
    const { call } = setup([]);
    const id = await start(call);
    let last: any;
    for (let i = 0; i < 21; i++) last = await call('POST', `/api/runs/${id}/observe`, observation('demomart', 'item', trap, { pageId: `p${i}` }));
    expect(last.json).toMatchObject({ plan: null, state: 'failed' });
  });
});

describe('planning from the page as it is now', () => {
  it('does not try to decline a pop-up that was already dismissed on the same page', async () => {
    const { call } = setup([]); // backup planner
    const id = await start(call);
    const first = await call('POST', `/api/runs/${id}/observe`, observation('demomart', 'item', trap, { pageId: 'item', popup: true }));
    expect(first.json.plan.actions.map((a: any) => a.tool)).toEqual(['dismiss_prompt']);
    const second = await call('POST', `/api/runs/${id}/observe`, observation('demomart', 'item', trap, { pageId: 'item' }));
    expect(second.json.plan.actions.map((a: any) => a.tool)).toEqual(['set_control', 'click']);
  });
});

describe('the agent asking you', () => {
  const ask = { actions: [{ tool: 'ask_user', question: 'Approve the ₹15 handling fee?', amounts: [{ label: 'Handling charge', paise: 1500 }], explanation: 'This fee is not allowed.' }] };

  it('pauses for the human when the planner asks and nothing is left for the agent to fix', async () => {
    const { call } = setup([ask]);
    const id = await start(call);
    const r = await call('POST', `/api/runs/${id}/observe`, observation('demomart', 'pay', { ...clean, disputed: true }, { pageId: 'pay' }));
    expect(r.json.state).toBe('awaiting_human');
    expect((await call('POST', `/api/runs/${id}/amend`, { stop: true })).json.state).toBe('stopped');
  });

  it('does not let the planner ask while the checker listed something fixable; the backup planner fixes it', async () => {
    const { call } = setup([checkoutPlan, ask, ask]);
    const id = await start(call);
    await call('POST', `/api/runs/${id}/observe`, observation('demomart', 'pay', clean, { pageId: 'pay' }));
    await call('POST', `/api/runs/${id}/checkout`); // ₹10 unexplained is fixable through the bill help
    const r = await call('POST', `/api/runs/${id}/observe`, observation('demomart', 'pay', clean, { pageId: 'pay' }));
    expect(r.json).toMatchObject({ state: 'shopping', planner: 'backup' });
    expect(r.json.plan.actions[0]).toMatchObject({ tool: 'click', controlId: 'act:question-about-your-bill' });
  });
});

describe('receipt labels', () => {
  it('names an add-on removed before the basket by what it is, not by the checkbox wording', async () => {
    const { call } = setup([untickPlan]);
    const id = await start(call);
    await call('POST', `/api/runs/${id}/observe`, observation('demomart', 'item', trap));
    expect((await call('GET', `/api/runs/${id}`)).json.receipt.caught).toEqual([{ label: '1-year freshness protection', paise: 4900 }]);
  });
});

describe('receipt counts an unexplained amount the agent disputed before checking out', () => {
  it('records the ₹10 from the bill itself, not only from a checker block', async () => {
    const { call } = setup([checkoutPlan, checkoutPlan]);
    const id = await start(call);
    await call('POST', `/api/runs/${id}/observe`, observation('demomart', 'pay', clean, { pageId: 'pay' }));
    await call('POST', `/api/runs/${id}/observe`, observation('demomart', 'pay', { ...clean, disputed: true }, { pageId: 'pay' }));
    const r = (await call('GET', `/api/runs/${id}`)).json.receipt;
    expect(r.caught).toEqual([{ label: 'Unexplained amount in the total', paise: 1000 }]);
  });
});
