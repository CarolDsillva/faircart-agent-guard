// @vitest-environment jsdom
// @vitest-environment-options {"url": "http://localhost:5173/shop.html?view=item"}
import { mountShop, resetShop } from '@faircart/shop';
import { beforeEach, describe, expect, it } from 'vitest';
import { runAction } from '../src/driver';
import { observeDocument, type Observation } from '../src/sensor';

const URL_ITEM = 'http://localhost:5173/shop.html?view=item';

async function page() {
  resetShop('demomart');
  document.body.innerHTML = '<div id="shop"></div>';
  mountShop(document.getElementById('shop')!);
  await new Promise((r) => setTimeout(r, 5)); // the pop-up appears after load
}

let obs: Observation;
const fresh = async () => (obs = observeDocument(document, URL_ITEM, 'p1', 1));

describe('driver', () => {
  beforeEach(page);

  it('unticks a pre-ticked add-on through its control id', async () => {
    await fresh();
    const r = await runAction({ tool: 'set_control', controlId: 'protect', checked: false, explanation: '' }, { observe: fresh, waitForNavigation: async () => {} });
    expect(r).toEqual({ result: 'done' });
    expect(document.querySelector<HTMLInputElement>('#protect')!.checked).toBe(false);
  });

  it('does not click when the control is already in the wanted state', async () => {
    document.querySelector<HTMLInputElement>('#protect')!.checked = false;
    const r = await runAction({ tool: 'set_control', controlId: 'protect', checked: false, explanation: '' }, { observe: fresh, waitForNavigation: async () => {} });
    expect(r).toEqual({ result: 'done' });
    expect(document.querySelector<HTMLInputElement>('#protect')!.checked).toBe(false);
  });

  it('reports a control that is no longer on the page as stale and clicks nothing', async () => {
    let clicked = false;
    document.addEventListener('click', () => (clicked = true), true);
    const r = await runAction({ tool: 'click', controlId: 'act:remove-demo-pass', explanation: '' }, { observe: fresh, waitForNavigation: async () => {} });
    expect(r).toEqual({ result: 'stale' });
    expect(clicked).toBe(false);
  });

  it('works on a store page in another frame, and waits when a link navigates', async () => {
    const f = document.createElement('iframe');
    document.body.append(f);
    const doc = f.contentDocument!;
    doc.body.innerHTML = '<main><label><input type="checkbox" id="protect" checked> Add 1-year freshness protection for ₹49</label><a href="?view=basket">Add to basket</a></main>';
    doc.querySelector('a')!.addEventListener('click', (e) => e.preventDefault());
    const frameObs = async () => observeDocument(doc, 'http://localhost:5173/shop.html?view=item', 'f1', 9);
    let waited = false;
    const ctx = { observe: frameObs, waitForNavigation: async () => void (waited = true) };

    expect((await runAction({ tool: 'set_control', controlId: 'protect', checked: false, explanation: '' }, ctx)).result).toBe('done');
    expect(doc.querySelector<HTMLInputElement>('#protect')!.checked).toBe(false);
    await runAction({ tool: 'click', controlId: 'act:add-to-basket', explanation: '' }, ctx);
    expect(waited).toBe(true);
  });

  it('declines a pop-up with its own decline control and records the tap', async () => {
    await fresh();
    const prompt = obs.snapshot.cues.find((c) => c.kind === 'prompt')!;
    const r = await runAction({ tool: 'dismiss_prompt', promptId: prompt.promptId!, explanation: '' }, { observe: fresh, waitForNavigation: async () => {} });
    expect(r.result).toBe('done');
    expect(r.tap).toMatchObject({ action: 'dismiss' });
    expect(document.querySelector<HTMLElement>('.dm-modal')!.hidden).toBe(true);
  });
});
