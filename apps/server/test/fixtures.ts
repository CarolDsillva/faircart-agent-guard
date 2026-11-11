import { extractPage, RefRegistry, toSnapshot } from '@faircart/adapters';
import { renderView, type ShopState, type Store, type View } from '@faircart/shop';

let seq = 0;

/** What the browser's sensor would post for a shop page: real adapter, real page. Needs a jsdom environment. */
export function observation(store: Store, view: View, s: ShopState, opts: { pageId?: string; help?: boolean; popup?: boolean } = {}) {
  document.documentElement.innerHTML = `<head></head><body>${renderView(store, view, s)}</body>`;
  if (opts.help) document.querySelector<HTMLElement>('[data-help-panel]')!.hidden = false;
  if (opts.popup) document.querySelector<HTMLElement>('.dm-modal')!.hidden = false;
  const url = `http://localhost:5173/shop.html?view=${view}${store === 'fairmart' ? '&store=fairmart' : ''}`;
  const x = extractPage(document, new URL(url), new RefRegistry())!;
  seq += 1;
  return {
    seq,
    pageId: opts.pageId ?? `${store}-${view}`,
    url,
    snapshot: toSnapshot(x, { snapshotId: `s-${seq}`, journeyId: 'pending', capturedAt: new Date(Date.UTC(2026, 10, 12, 10, 0, seq)).toISOString() }),
    bill: x.bill,
  };
}

export const MANDATE_REQUEST = {
  mandate: {
    want: { sku: 'DEMO-ATTA-5KG', title: 'Sunrise Chakki Atta 5 kg', maxQuantity: 1 },
    maxTotalPaise: 35000,
    allowedFees: ['delivery'],
  },
};

export const checkoutPlan = { actions: [{ tool: 'request_checkout', explanation: 'Asking the checker before paying.' }] };
export const untickPlan = { actions: [{ tool: 'set_control', controlId: 'protect', checked: false, explanation: 'Protection was pre-ticked.' }] };
