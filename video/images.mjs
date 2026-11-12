// Renders the Devpost thumbnail (3:2 PNG) and the looping architecture GIF.
// Usage: node video/images.mjs [thumbnail] [arch]
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './cdp.mjs';

const FF = process.env.FFMPEG;
const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const OUT = join(here, 'out');
mkdirSync(OUT, { recursive: true });
const want = process.argv.slice(2);
const pick = (n) => !want.length || want.includes(n);

if (pick('thumbnail')) {
  const b = await launch({ width: 1800, height: 1200, port: 9335 });
  try {
    await b.goto(pathToFileURL(join(here, 'thumbnail.html')).href);
    await b.evaluate('document.fonts.ready.then(() => true)');
    const { data } = await b.send('Page.captureScreenshot', { format: 'png' });
    const file = join(OUT, 'thumbnail.png');
    writeFileSync(file, Buffer.from(data, 'base64'));
    console.log('thumbnail:', file, `${(statSync(file).size / 1024).toFixed(0)} KB`);
  } finally {
    b.close();
  }
}

if (pick('arch')) {
  const FPS = 15;
  const b = await launch({ width: 1200, height: 675, port: 9336 });
  try {
    await b.goto(pathToFileURL(join(here, 'arch.html')).href);
    await b.evaluate('window.ready');
    const loop = await b.evaluate('window.LOOP');
    const dir = join(OUT, 'arch-frames');
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const n = Math.round(loop * FPS);
    for (let i = 0; i < n; i++) {
      await b.evaluate(`window.seek(${i / FPS}); true`);
      const { data } = await b.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(dir, `f${String(i).padStart(4, '0')}.png`), Buffer.from(data, 'base64'));
    }
    const palette = join(dir, 'palette.png');
    execFileSync(FF, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(dir, 'f%04d.png'), '-vf', 'palettegen=max_colors=128:stats_mode=full', palette]);
    const gif = join(OUT, 'architecture.gif');
    execFileSync(FF, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(dir, 'f%04d.png'), '-i', palette, '-lavfi', 'paletteuse=dither=sierra2_4a', '-loop', '0', gif]);
    console.log('architecture gif:', gif, `${(statSync(gif).size / 1024).toFixed(0)} KB, ${n} frames`);
  } finally {
    b.close();
  }
}
