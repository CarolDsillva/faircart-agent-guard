/**
 * What the viewer sees on the store page: the agent's cursor moving and
 * tapping, and FairCart's labelled boxes around what it found. Drawn inside
 * the store document in a layer marked data-faircart-ui, which FairCart's own
 * page readers skip, so the overlay never changes what the agent "sees".
 */

export type MarkTone = 'money' | 'manipulation' | 'blocked' | 'ok';

const STYLE = `
[data-faircart-ui] { all: initial; }
.fc-layer { position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483000; pointer-events: none; font: 600 12px/1.2 system-ui, -apple-system, 'Segoe UI', sans-serif; }
.fc-cursor { position: absolute; left: 0; top: 0; transform: translate(-200px, -200px); transition: transform 650ms cubic-bezier(.22,.8,.24,1); }
.fc-cursor svg { display: block; width: 22px; height: 22px; filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
.fc-cursor span { position: absolute; left: 18px; top: 18px; white-space: nowrap; background: #2443b5; color: #fff; padding: 3px 8px; border-radius: 999px; box-shadow: 0 2px 8px rgba(20,27,43,.3); }
.fc-ripple { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; border: 2px solid #2443b5; animation: fc-ripple 600ms ease-out forwards; }
@keyframes fc-ripple { from { transform: scale(.4); opacity: 1 } to { transform: scale(3.2); opacity: 0 } }
.fc-mark { position: absolute; border-radius: 8px; border: 2px solid; box-sizing: border-box; animation: fc-in 380ms ease-out both; }
/* Every mark gets the same numbered badge on its top-right corner: they line up, and never spill over. */
.fc-mark b { position: absolute; right: -34px; top: 50%; margin-top: -13px; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-size: 14px; font-weight: 800; border: 2px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,.25); }
.fc-mark--money { border-color: #d9480f; background: rgba(217,72,15,.08); }
.fc-mark--money b { background: #d9480f; }
.fc-mark--manipulation { border-color: #b97700; background: rgba(232,163,23,.10); border-style: dashed; }
.fc-mark--manipulation b { background: #9a6400; }
.fc-mark--blocked { border-color: #b3261e; background: rgba(179,38,30,.10); }
.fc-mark--blocked b { background: #b3261e; }
.fc-mark--ok { border-color: #11704f; background: rgba(17,112,79,.08); }
.fc-mark--ok b { background: #11704f; }
.fc-mark--left b { right: auto; left: -34px; }
.fc-mark--in b { right: 6px; }
@keyframes fc-in { from { opacity: 0; transform: scale(.97) } to { opacity: 1; transform: none } }
@media (prefers-reduced-motion: reduce) { .fc-cursor { transition: none } .fc-ripple, .fc-mark { animation: none } }
`;

const CURSOR = `<svg viewBox="0 0 24 24"><path d="M4 2.5 19.5 12l-7 1.6L9 20.5z" fill="#2443b5" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg><span>Agent</span>`;

function layer(doc: Document): HTMLElement {
  let l = doc.querySelector<HTMLElement>('[data-faircart-ui].fc-layer');
  if (l) return l;
  if (!doc.getElementById('fc-overlay-style')) {
    const st = doc.createElement('style');
    st.id = 'fc-overlay-style';
    st.textContent = STYLE.replace('[data-faircart-ui] { all: initial; }', '');
    doc.head.append(st);
  }
  l = doc.createElement('div');
  l.className = 'fc-layer';
  l.setAttribute('data-faircart-ui', '');
  l.setAttribute('aria-hidden', 'true');
  doc.body.append(l);
  return l;
}

/** Position in document coordinates, so marks scroll with the page. */
function box(el: Element) {
  const r = el.getBoundingClientRect();
  const win = el.ownerDocument.defaultView;
  return { x: r.left + (win?.scrollX ?? 0), y: r.top + (win?.scrollY ?? 0), w: r.width, h: r.height };
}

/**
 * Bring an element into view inside its own document only. Element.scrollIntoView would also
 * scroll every page around the frame, which made the landing page jump about during runs.
 */
export function reveal(el: Element, smooth = true) {
  const win = el.ownerDocument.defaultView;
  if (!win) return;
  const r = el.getBoundingClientRect();
  if (r.top >= 80 && r.bottom <= win.innerHeight - 40) return;
  win.scrollTo({ top: Math.max(0, r.top + win.scrollY - win.innerHeight / 2 + r.height / 2), behavior: smooth ? 'smooth' : 'auto' });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Glide the agent cursor to an element, then show a tap. */
export async function pointAt(el: Element, label = 'Agent') {
  const doc = el.ownerDocument;
  const l = layer(doc);
  // The page is about to change: old marks would point at the wrong place. Fresh ones follow the next reading.
  l.querySelectorAll('.fc-mark').forEach((m) => m.remove());
  reveal(el);
  await sleep(350);
  let c = l.querySelector<HTMLElement>('.fc-cursor');
  if (!c) {
    c = doc.createElement('div');
    c.className = 'fc-cursor';
    c.innerHTML = CURSOR;
    l.append(c);
    // Enter from the top-left corner of the visible page.
    const win = doc.defaultView;
    c.style.transform = `translate(${(win?.scrollX ?? 0) + 24}px, ${(win?.scrollY ?? 0) + 24}px)`;
    await sleep(30);
  }
  c.querySelector('span')!.textContent = label;
  const b = box(el);
  const x = b.x + Math.min(b.w / 2, 60);
  const y = b.y + b.h / 2;
  c.style.transform = `translate(${x}px, ${y}px)`;
  await sleep(700);
  const ripple = doc.createElement('div');
  ripple.className = 'fc-ripple';
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  l.append(ripple);
  setTimeout(() => ripple.remove(), 650);
}

/** Which element each mark belongs to, so marks follow it. */
const owners = new WeakMap<HTMLElement, Element>();

function place(m: HTMLElement, el: Element) {
  const b = box(el);
  const gone = !el.isConnected || !b.w || !b.h;
  m.style.display = gone ? 'none' : '';
  if (gone) return;
  m.style.left = `${b.x - 4}px`;
  m.style.top = `${b.y - 4}px`;
  m.style.width = `${b.w + 8}px`;
  m.style.height = `${b.h + 8}px`;
}

/**
 * Sticky headers, fixed pop-ups and sticky bill panels don't move with the page, so a box placed
 * once would drift off them on scroll. Re-place every mark from its element on scroll, resize and
 * page changes, once per frame.
 */
function track(doc: Document, l: HTMLElement) {
  // A document the frame has already navigated away from has no window: nothing to follow.
  const win = doc.defaultView;
  if (!win || !doc.body || l.dataset.tracking) return;
  l.dataset.tracking = '1';
  let queued = false;
  const update = () => {
    queued = false;
    l.querySelectorAll<HTMLElement>('.fc-mark').forEach((m) => {
      const el = owners.get(m);
      if (el) place(m, el);
    });
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    win.requestAnimationFrame(update);
  };
  win.addEventListener('scroll', schedule, { passive: true, capture: true });
  win.addEventListener('resize', schedule);
  new win.MutationObserver((records) => {
    if (records.some((r) => !l.contains(r.target))) schedule();
  }).observe(doc.body, { subtree: true, childList: true, attributes: true });
}

export interface Drawn {
  n: number;
  label: string;
  tone: MarkTone;
}

/**
 * Draw boxes on the page, each with a numbered badge. Replaces earlier marks of the same group and
 * returns what was drawn, so the panel beside the page can list "1. …, 2. …" to match.
 */
export function mark(doc: Document, group: string, items: { el: Element; label: string; tone: MarkTone }[]): Drawn[] {
  if (!doc.defaultView || !doc.body) return [];
  const l = layer(doc);
  track(doc, l);
  l.querySelectorAll(`.fc-mark[data-group="${group}"]`).forEach((m) => m.remove());
  const drawn: Drawn[] = [];
  let n = l.querySelectorAll('.fc-mark').length;
  const seen = new Set<Element>();
  for (const it of items) {
    if (seen.has(it.el) || !it.el.isConnected) continue;
    seen.add(it.el);
    const b = box(it.el);
    if (!b.w || !b.h) continue;
    const m = doc.createElement('div');
    m.className = `fc-mark fc-mark--${it.tone}`;
    m.dataset.group = group;
    // Badge just outside the box on the right, so it never covers the amount; inside if the page edge is too close.
    const rr = it.el.getBoundingClientRect();
    if (rr.right > (doc.defaultView?.innerWidth ?? 9999) - 44) m.classList.add(rr.left > 40 ? 'fc-mark--left' : 'fc-mark--in');
    owners.set(m, it.el);
    place(m, it.el);
    n += 1;
    const tag = doc.createElement('b');
    tag.textContent = it.tone === 'ok' ? '✓' : String(n);
    m.title = it.label;
    m.append(tag);
    l.append(m);
    drawn.push({ n, label: it.label, tone: it.tone });
  }
  return drawn;
}

/** Remove the overlay's marks (the cursor stays). */
export function clearMarks(doc: Document) {
  doc.querySelectorAll('[data-faircart-ui].fc-layer .fc-mark').forEach((m) => m.remove());
}
