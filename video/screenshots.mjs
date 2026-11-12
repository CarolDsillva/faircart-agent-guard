// Captures README screenshots from the live site into docs/screenshots/.
// Usage: node video/screenshots.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, sleep } from './cdp.mjs';

const SITE = process.env.SITE ?? 'https://pennywise-for-paypal.onrender.com';
const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const OUT = join(here, '..', 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

const W = 1600;
const H = 1000;
const b = await launch({ width: W, height: H, port: 9337 });

/** Screenshot the whole viewport, or just one element (scrolled into view first). */
async function shot(name, selector, pad = 0) {
  let clip;
  if (selector) {
    const r = await b.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`);
    await sleep(400);
    const r2 = await b.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`);
    clip = { x: Math.max(0, r2.x - pad), y: Math.max(0, r2.y - pad), width: Math.min(W, r2.width + pad * 2), height: Math.min(H, r2.height + pad * 2), scale: 1 };
    void r;
  }
  const { data } = await b.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  console.log(name);
}
const click = (sel, text) =>
  b.evaluate(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.includes(${JSON.stringify(text)})); el.click(); return true; })()`);

try {
  await b.goto(SITE);
  await b.evaluate(`localStorage.setItem('pennywise-prefs-v2', JSON.stringify({ maxRupees: 25, fees: ['delivery'], autopay: true, sku: 'PAN-GOLDEN-VALLEY-EXTRA-VIRGIN-OLIVE-OIL-1-L', store: 'demomart' })); true`);
  await b.goto(SITE);
  await b.evaluate('document.fonts.ready.then(() => true)');
  await sleep(1500);

  // 1. The landing page.
  await shot('1-landing');

  // 2–3. The product demo: blocked at payment, then the receipt.
  await b.evaluate(`document.getElementById('product-demo').scrollIntoView({ block: 'center' }); true`);
  await b.waitFor(`/blocks it/.test(document.querySelector('.pdemo__caption')?.textContent ?? '') && document.querySelectorAll('.pdemo__marks li').length > 1`, 120_000);
  await sleep(1500);
  await shot('2-demo-blocked', '#product-demo');
  await b.waitFor(`!!document.querySelector('.pdemo__receipt')`, 120_000);
  await sleep(1200);
  await shot('3-demo-receipt', '#product-demo');

  // 4. Try it yourself: Peek at an olive oil checkout.
  await click('.appbar__nav button', 'Try it yourself');
  await b.waitFor(`document.querySelector('.explore-page iframe')?.contentDocument?.readyState === 'complete'`, 30_000);
  await sleep(1500);
  await click('.bar__actions .act', 'Peek');
  await b.waitFor(`!!document.querySelector('.peek-sum')`, 60_000);
  await sleep(1500);
  await shot('4-peek', '.explore-page .stage');

  // 5. Merchant fairness (AG Grid).
  await click('.appbar__nav button', 'Merchant fairness');
  await sleep(3000);
  await shot('5-merchant-fairness');
} finally {
  b.close();
  setTimeout(() => process.exit(0), 300);
}
