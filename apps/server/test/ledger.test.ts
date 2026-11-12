// @vitest-environment jsdom
import { ScriptedProvider } from '@faircart/agent-core';
import { initialState } from '@faircart/shop';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { LedgerBook } from '../src/ledger';
import { MockPayPal } from '../src/paypal/mock';
import { ledgerRow } from '../src/routes/runs';
import { RunStore } from '../src/runs';
import { checkoutPlan, MANDATE_REQUEST, observation } from './fixtures';

function setup(dir: string) {
  const book = new LedgerBook(dir);
  const store = new RunStore();
  store.onFinish = (run) => book.upsert(ledgerRow(run));
  const app = createApp({ store, book, provider: new ScriptedProvider([checkoutPlan]), secret: 'test-secret', now: () => new Date('2026-11-12T10:00:00Z'), paypal: new MockPayPal(), paypalConfig: { clientId: 'mock-client', mode: 'mock' } });
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(path, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, json: (await res.json()) as any };
  };
  return { call, book };
}

describe('the payments ledger on disk', () => {
  it('keeps finished runs across a restart, and records the product demo as a demo', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pennywise-ledger-'));
    const { call } = setup(dir);

    // A product-demo run on FairMart reaches a signed cart; its payment is simulated.
    const { json } = await call('POST', '/api/runs', { ...MANDATE_REQUEST, demo: true });
    await call('POST', `/api/runs/${json.runId}/observe`, observation('fairmart', 'pay', initialState('fairmart'), { pageId: 'pay' }));
    expect((await call('POST', `/api/runs/${json.runId}/checkout`)).json.verdict).toBe('PASS');
    expect((await call('POST', `/api/runs/${json.runId}/demo-done`)).json).toEqual({ ok: true });

    // A new server on the same disk still has it.
    const after = setup(dir);
    const rows = (await after.call('GET', '/api/ledger')).json.rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ runId: json.runId, state: 'demo', demo: true, store: 'FairMart', paidPaise: 1149 });
  });

  it('only the product demo can mark a run as a demo', async () => {
    const { call } = setup(mkdtempSync(join(tmpdir(), 'pennywise-ledger-')));
    const { json } = await call('POST', '/api/runs', MANDATE_REQUEST);
    expect((await call('POST', `/api/runs/${json.runId}/demo-done`)).status).toBe(403);
  });
});
