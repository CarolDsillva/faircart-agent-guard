// Renders video/explainer.html frame by frame into an MP4.
// Usage: node video/render.mjs              -> video/out/pennywise-for-paypal.mp4
//        node video/render.mjs --stills 3,12 -> PNG stills at those seconds, for review
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './cdp.mjs';

const FF = process.env.FFMPEG;
const FPS = Number(process.env.FPS ?? 30);
const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const OUT = join(here, 'out');
const page = pathToFileURL(join(here, 'explainer.html')).href;

const stillsArg = process.argv.indexOf('--stills');
const stills = stillsArg > 0 ? process.argv[stillsArg + 1].split(',').map(Number) : null;

const b = await launch({ port: 9334 });
try {
  await b.goto(page);
  console.log('clips:', await b.evaluate('window.ready'));
  const total = await b.evaluate('window.TOTAL');
  const shot = async (t, file) => {
    await b.evaluate(`window.seek(${t})`);
    await b.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const { data } = await b.send('Page.captureScreenshot', { format: file.endsWith('.png') ? 'png' : 'jpeg', quality: 94, captureBeyondViewport: false });
    writeFileSync(file, Buffer.from(data, 'base64'));
  };

  if (stills) {
    mkdirSync(join(OUT, 'stills'), { recursive: true });
    for (const t of stills) await shot(t, join(OUT, 'stills', `t${String(t).replace('.', '_')}.png`));
    console.log('stills done');
  } else {
    const dir = join(OUT, 'frames');
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const n = Math.round(total * FPS);
    const started = Date.now();
    for (let i = 0; i < n; i++) {
      await shot(i / FPS, join(dir, `f${String(i).padStart(5, '0')}.jpg`));
      if (i % 300 === 0) console.log(`frame ${i}/${n} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
    }
    const mp4 = join(OUT, 'pennywise-for-paypal.mp4');
    execFileSync(FF, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(dir, 'f%05d.jpg'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
    console.log('video:', mp4);
  }
} finally {
  b.close();
}
