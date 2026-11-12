import type { Approval, Reason } from '@faircart/guard';
import { formatMoney } from '@faircart/money';
import { productBySku } from '@faircart/shop';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { clearMarks, pointAt, type Drawn } from './overlay';
import { productUrl } from './scenarios';
import { observeDocument, whenQuiet } from './sensor';
import { showFindings, showVerdict } from './useRun';

/**
 * The product demo: a 45-second story that plays by itself, the same way every time.
 *
 * It runs on the real DemoMart pages, with PennyWise's real reader marking what it finds and the
 * real checker (on the server) deciding. Two things are scripted so it never wanders: the agent's
 * clicks (a fixed plan instead of Gemini) and the final PayPal step (simulated, so nobody has to
 * log in to watch). "Try it yourself" runs the real agent and PayPal sandbox.
 */

const SKU = 'DEMO-COFFEE-12OZ';
const STORE_WIDTH = 1180;
/** Roughly how long one play takes, for the progress bar. */
const LENGTH_MS = 46_000;
const CHAPTERS = ['Your rules', 'The trap', 'Agent shops', 'Blocked', 'You decide', 'Paid'];
const usd = (cents: number) => formatMoney(cents, 'USD');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Beat {
  chapter: number;
  title: string;
  sub?: string;
  tags?: string[];
}

interface Cards {
  verdict?: { pass: boolean; lines: string[] };
  approve?: { label: string; paise: number }[];
  pay?: number;
  receipt?: { tried: number; paid: number };
}

class Replaced extends Error {}

export function ProductDemo({ onExplore }: { onExplore: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const token = useRef(0);
  const loaded = useRef<(() => void) | null>(null);
  const paused = useRef(false);
  const elapsed = useRef(0);
  const [status, setStatus] = useState<'idle' | 'playing' | 'paused' | 'done' | 'error'>('idle');
  const [beat, setBeat] = useState<Beat>({ chapter: 0, title: '' });
  const [cards, setCards] = useState<Cards>({});
  const [path, setPath] = useState('/p/demo-coffee-12oz');
  const [progress, setProgress] = useState(0);
  /** What is boxed on the page right now, numbered like the badges. */
  const [marks, setMarks] = useState<Drawn[]>([]);

  // The store renders at desktop width and is scaled to fit, like a screen recording.
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / STORE_WIDTH)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A progress bar that moves with time, and stops while paused.
  useEffect(() => {
    if (status !== 'playing') return;
    let last = Date.now();
    const t = setInterval(() => {
      const now = Date.now();
      elapsed.current += now - last;
      last = now;
      setProgress(Math.min(0.97, elapsed.current / LENGTH_MS));
    }, 200);
    return () => clearInterval(t);
  }, [status]);

  const play = useCallback(async () => {
    const my = ++token.current;
    const alive = () => my === token.current;
    const check = () => {
      if (!alive()) throw new Replaced();
    };
    /** Waits that stretch while paused, so Pause holds the story on the current step. */
    const wait = async (ms: number) => {
      // Wall-clock time, so throttled timers can't stretch the story.
      let left = ms;
      let last = Date.now();
      while (left > 0 || paused.current) {
        await sleep(Math.min(100, Math.max(left, 16)));
        check();
        const now = Date.now();
        if (!paused.current) left -= now - last;
        last = now;
      }
    };
    const say = (b: Beat) => {
      check();
      setBeat(b);
    };
    const doc = () => {
      const d = frame.current?.contentDocument;
      if (!d) throw new Error('no page');
      return d;
    };
    const nextLoad = () =>
      new Promise<void>((resolve) => {
        loaded.current = resolve;
        setTimeout(resolve, 8000);
      });
    const load = async (url: string) => {
      const l = nextLoad();
      if (frame.current) frame.current.src = url;
      await l;
      await whenQuiet(doc(), 200, 1500);
    };
    const closePopup = async () => {
      await sleep(120);
      doc().querySelector<HTMLElement>('.dm-modal:not([hidden]) [data-act="pass-no"]')?.click();
    };
    /** The agent's cursor glides to an element and taps it. */
    const tap = async (selector: string, navigates = false) => {
      await wait(0);
      const el = doc().querySelector<HTMLElement>(selector);
      if (!el) throw new Error(`missing ${selector}`);
      setMarks([]); // the cursor clears the boxes on the page, so the list goes too
      await pointAt(el);
      check();
      const l = navigates ? nextLoad() : null;
      el.click();
      if (l) {
        await l;
        await whenQuiet(doc(), 200, 1500);
      } else await sleep(250);
    };
    const read = (n: number) => observeDocument(doc(), doc().URL, `demo-${n}`, n);
    const scan = async (n: number) => {
      const obs = read(n);
      const { findings } = await api.peek(obs);
      check();
      clearMarks(doc());
      const drawn = showFindings(obs, findings);
      setMarks(drawn);
      return drawn;
    };

    paused.current = false;
    elapsed.current = 0;
    setProgress(0);
    setStatus('playing');
    setCards({});
    setMarks([]);
    try {
      const item = productBySku(SKU);

      // 1. Your rules.
      say({ chapter: 0, title: 'You give your AI agent one job.', sub: `“Buy ${item.title}. Max $25. Delivery fees OK, nothing else.”` });
      const { runId } = await api.createRun({ want: { sku: item.sku, title: item.title, maxQuantity: 1 }, maxTotalPaise: 2500, allowedFees: ['delivery'], autopay: false, currency: 'USD' } as never);
      await load(productUrl('demomart', SKU));
      setPath('/p/demo-coffee-12oz');
      await wait(2200);

      // 2. The trap.
      const found = await scan(1);
      await api.observe(runId, read(11), [], false); // recorded on arrival, before the agent undoes anything
      say({ chapter: 1, title: `PennyWise spots ${found.length} tricks on one page.` });
      await wait(3600);

      // 3. The agent shops.
      setMarks([]);
      say({ chapter: 2, title: 'The agent says no to the pop-up…' });
      await tap('[data-act="pass-no"]');
      say({ chapter: 2, title: '…unticks the plan you never asked for…' });
      await tap('#protect');
      await api.observe(runId, read(2), [], false);
      say({ chapter: 2, title: '…and adds just the coffee.' });
      await tap('a.dm-btn--cta', true);
      setPath('/basket');
      await closePopup();
      await scan(3);
      await api.observe(runId, read(31), [], false);
      say({ chapter: 2, title: 'A $4.99 pass was slipped into the basket. Removed.' });
      await wait(900);
      await tap('[data-act="remove-pass"]');
      setMarks([]);
      await api.observe(runId, read(4), [], false);
      await tap('a.dm-btn--cta', true);
      setPath('/checkout/payment');
      await closePopup();

      // 4. Blocked.
      let obs = read(5);
      await api.observe(runId, obs, [], false);
      let g = await api.checkout(runId);
      check();
      if (g.verdict !== 'BLOCK') throw new Error('expected a block');
      setMarks(showVerdict(obs, g.reasons));
      setCards({ verdict: { pass: false, lines: [] } });
      say({ chapter: 3, title: 'At payment, PennyWise blocks it.', sub: 'Two fees appeared only now, plus $1.00 nobody explains. Plain code decides, not AI.' });
      await wait(4200);
      say({ chapter: 3, title: 'The agent disputes the $1.00 with the store.' });
      await tap('[data-act="bill-help"]');
      await tap('[data-act="dispute"]');
      doc().querySelector<HTMLElement>('[data-help-panel]')?.removeAttribute('hidden');
      obs = read(55);
      await api.observe(runId, obs, [], false);
      g = await api.checkout(runId);
      check();
      if (g.verdict !== 'BLOCK') throw new Error('expected the fees to stay blocked');
      clearMarks(doc());
      setMarks(showVerdict(obs, g.reasons));
      setCards({ verdict: { pass: false, lines: [] } });
      await wait(1200);

      // 5. You decide.
      const fees = g.reasons.filter((r: Reason) => r.code === 'FEE_NOT_ALLOWED' && r.subject && r.paise !== undefined);
      setCards((c) => ({ ...c, approve: fees.map((f: Reason) => ({ label: f.subject!, paise: f.paise! })) }));
      say({ chapter: 4, title: 'Only you can allow extra fees.', sub: 'The agent can’t. Here we approve them for you.' });
      await wait(3200);
      await api.amend(
        runId,
        fees.map((f: Reason) => ({ label: f.subject!, kind: (/handling/i.test(f.subject!) ? 'handling' : 'platform') as Approval['kind'], paise: f.paise! })),
      );
      obs = read(6);
      await api.observe(runId, obs, [], false);
      g = await api.checkout(runId);
      check();
      if (g.verdict !== 'PASS') throw new Error('expected a pass');
      clearMarks(doc());
      setMarks(showVerdict(obs, null));
      const paid = g.authorization.totalPaise;
      setCards({ verdict: { pass: true, lines: [`Cart mandate signed for exactly ${usd(paid)}`] } });
      say({ chapter: 4, title: `Every cent matches. Signed for ${usd(paid)}.` });
      await wait(2200);

      // 6. Paid (simulated here; "Try it yourself" uses PayPal sandbox).
      say({ chapter: 5, title: 'PayPal moves only that amount.' });
      for (let i = 1; i <= 3; i++) {
        setCards((c) => ({ ...c, pay: i }));
        await wait(700);
      }
      const view = await api.run(runId).catch(() => null);
      const tried = view?.receipt.triedPaise ?? 2195;
      check();
      setCards((c) => ({ ...c, receipt: { tried, paid } }));
      say({ chapter: 5, title: `DemoMart tried ${usd(tried)}. You paid ${usd(paid)}.` });
      setProgress(1);
      setStatus('done');
    } catch (e) {
      if (e instanceof Replaced) return;
      console.error('[product demo]', e);
      if (alive()) {
        setStatus('error');
        setBeat({ chapter: 0, title: 'The demo hit a snag. Press Replay.' });
      }
    }
  }, []);

  // Start by itself the first time it is mostly on screen.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && token.current === 0) void play();
    }, { threshold: 0.55 });
    io.observe(el);
    return () => io.disconnect();
  }, [play]);

  const togglePause = () => {
    paused.current = !paused.current;
    setStatus(paused.current ? 'paused' : 'playing');
  };
  const live = status === 'playing' || status === 'paused';

  return (
    <div className="pdemo" ref={root} id="product-demo">
      <div className="pdemo__top">
        <ol className="pdemo__chapters" aria-label="Demo chapters">
          {CHAPTERS.map((c, i) => {
            const state = status === 'idle' ? '' : status === 'done' || i < beat.chapter ? 'is-done' : i === beat.chapter ? 'is-on' : '';
            return (
              <li key={c} className={state}>
                <span>{state === 'is-done' ? '✓' : i + 1}</span>
                {c}
              </li>
            );
          })}
        </ol>
        <div className="pdemo__controls">
          {live && (
            <button className="pdemo__btn" onClick={togglePause} aria-label={status === 'paused' ? 'Resume' : 'Pause'}>
              {status === 'paused' ? '▶' : '❚❚'}
            </button>
          )}
          {status !== 'idle' && (
            <button className="pdemo__btn" onClick={() => void play()} aria-label="Replay">
              ↻
            </button>
          )}
        </div>
      </div>
      <div className="pdemo__bar" aria-hidden="true">
        <i style={{ width: `${progress * 100}%` }} />
      </div>

      <div className="pdemo__body">
        <div className="pdemo__screen">
          <div className="pdemo__chrome" aria-hidden="true">
            <span className="pdemo__dots">
              <i />
              <i />
              <i />
            </span>
            <span className="pdemo__url">
              demomart.example<b>{path}</b>
            </span>
            {status === 'paused' && <span className="pdemo__paused">Paused</span>}
          </div>
          <div className="pdemo__frame" ref={box}>
            <iframe
              style={{ width: STORE_WIDTH, height: `${100 / scale}%`, transform: `scale(${scale})` }}
              ref={frame}
              name="pw-demo"
              title="Product demo: DemoMart, as the agent sees it"
              src="about:blank"
              tabIndex={-1}
              onLoad={() => {
                loaded.current?.();
                loaded.current = null;
              }}
            />
            <div className="pdemo__shield" aria-hidden="true" onClick={live ? togglePause : undefined} />
            {status === 'idle' && (
              <button className="pdemo__poster" onClick={() => void play()}>
                <span className="pdemo__play" aria-hidden="true">▶</span>
                <b>Watch the 45-second demo</b>
                <small>Plays by itself. No login needed.</small>
              </button>
            )}
          </div>
        </div>

        <aside className="pdemo__story" aria-live="polite">
          <p className="pdemo__chapter">{status === 'idle' ? 'Product demo' : `${beat.chapter + 1} / ${CHAPTERS.length} · ${CHAPTERS[beat.chapter]}`}</p>
          <p className="pdemo__caption" key={beat.title}>
            {status === 'idle' ? 'An AI agent shops a store built to trick it. PennyWise stops every trick.' : beat.title}
          </p>
          {status !== 'idle' && beat.sub && <p className="pdemo__sub">{beat.sub}</p>}
          {status !== 'idle' && marks.length > 0 && (
            <ol className="pdemo__marks" aria-label="Boxed on the page">
              {marks.map((m) => (
                <li key={m.n} className={`is-${m.tone}`}>
                  <span aria-hidden="true">{m.tone === 'ok' ? '✓' : m.n}</span>
                  {m.label}
                </li>
              ))}
            </ol>
          )}
          {status !== 'idle' && beat.tags && (
            <ul className="pdemo__tags">
              {beat.tags.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}

          <div className="pdemo__cards">
            {cards.verdict && (
              <div className={`pdemo__card ${cards.verdict.pass ? 'pdemo__card--pass' : 'pdemo__card--block'}`}>
                <b>{cards.verdict.pass ? '✓ PennyWise approved' : '✕ PennyWise blocked payment'}</b>
                {cards.verdict.lines.length > 0 && (
                  <ul>
                    {cards.verdict.lines.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {cards.approve && (
              <div className="pdemo__card pdemo__card--ask">
                <b>Allow these fees?</b>
                <ul>
                  {cards.approve.map((a) => (
                    <li key={a.label}>
                      <span>{a.label}</span>
                      <span>{usd(a.paise)}</span>
                    </li>
                  ))}
                </ul>
                <span className="pdemo__fakebtn">Approve</span>
              </div>
            )}
            {cards.pay !== undefined && (
              <div className="pdemo__card pdemo__card--pp">
                <b>
                  <i>Pay</i>
                  <i>Pal</i>
                </b>
                <ul className="pdemo__paysteps">
                  {['Money held', 'Order checked line by line', 'Captured'].map((t, i) => (
                    <li key={t} className={cards.pay! > i ? 'is-done' : ''}>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {cards.receipt && (
              <div className="pdemo__receipt">
                <span>
                  Tried <s>{usd(cards.receipt.tried)}</s>
                </span>
                <b>Paid {usd(cards.receipt.paid)}</b>
                <span className="pdemo__saved">Saved {usd(cards.receipt.tried - cards.receipt.paid)}</span>
              </div>
            )}
          </div>

          <div className="pdemo__actions">
            {status === 'idle' && (
              <button className="act act--play" onClick={() => void play()}>
                ▶ Play
              </button>
            )}
            {(status === 'done' || status === 'error') && (
              <>
                <button className="act act--dark" onClick={onExplore}>
                  Try it yourself →
                </button>
                <button className="act" onClick={() => void play()}>
                  ↻ Replay
                </button>
              </>
            )}
          </div>
        </aside>
      </div>
      <p className="pdemo__note">Real store pages, real PennyWise checks. The agent’s clicks are scripted and PayPal is simulated, so the demo plays the same every time.</p>
    </div>
  );
}
