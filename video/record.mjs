// Records real footage from the live site, one clip per moment, as constant-frame-rate MP4s.
// Usage: node video/record.mjs [clip ...]   (default: all clips)
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, sleep } from './cdp.mjs';

const SITE = process.env.SITE ?? 'https://pennywise-for-paypal.onrender.com';
const FF = process.env.FFMPEG;
const OUT = new URL('./out/clips/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const want = process.argv.slice(2);
const b = await launch();

/** Screencast frames between start() and stop(), written out as an MP4. */
function recorder(name) {
  const frames = [];
  const onFrame = (p) => {
    frames.push({ data: p.data, t: p.metadata.timestamp });
    b.send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {});
  };
  b.on('Page.screencastFrame', onFrame);
  let stopped = false;
  return {
    async start() {
      await b.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      const end = Date.now() / 1000;
      await b.send('Page.stopScreencast');
      const dir = join(OUT, `${name}-frames`);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      let list = '';
      frames.forEach((f, i) => {
        const file = `f${String(i).padStart(5, '0')}.jpg`;
        writeFileSync(join(dir, file), Buffer.from(f.data, 'base64'));
        const next = frames[i + 1]?.t ?? Math.max(end, f.t + 0.04);
        list += `file '${file}'\nduration ${Math.max(0.001, next - f.t).toFixed(4)}\n`;
      });
      if (frames.length) list += `file 'f${String(frames.length - 1).padStart(5, '0')}.jpg'\n`;
      writeFileSync(join(dir, 'list.txt'), list);
      const mp4 = join(OUT, `${name}.mp4`);
      execFileSync(FF, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(dir, 'list.txt'), '-vf', 'fps=30,scale=1920:1080:flags=lanczos', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-g', '10', '-pix_fmt', 'yuv420p', mp4]);
      const total = frames.length ? end - frames[0].t : 0;
      console.log(`${name}: ${frames.length} frames, ${total.toFixed(1)} s -> ${mp4}`);
    },
  };
}

const clip = async (name, fn) => {
  if (want.length && !want.includes(name)) return;
  console.log(`recording ${name}…`);
  const r = recorder(name);
  await r.start();
  try {
    await fn();
  } catch (e) {
    console.warn(`${name}: ${e.message}`);
  }
  await r.stop();
};
const click = (sel, text) =>
  b.evaluate(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => ${text ? `e.textContent.includes(${JSON.stringify(text)})` : 'true'}); if (!el) throw new Error('no ' + ${JSON.stringify(sel + ' ' + (text ?? ''))}); el.click(); return true; })()`);

try {
  // Warm the site, and set the rules "Try it yourself" starts with: olive oil at DemoMart, $25, delivery OK, auto-pay.
  await b.goto(SITE);
  await b.evaluate(`localStorage.setItem('pennywise-prefs-v2', JSON.stringify({ maxRupees: 25, fees: ['delivery'], autopay: true, sku: 'PAN-GOLDEN-VALLEY-EXTRA-VIRGIN-OLIVE-OIL-1-L', store: 'demomart' })); true`);
  await b.goto(SITE);
  await sleep(2500);

  await clip('hero', async () => {
    await sleep(5000);
  });

  await clip('demo', async () => {
    await b.evaluate(`document.getElementById('product-demo').scrollIntoView({ block: 'center' }); true`);
    await b.waitFor(`!!document.querySelector('.pdemo__receipt')`, 150_000);
    await sleep(3500);
  });

  // Try it yourself.
  if (!want.length || want.some((w) => ['peek', 'agent'].includes(w))) {
    console.log('opening Try it yourself');
    await click('.appbar__nav button', 'Try it yourself');
    await b.waitFor(`document.querySelector('.explore-page iframe')?.contentDocument?.readyState === 'complete'`, 30_000);
    await sleep(2000);
  }

  await clip('peek', async () => {
    await sleep(800);
    await click('.bar__actions .act', 'Peek');
    await b.waitFor(`!!document.querySelector('.peek-sum')`, 60_000);
    await sleep(3500);
  });

  await clip('agent', async () => {
    await sleep(600);
    await click('.bar__actions .act', 'Let my agent buy it');
    // The live Gemini agent shops until it needs you.
    await b.waitFor(`!!document.querySelector('.card--ask') || /Stopped|Failed/.test(document.querySelector('aside.pane .state')?.textContent ?? '')`, 240_000, 500);
    await sleep(2500);
    if (await b.evaluate(`!!document.querySelector('.card--ask')`)) {
      await click('.card--ask .btn--primary');
      await b.waitFor(`/Last step: log in to PayPal/.test(document.querySelector('aside.pane')?.textContent ?? '')`, 180_000, 500);
      await sleep(3500);
    }
  });

  await clip('ledger', async () => {
    await click('.appbar__nav button', 'Merchant fairness');
    await sleep(5500);
  });
} finally {
  b.close();
  setTimeout(() => process.exit(0), 500);
}
