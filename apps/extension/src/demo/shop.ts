/**
 * FairCart demo shop: a fictional store ("DemoMart") with deliberate dark
 * patterns, so people can see FairCart work without waiting for a real site to
 * misbehave. FairCart reads it with the same generic adapter it uses on real
 * retailers; nothing here talks to the detector directly.
 *
 * Planted patterns, by page:
 *   item   – pre-ticked paid protection, a countdown that restarts on reload,
 *            a pass pop-up with a guilt-trip decline and a faint "no" link
 *   basket – a pass added without being chosen, the pop-up again
 *   pay    – handling and platform fees that appear only now, an unexplained
 *            ₹10 in the total, a double-negative WhatsApp checkbox, the pop-up again
 */

export type View = 'item' | 'basket' | 'pay';

export interface DemoState {
  protection: boolean;
  pass: boolean;
}

const KEY = 'faircart-demo-state';
const PRICE = 289;
const MRP = 420;
const PROTECTION = 49;
const PASS = 99;
const HANDLING = 15;
const PLATFORM = 9;
/** Charged but never itemised, so the checkout scan has something to catch. */
const HIDDEN = 10;

export function loadState(): DemoState {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as DemoState;
  } catch {
    /* storage can be unavailable; fall through to defaults */
  }
  return { protection: true, pass: true };
}
function saveState(s: DemoState) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

const rs = (n: number) => `₹${n.toLocaleString('en-IN')}`;

function steps(view: View): string {
  const items: [View, string][] = [
    ['item', '1 · Product'],
    ['basket', '2 · Basket'],
    ['pay', '3 · Payment'],
  ];
  return `<nav class="dm-steps" aria-label="Demo steps">${items
    .map(([v, l]) => `<a href="?view=${v}" class="${v === view ? 'is-on' : ''}" ${v === view ? 'aria-current="page"' : ''}>${l}</a>`)
    .join('')}</nav>`;
}

const GUIDE: Record<View, string[]> = {
  item: [
    'A paid protection plan is already ticked.',
    'The deal timer starts again at 09:59 every time you reload. Reload once to let FairCart see it reset.',
    'A pass pop-up uses a guilt-trip "no" and makes it far smaller than "yes". Dismiss it to start the nagging test.',
  ],
  basket: ['A delivery pass is in your basket though you never chose it.', 'The pop-up is back.'],
  pay: [
    'Handling and platform fees show up for the first time.',
    'The total includes ₹10 that no line explains. Use "Scan checkout".',
    'The WhatsApp checkbox uses a double negative.',
    'The pop-up is back again, after you dismissed it.',
  ],
};

function guide(view: View): string {
  return `<details class="dm-guide"><summary>What's planted on this page</summary><ul>${GUIDE[view].map((g) => `<li>${g}</li>`).join('')}</ul>
  <p>Open the FairCart button near your cursor, or the side panel, to see what it picks up.</p></details>`;
}

function popup(): string {
  return `<div class="dm-modal" role="dialog" aria-modal="true" aria-labelledby="dm-pass-title" hidden>
    <div class="dm-modal__card">
      <p class="dm-modal__eyebrow">Members save more</p>
      <h2 id="dm-pass-title">Get Demo Pass: free delivery for 3 months</h2>
      <p>Join thousands of smart shoppers. Only ${rs(PASS)}.</p>
      <button class="dm-btn dm-btn--big" data-act="pass-yes">Add Demo Pass for ${rs(PASS)}</button>
      <a href="#" class="dm-faint" data-act="pass-no">No thanks, I'll pay more for delivery</a>
    </div>
  </div>`;
}

function itemView(s: DemoState): string {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Sunrise Chakki Atta 5 kg (demo product)',
    sku: 'DEMO-ATTA-5KG',
    brand: { '@type': 'Brand', name: 'Sunrise (demo)' },
    offers: { '@type': 'Offer', price: PRICE, priceCurrency: 'INR', availability: 'https://schema.org/InStock', itemCondition: 'https://schema.org/NewCondition' },
  };
  return `<script type="application/ld+json">${JSON.stringify(ld)}</script>
  <section class="dm-product">
    <div class="dm-product__img" aria-hidden="true"><span>5 kg</span></div>
    <div class="dm-product__body">
      <p class="dm-brand">Sunrise (demo)</p>
      <h1>Sunrise Chakki Atta 5 kg</h1>
      <div class="dm-price"><span class="dm-price__now">${rs(PRICE)}</span> <s class="dm-price__mrp">${rs(MRP)}</s> <span class="dm-price__off">31% off</span></div>
      <p class="dm-deal"><span class="dm-deal__dot"></span><span data-countdown>Deal ends in 09:59</span></p>
      <p class="dm-muted">Delivery ${rs(30)} on orders below ₹199</p>
      <label class="dm-addon"><input type="checkbox" id="protect" ${s.protection ? 'checked' : ''}> Add 1-year freshness protection for ${rs(PROTECTION)}</label>
      <a class="dm-btn" href="?view=basket">Add to basket</a>
    </div>
  </section>`;
}

function billRows(s: DemoState, view: View): { label: string; amount: string; act?: string }[] {
  const rows: { label: string; amount: string; act?: string }[] = [{ label: 'Item total', amount: rs(PRICE) }];
  if (s.protection) rows.push({ label: 'Freshness protection (1 year)', amount: rs(PROTECTION), act: 'remove-protection' });
  if (s.pass) rows.push({ label: 'Demo Pass (3 months)', amount: rs(PASS), act: 'remove-pass' });
  rows.push({ label: 'Delivery charge', amount: `<s>${rs(30)}</s> FREE` });
  if (view === 'pay') {
    rows.push({ label: 'Handling charge', amount: rs(HANDLING) });
    rows.push({ label: 'Platform fee', amount: rs(PLATFORM) });
  }
  return rows;
}

export function total(s: DemoState, view: View): number {
  let t = PRICE + (s.protection ? PROTECTION : 0) + (s.pass ? PASS : 0);
  if (view === 'pay') t += HANDLING + PLATFORM + HIDDEN;
  return t;
}

function billView(s: DemoState, view: View): string {
  const all = billRows(s, view);
  const rows = all.map((r) => `<div class="dm-row"><span>${r.label}</span><span>${r.amount}</span></div>`).join('');
  // Remove links sit outside the bill rows so they never become part of a line's label.
  const removable = all.filter((r) => r.act);
  const removes = removable.length
    ? `<p class="dm-removes">${removable.map((r) => `<a href="#" data-act="${r.act}">Remove ${r.label.replace(/ \(.*\)$/, '').toLowerCase()}</a>`).join(' · ')}</p>`
    : '';
  const pay = view === 'pay';
  return `<section class="dm-bill">
    <h1>${pay ? 'Payment' : 'Your basket'}</h1>
    <div class="dm-line"><div class="dm-thumb" aria-hidden="true">5 kg</div><div><b>Sunrise Chakki Atta 5 kg</b><p class="dm-muted">Qty 1</p></div><b>${rs(PRICE)}</b></div>
    <div class="dm-summary">
      <h2>Bill details</h2>
      ${rows}
      <div class="dm-row dm-row--total"><span>To pay</span><span>${rs(total(s, view))}</span></div>
    </div>
    ${removes}
    ${
      pay
        ? `<label class="dm-consent"><input type="checkbox" id="wa-optin" checked> Uncheck this to not stop receiving offers and updates on WhatsApp</label>
           <p class="dm-muted">Payment step is simulated. FairCart never touches real payment pages.</p>
           <button class="dm-btn" data-act="order">Place order</button>
           <p class="dm-note" data-order-note hidden>This is a demo store. Nothing was ordered and no money moved.</p>`
        : `<a class="dm-btn" href="?view=pay">Proceed to checkout</a>`
    }
  </section>`;
}

export function renderView(view: View, s: DemoState): string {
  return `<header class="dm-top">
    <div class="dm-logo">DemoMart <span>practice store</span></div>
    ${steps(view)}
    <a href="?view=item" class="dm-reset" data-act="reset">Start over</a>
  </header>
  <p class="dm-banner" role="note"><b>FairCart demo shop.</b> A fictional store with deliberate dark patterns, for trying FairCart. Nothing here is real or for sale.</p>
  <main class="dm-main">
    ${view === 'item' ? itemView(s) : billView(s, view)}
    ${guide(view)}
  </main>
  ${popup()}`;
}

export function viewFromUrl(search: string): View {
  const v = new URLSearchParams(search).get('view');
  return v === 'basket' || v === 'pay' ? v : 'item';
}

/** Renders the current view and wires its interactions. */
export function mountShop(root: HTMLElement) {
  const view = viewFromUrl(location.search);
  let state = loadState();
  const render = () => {
    root.innerHTML = renderView(view, state);
    wire();
  };

  let tick: number | undefined;
  const wire = () => {
    // Countdown restarts at 09:59 on every load: that is the planted false urgency.
    const cd = root.querySelector<HTMLElement>('[data-countdown]');
    window.clearInterval(tick);
    if (cd) {
      let left = 599;
      tick = window.setInterval(() => {
        left = Math.max(0, left - 1);
        cd.textContent = `Deal ends in ${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
      }, 1000);
    }
    const protect = root.querySelector<HTMLInputElement>('#protect');
    protect?.addEventListener('change', () => {
      state = { ...state, protection: protect.checked };
      saveState(state);
    });
    root.querySelectorAll<HTMLElement>('[data-act]').forEach((el) =>
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const act = el.dataset.act;
        const modal = root.querySelector<HTMLElement>('.dm-modal');
        if (act === 'pass-yes') {
          state = { ...state, pass: true };
          saveState(state);
          if (modal) modal.hidden = true;
        } else if (act === 'pass-no') {
          if (modal) modal.hidden = true;
        } else if (act === 'remove-pass') {
          state = { ...state, pass: false };
          saveState(state);
          render();
        } else if (act === 'remove-protection') {
          state = { ...state, protection: false };
          saveState(state);
          render();
        } else if (act === 'reset') {
          resetDemo();
          location.href = '?view=item';
        } else if (act === 'order') {
          const note = root.querySelector<HTMLElement>('[data-order-note]');
          if (note) note.hidden = false;
        }
      }),
    );
    // The pass pop-up returns on every page, however often it's dismissed.
    window.setTimeout(() => {
      const modal = root.querySelector<HTMLElement>('.dm-modal');
      if (modal) modal.hidden = false;
    }, 1200);
  };
  render();
}

export function resetDemo() {
  saveState({ protection: true, pass: true });
}
