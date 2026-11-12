// Prints video/brief.html to video/out/PennyWise-for-PayPal-brief.pdf (A4, 2 pages).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, sleep } from './cdp.mjs';

const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const b = await launch({ width: 1240, height: 1754, port: 9339 });
try {
  await b.goto(pathToFileURL(join(here, 'brief.html')).href);
  await b.evaluate('document.fonts.ready.then(() => Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = r; i.onerror = r; })))).then(() => true)');
  await sleep(500);
  const { data } = await b.send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 });
  const out = join(here, 'out', 'PennyWise-for-PayPal-brief.pdf');
  writeFileSync(out, Buffer.from(data, 'base64'));
  console.log(out);
} finally {
  b.close();
  setTimeout(() => process.exit(0), 300);
}
