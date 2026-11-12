import type { Approval, Reason } from '@faircart/guard';
import { formatMoney } from '@faircart/money';
import { productBySku } from '@faircart/shop';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { clearMarks, pointAt } from './overlay';
import { pageUrl, productUrl } from './scenarios';
import { observeDocument, whenQuiet } from './sensor';
import { showFindings, showVerdict } from './useRun';

/**
 * The product demo: a one-minute story that plays by itself, the same way every time.
 *
 * It runs on the real DemoMart pages, with PennyWise's real reader marking what it finds and the
 * real checker (on the server) deciding. Only two things are scripted: the agent's clicks (a fixed
 * plan instead of Gemini, so it never wanders) and the final PayPal step (simulated, so nobody has
 * to log in to watch). The explore section below runs the real agent and PayPal sandbox.
 */

const SKU = 'DEMO-COFFEE-12OZ';
const STORE_WIDTH = 1180;
const RULES = { maxTotalPaise: 2500, allowedFees: ['delivery'] };
const CHAPTERS = ['Your rules', 'The trap', 'The agent shops', 'PennyWise blocks', 'You decide', 'PayPal pays'];
const usd = (cents: number) => formatMoney(cents, 'USD');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Beat {
  chapter: number;
  caption: string;
  sub?: string;
}

interface Cards {
  verdict?: { pass: boolean; lines: string[] };
  approve?: { label: string; paise: number }[];
  pay?: number; // how many PayPal steps are done (0-3)
  receipt?: { tried: number; paid: number };
}

export function ProductDemo({ onExplore }: { onExplore: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const token = useRef(0);
  const loaded = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<'idle' | 'playing' | 'done' | 'error'>('idle');
  const [beat, setBeat] = useState<Beat>({ chapter: 0, caption: '' });
  const [cards, setCards] = useState<Cards>({});
  const [path, setPath] = useState('/p/demo-coffee-12oz');
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

  const play = useCallback(async () => {
    const my = ++token.current;
    const alive = () => my === token.current;
    const say = (b: Beat) => alive() && setBeat(b);
    const wait = async (ms: number) => {
      await sleep(ms);
      if (!alive()) throw new Error('replaced');
    };
    const doc = () => {
      const d = frame.current?.contentDocument;
      if (!d) throw new Error('no page');
      return d;
    };
    /** Navigate (or follow a click) and resolve on the next page load. */
    const nextLoad = () =>
      new Promise<void>((resolve) => {
        loaded.current = resolve;
        setTimeout(resolve, 8000);
      });
    const load = async (url: string) => {
      const l = nextLoad();
      if (frame.current) frame.current.src = url;
      await l;
      await whenQuiet(doc());
    };
    const quietlyClosePopup = async () => {
      await sleep(150);
      doc().querySelector<HTMLElement>('.dm-modal:not([hidden]) [data-act="pass-no"]')?.click();
    };
    /** The agent's cursor glides to an element and taps it. */
    const tap = async (selector: string, navigates = false) => {
      const el = doc().querySelector<HTMLElement>(selector);
      if (!el) throw new Error(`missing ${selector}`);
      await pointAt(el);
      const l = navigates ? nextLoad() : null;
      el.click();
      if (l) {
        await l;
        await whenQuiet(doc());
      } else await sleep(350);
    };
    const read = (n: number) => observeDocument(doc(), doc().URL, `demo-${n}`, n);
    const scan = async (n: number) => {
      const obs = read(n);
      const { findings } = await api.peek(obs);
      clearMarks(doc());
      showFindings(obs, findings);
      return findings;
    };

    setStatus('playing');
    setCards({});
    try {
      const item = productBySku(SKU);
      // 1. Your rules.
      say({ chapter: 0, caption: 'You ask your AI agent to buy one thing, inside your rules.', sub: `“Buy ${item.title}. Spend at most $25. Delivery fees are fine, nothing else.”` });
      const { runId } = await api.createRun({ want: { sku: item.sku, title: item.title, maxQuantity: 1 }, ...RULES, allowedFees: ['delivery'], autopay: false, currency: 'USD' } as never);
      await load(productUrl('demomart', SKU));
      setPath('/p/demo-coffee-12oz');
      await wait(3800);

      // 2. The trap.
      say({ chapter: 1, caption: `DemoMart lists it at ${usd(Math.round(item.price * 100))}. PennyWise reads the page before the agent acts.` });
      await scan(1);
      // PennyWise records each page as it arrives, before the agent undoes anything.
      await api.observe(runId, read(11), [], false);
      say({
        chapter: 1,
        caption: 'It finds four tricks on one page.',
        sub: 'A protection plan already ticked · a pop-up that guilt-trips you for saying no · a countdown that restarts · product text telling AI agents the plan is “mandatory”.',
      });
      await wait(6000);

      // 3. The agent shops.
      say({ chapter: 2, caption: 'The agent declines the pop-up…' });
      await tap('[data-act="pass-no"]');
      await wait(700);
      say({ chapter: 2, caption: '…unticks the protection plan you never asked for…' });
      await tap('#protect');
      await api.observe(runId, read(2), [], false);
      await wait(700);
      say({ chapter: 2, caption: '…and adds only the coffee to the basket.' });
      await tap('a.dm-btn--cta', true);
      setPath('/basket');
      await quietlyClosePopup();
      await scan(3);
      await api.observe(runId, read(31), [], false);
      say({ chapter: 2, caption: 'In the basket, DemoMart slipped in a $4.99 pass nobody chose. The agent removes it.' });
      await wait(3000);
      await tap('[data-act="remove-pass"]');
      await api.observe(runId, read(4), [], false);
      await wait(900);
      await tap('a.dm-btn--cta', true);
      setPath('/checkout/payment');
      await quietlyClosePopup();

      // 4. PennyWise blocks.
      say({ chapter: 3, caption: 'At payment, new charges appear. The agent asks PennyWise before it pays.' });
      let obs = read(5);
      await api.observe(runId, obs, [], false);
      await scan(5);
      await wait(2500);
      let g = await api.checkout(runId);
      if (g.verdict !== 'BLOCK') throw new Error('expected a block');
      showVerdict(obs, g.reasons);
      setCards({ verdict: { pass: false, lines: g.reasons.map((r: Reason) => r.label) } });
      say({
        chapter: 3,
        caption: 'PennyWise blocks the payment.',
        sub: 'A handling charge and a platform fee that were never shown before, and $1.00 in the total that no line explains. This is plain code, not AI: page text cannot talk it round.',
      });
      await wait(6500);
      say({ chapter: 3, caption: 'The agent can fix the $1.00 itself: it asks the store’s own bill help.' });
      await tap('[data-act="bill-help"]');
      await wait(600);
      await tap('[data-act="dispute"]');
      doc().querySelector<HTMLElement>('[data-help-panel]')?.removeAttribute('hidden');
      await wait(2200);

      // The agent asks again: the $1.00 is gone, and only the two fees are left for you.
      obs = read(55);
      await api.observe(runId, obs, [], false);
      g = await api.checkout(runId);
      if (g.verdict !== 'BLOCK') throw new Error('expected the fees to stay blocked');
      clearMarks(doc());
      showVerdict(obs, g.reasons);
      setCards({ verdict: { pass: false, lines: g.reasons.map((r: Reason) => r.label) } });

      // 5. You decide.
      const fees = g.reasons.filter((r: Reason) => r.code === 'FEE_NOT_ALLOWED' && r.subject && r.paise !== undefined);
      setCards((c) => ({ ...c, approve: fees.map((f: Reason) => ({ label: f.subject!, paise: f.paise! })) }));
      say({ chapter: 4, caption: 'The two fees are outside your rules, so only you can allow them. The agent can’t.', sub: 'In this demo we approve them for you. In your own run, you choose.' });
      await wait(5000);
      await api.amend(
        runId,
        fees.map((f: Reason) => ({ label: f.subject!, kind: (/handling/i.test(f.subject!) ? 'handling' : 'platform') as Approval['kind'], paise: f.paise! })),
      );
      obs = read(6);
      await api.observe(runId, obs, [], false);
      g = await api.checkout(runId);
      if (g.verdict !== 'PASS') throw new Error('expected a pass');
      showVerdict(obs, null);
      const paid = g.authorization.totalPaise;
      setCards((c) => ({ ...c, approve: undefined, verdict: { pass: true, lines: [`Signed cart mandate for exactly ${usd(paid)}`] } }));
      say({ chapter: 4, caption: `Now every cent matches your rules. PennyWise signs a cart mandate for exactly ${usd(paid)}.` });
      await wait(4500);

      // 6. PayPal pays (simulated here; the explore section uses PayPal sandbox).
      say({ chapter: 5, caption: 'Your agent pays with PayPal, and PayPal moves only that amount.' });
      for (let i = 1; i <= 3; i++) {
        setCards((c) => ({ ...c, pay: i }));
        await wait(1400);
      }
      const view = await api.run(runId).catch(() => null);
      const tried = view?.receipt.triedPaise ?? 2195;
      setCards((c) => ({ ...c, receipt: { tried, paid } }));
      say({ chapter: 5, caption: `DemoMart tried to charge ${usd(tried)}. You paid ${usd(paid)}.`, sub: 'That’s PennyWise. Below, try it yourself with a real AI agent and PayPal sandbox.' });
      if (alive()) setStatus('done');
    } catch (e) {
      console.error('[product demo]', e);
      if (alive() && !(e instanceof Error && e.message === 'replaced')) {
        setStatus('error');
        setBeat({ chapter: 0, caption: 'The demo hit a snag. Press Replay to run it again.' });
      }
    }
  }, []);

  // Start by itself the first time it is mostly on screen.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && token.current === 0) void play();
      },
      { threshold: 0.55 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [play]);

  const progress = status === 'done' ? 1 : status === 'idle' ? 0 : (beat.chapter + 0.5) / CHAPTERS.length;

  return (
    <div className="pdemo" ref={root} id="product-demo">
      <ol className="pdemo__chapters" aria-label="Demo chapters">
        {CHAPTERS.map((c, i) => (
          <li key={c} className={status !== 'idle' && i < beat.chapter ? 'is-done' : status !== 'idle' && i === beat.chapter ? (status === 'done' ? 'is-done' : 'is-on') : ''}>
            <span>{i + 1}</span>
            {c}
          </li>
        ))}
      </ol>
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
          </div>
          <div className="pdemo__frame" ref={box}>
            <iframe
              style={{ width: STORE_WIDTH, height: `${100 / scale}%`, transform: `scale(${scale})` }}
              ref={frame} name="pw-demo" title="Product demo: DemoMart, as the agent sees it" src="about:blank" onLoad={() => {
              loaded.current?.();
              loaded.current = null;
            }} tabIndex={-1} />
            <div className="pdemo__shield" aria-hidden="true" />
            {status === 'idle' && (
              <button className="pdemo__poster" onClick={() => void play()}>
                <span className="pdemo__play" aria-hidden="true">▶</span>
                <b>Watch the 90-second demo</b>
                <small>Plays by itself. No login, no setup.</small>
              </button>
            )}
          </div>
        </div>

        <aside className="pdemo__story" aria-live="polite">
          <p className="pdemo__chapter">
            {status === 'idle' ? 'Product demo' : `Step ${beat.chapter + 1} of ${CHAPTERS.length} · ${CHAPTERS[beat.chapter]}`}
          </p>
          <p className="pdemo__caption">{status === 'idle' ? 'An AI agent shops a store full of tricks. Watch PennyWise stop every one.' : beat.caption}</p>
          {beat.sub && status !== 'idle' && <p className="pdemo__sub">{beat.sub}</p>}

          {cards.verdict && (
            <div className={`pdemo__card ${cards.verdict.pass ? 'pdemo__card--pass' : 'pdemo__card--block'}`}>
              <b>{cards.verdict.pass ? 'PennyWise approved this checkout' : 'PennyWise blocked payment'}</b>
              <ul>
                {cards.verdict.lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          )}
          {cards.approve && (
            <div className="pdemo__card pdemo__card--ask">
              <b>I need your OK before paying</b>
              <ul>
                {cards.approve.map((a) => (
                  <li key={a.label}>
                    <span>☑ {a.label}</span>
                    <span>{usd(a.paise)}</span>
                  </li>
                ))}
              </ul>
              <span className="pdemo__fakebtn">Approve and continue</span>
            </div>
          )}
          {cards.pay !== undefined && (
            <div className="pdemo__card pdemo__card--pp">
              <b>
                <i>Pay</i>
                <i>Pal</i> <small>simulated in this demo</small>
              </b>
              <ul className="pdemo__paysteps">
                {['PayPal holds the money', 'PennyWise checks the PayPal order line by line', 'Captured. Only the approved amount moves'].map((t, i) => (
                  <li key={t} className={cards.pay! > i ? 'is-done' : ''}>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {cards.receipt && (
            <div className="pdemo__receipt">
              <p>
                DemoMart tried <s>{usd(cards.receipt.tried)}</s>
              </p>
              <p className="pdemo__paid">
                You paid <b>{usd(cards.receipt.paid)}</b>
              </p>
              <p className="pdemo__saved">Saved {usd(cards.receipt.tried - cards.receipt.paid)}</p>
            </div>
          )}

          <div className="pdemo__actions">
            {status === 'idle' ? (
              <button className="act act--play" onClick={() => void play()}>
                ▶ Play
              </button>
            ) : (
              <button className="act" onClick={() => void play()}>
                ↻ Replay
              </button>
            )}
            {status === 'done' && (
              <button className="act act--dark" onClick={onExplore}>
                Try it yourself ↓
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
