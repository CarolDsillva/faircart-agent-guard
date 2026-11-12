// Renders the Devpost image gallery: 3:2 brand cards around the README screenshots.
// Usage: node video/gallery.mjs   -> video/out/gallery/*.png
import { copyFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './cdp.mjs';

const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const SHOTS = join(here, '..', 'docs', 'screenshots');
const OUT = join(here, 'out', 'gallery');
mkdirSync(OUT, { recursive: true });

const CARDS = [
  ['02-problem', join(here, 'out', 'stills', 't15.png'), 'The problem', 'Checkouts are built to trick you', 'Pre-ticked add-ons, items slipped into the basket, fees that appear only at payment. An $11.49 coffee becomes $21.95. An AI agent won’t notice.'],
  ['03-blocked', join(SHOTS, '2-demo-blocked.png'), 'PennyWise blocks it', 'Every trick numbered, every bad charge stopped', 'The agent removes what it can. At payment, plain code re-adds the bill and blocks anything outside your rules.'],
  ['04-peek', join(SHOTS, '4-peek.png'), 'Peek', 'See what the shelf price hides', 'PennyWise reads the store’s real checkout for any of 174 products. No agent, no AI, nothing bought.'],
  ['05-live-agent', join(SHOTS, '6-live-agent.png'), 'Live Gemini agent', 'The agent shops. You approve. Then PayPal.', 'Gemini plans one page at a time with no payment tools. PennyWise signs the cart, and only then do you log in to PayPal.'],
  ['06-receipt', join(SHOTS, '3-demo-receipt.png'), 'PayPal pays only what you approved', 'DemoMart tried $21.95. You paid $13.97.', 'PayPal authorizes and holds the money, PennyWise checks the order line by line, and only then is it captured.'],
  ['07-money-flow', join(here, 'out', 'stills', 't101.png'), 'How the money moves', 'Intent mandate → Gemini → checker → cart mandate → PayPal', 'Orders v2 through the APIMatic-generated Server SDK, Vault for the agent wallet, webhooks to settle.'],
  ['08-merchant-fairness', join(SHOTS, '5-merchant-fairness.png'), 'Merchant fairness · AG Grid', 'An honesty record for every merchant', 'Every run feeds a ledger of what stores tried to charge and what PennyWise stopped. Kept on a Render persistent disk.'],
];

const b = await launch({ width: 1800, height: 1200, port: 9338 });
try {
  const page = pathToFileURL(join(here, 'gallery.html')).href;
  for (const [name, img, eyebrow, title, sub] of CARDS) {
    const url = `${page}?${new URLSearchParams({ img: pathToFileURL(img).href, eyebrow, title, sub })}`;
    await b.goto(url);
    await b.evaluate('window.ready');
    const { data } = await b.send('Page.captureScreenshot', { format: 'png' });
    const file = join(OUT, `${name}.png`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    console.log(name, `${(statSync(file).size / 1024).toFixed(0)} KB`);
  }
  copyFileSync(join(here, 'out', 'thumbnail.png'), join(OUT, '01-cover.png'));
  copyFileSync(join(here, 'out', 'architecture.gif'), join(OUT, '09-architecture.gif'));
} finally {
  b.close();
  setTimeout(() => process.exit(0), 300);
}
