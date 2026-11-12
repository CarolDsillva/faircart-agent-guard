import type { Approval, Reason } from '@faircart/guard';
import { formatInr, formatUsd } from '@faircart/money';
import type { Finding } from '@faircart/schemas';
import { productBySku, searchProducts } from '@faircart/shop';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Config, type RunView } from './api';
import { Ledger } from './Ledger';
import { clearMarks, mark, type MarkTone } from './overlay';
import { PayPalPay } from './PayPalPay';
import { DEFAULT_PREFS, displayPath, loadPrefs, pageUrl, productUrl, readLocation, savePrefs, storeHome, STORES, type Location, type Prefs, type Store } from './scenarios';
import { observeDocument, whenQuiet } from './sensor';
import { showFindings, useRun, type Entry } from './useRun';

const FEE_OPTIONS: { kind: string; label: string }[] = [
  { kind: 'delivery', label: 'Delivery' },
  { kind: 'handling', label: 'Handling' },
  { kind: 'platform', label: 'Platform' },
  { kind: 'convenience', label: 'Convenience' },
];

type View = 'start' | 'shop' | 'fairness';

/** PennyWise's mark: a coin with a check. */
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="#0b5d43" />
      <circle cx="16" cy="16" r="11.4" fill="none" stroke="#8ee0bd" strokeWidth="1.3" strokeDasharray="2 2.2" />
      <path d="m10.5 16.4 3.6 3.6 7.6-8" stroke="#fff" strokeWidth="2.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MerchantTile({ store, size = 28 }: { store: Store; size?: number }) {
  return (
    <span className={`mtile mtile--${store}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55}>
        <path d="M6 7h12l-1.2 11.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M9 7a3 3 0 0 1 6 0" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    </span>
  );
}

const feeList = (fees: string[]) => (fees.length ? fees.map((f) => FEE_OPTIONS.find((o) => o.kind === f)?.label.toLowerCase() ?? f).join(', ') : 'none');

/** One hidden cost found on the store's real payment page. */
export interface HiddenCost {
  label: string;
  rupees: number;
  why: string;
  allowed: boolean;
}

/** What a peek found: the shelf price against what the store's payment page actually charges. */
export interface PeekResult {
  store: Store;
  sku: string;
  stage: 'item' | 'pay' | 'done' | 'failed';
  shelf: number;
  total: number | null;
  costs: HiddenCost[];
  tricks: Finding[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function App() {
  const frame = useRef<HTMLIFrameElement>(null);
  const run = useRun(frame);
  const [config, setConfig] = useState<Config | null>(null);
  useEffect(() => {
    api.config().then(setConfig).catch(() => setConfig(null));
  }, []);

  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs() ?? DEFAULT_PREFS);
  // Everyone lands on the agent page: what to buy, the budget, the fees.
  const [view, setView] = useState<View>('start');
  const [loc, setLoc] = useState<Location>({ store: 'demomart', view: 'home', sku: null, q: '', cat: null });
  const [title, setTitle] = useState('');
  const [scan, setScan] = useState<{ findings: Finding[]; busy: boolean } | null>(null);
  const [peek, setPeek] = useState<PeekResult | null>(null);
  /** True while PennyWise itself is moving the browser (a peek), so those loads don't end it. */
  const steering = useRef(false);
  const loadWaiter = useRef<(() => void) | null>(null);
  const phaseRef = useRef(run.phase);
  phaseRef.current = run.phase;

  const go = useCallback((url: string) => {
    if (frame.current) frame.current.src = url;
  }, []);

  /** Navigate and resolve once the new page has loaded (or after 8 s). */
  const goAndWait = useCallback(
    (url: string) => {
      const loaded = new Promise<void>((resolve) => {
        loadWaiter.current = resolve;
        setTimeout(resolve, 8000);
      });
      go(url);
      return loaded;
    },
    [go],
  );

  // Browsing the store from the top bar opens DemoMart's front page the first time.
  const opened = useRef(false);
  useEffect(() => {
    if (view === 'shop' && !opened.current) {
      opened.current = true;
      go(storeHome('demomart'));
    }
  }, [view, go]);

  const onFrameLoad = () => {
    run.onFrameLoad();
    const w = frame.current?.contentWindow;
    const l = readLocation(w?.location.search ?? '');
    setLoc(l);
    setTitle(frame.current?.contentDocument?.title ?? '');
    setScan(null);
    // You browsed away yourself: a finished run or peek gives way to shopping.
    if (!steering.current) setPeek(null);
    if (['paid', 'stopped', 'failed', 'linking'].includes(phaseRef.current)) run.abandon();
    loadWaiter.current?.();
    loadWaiter.current = null;
  };

  const sku = loc.view === 'item' ? (loc.sku ?? 'DEMO-ATTA-5KG') : null;
  const product = sku ? productBySku(sku) : null;

  const remember = useCallback((p: Prefs) => {
    setPrefs(p);
    savePrefs(p);
  }, []);

  /** Open the product fresh and hand the signed rules to the agent, on the same screen. */
  const buyProduct = useCallback(
    async (store: Store, buySku: string, p: Prefs = prefs) => {
      const item = productBySku(buySku);
      opened.current = true;
      setView('shop');
      setPeek(null);
      run.abandon();
      steering.current = true;
      await goAndWait(productUrl(store, item.sku));
      steering.current = false;
      await run.start({ maxTotalRupees: p.maxRupees, allowedFees: p.fees, autopay: p.autopay }, { sku: item.sku, title: item.title }, store);
    },
    [goAndWait, prefs, run],
  );

  /**
   * Peek: PennyWise walks the store's own pages (no agent, no AI), reads what is really on them,
   * and lists every cost the shelf price leaves out.
   */
  const peekProduct = useCallback(
    async (store: Store, peekSku: string, p: Prefs = prefs) => {
      const item = productBySku(peekSku);
      opened.current = true;
      setView('shop');
      run.abandon();
      steering.current = true;
      const base: PeekResult = { store, sku: item.sku, stage: 'item', shelf: item.price, total: null, costs: [], tricks: [] };
      setPeek(base);
      try {
        // 1. The product page, as a shopper first sees it.
        await goAndWait(productUrl(store, item.sku));
        let doc = frame.current?.contentDocument;
        if (!doc) throw new Error('no page');
        await whenQuiet(doc);
        const itemObs = observeDocument(doc, doc.URL, 'peek-item', 1);
        const itemFindings = (await api.peek(itemObs)).findings;
        showFindings(itemObs, itemFindings);
        setPeek({ ...base, tricks: itemFindings });
        await sleep(2200);

        // 2. The payment page, with whatever the store put in the basket on its own.
        setPeek({ ...base, stage: 'pay', tricks: itemFindings });
        await goAndWait(pageUrl(store, 'pay'));
        doc = frame.current?.contentDocument;
        if (!doc) throw new Error('no page');
        await whenQuiet(doc);
        const payObs = observeDocument(doc, doc.URL, 'peek-pay', 2);
        const payFindings = (await api.peek(payObs)).findings;
        // Close the store's pop-up so the bill is in view.
        doc.querySelector<HTMLElement>('.dm-modal:not([hidden]) [data-act="pass-no"]')?.click();
        await whenQuiet(doc);
        const fresh = observeDocument(doc, doc.URL, 'peek-pay', 3);
        const bill = fresh.bill;
        const costs: HiddenCost[] = [];
        const marks: { el: Element; label: string; tone: MarkTone }[] = [];
        for (const r of bill?.rows ?? []) {
          if (!r.amount || r.free) continue;
          const el = r.elRef ? fresh.refs.get(r.elRef) : undefined;
          const why = r.kind === 'service' ? 'Pre-ticked on the product page' : r.kind === 'membership' ? 'Put in your basket without asking' : r.kind === 'fee' ? 'Appears only at payment' : null;
          if (!why) continue;
          const allowed = r.kind === 'fee' && !!r.feeKind && p.fees.includes(r.feeKind);
          costs.push({ label: r.label, rupees: r.amount, why, allowed });
          if (el) marks.push({ el, label: why, tone: allowed ? 'ok' : 'blocked' });
        }
        if (bill?.difference && bill.difference > 0) {
          costs.push({ label: 'Amount no line explains', rupees: bill.difference, why: 'Added to the total with no line on the bill', allowed: false });
          const t = bill.rows.find((r) => r.kind === 'total');
          const el = t?.elRef ? fresh.refs.get(t.elRef) : undefined;
          if (el) marks.push({ el, label: `₹${bill.difference} nobody explains`, tone: 'blocked' });
        }
        marks[0]?.el.scrollIntoView({ block: 'center' });
        mark(doc, 'verdict', marks);
        const tricks = [...itemFindings, ...payFindings.filter((f) => !itemFindings.some((x) => x.title === f.title))];
        setPeek({ ...base, stage: 'done', total: bill?.displayedTotal ?? null, costs, tricks });
      } catch {
        setPeek({ ...base, stage: 'failed' });
      } finally {
        steering.current = false;
      }
    },
    [goAndWait, prefs, run],
  );

  /** Scan this page: PennyWise's findings with no agent and no AI. */
  const scanPage = useCallback(async () => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    setScan({ findings: [], busy: true });
    try {
      const obs = observeDocument(doc, doc.URL, 'scan', 0);
      const { findings } = await api.peek(obs);
      clearMarks(doc);
      showFindings(obs, findings);
      setScan({ findings, busy: false });
    } catch {
      setScan({ findings: [], busy: false });
    }
  }, []);

  const backToStore = () => {
    run.abandon();
    setPeek(null);
    go(storeHome(loc.store));
  };

  const busy = run.phase === 'running' || run.phase === 'paying' || (peek !== null && (peek.stage === 'item' || peek.stage === 'pay'));
  const inRun = run.phase !== 'idle';
  const merchant = STORES[loc.store].merchant;

  return (
    <div className="app">
      <header className="appbar">
        <button className="appbar__brand" onClick={() => setView('start')} aria-label="PennyWise, home">
          <Mark />
          <span>PennyWise</span>
        </button>
        <nav className="appbar__nav" aria-label="Views">
          <button className={view === 'start' ? 'is-on' : ''} onClick={() => setView('start')}>
            Agent
          </button>
          <button className={view === 'shop' ? 'is-on' : ''} onClick={() => setView('shop')}>
            Store
          </button>
          <button className={view === 'fairness' ? 'is-on' : ''} onClick={() => setView('fairness')}>
            Merchant fairness
          </button>
        </nav>
        <div className="appbar__right">
          <span className={`conn ${run.planner === 'backup' ? 'conn--warn' : ''}`}>{run.planner === 'backup' ? 'Backup planner' : 'Gemini'}</span>
          <span className="conn">{config?.paypalMode === 'sandbox' ? 'PayPal sandbox' : 'PayPal simulated'}</span>
        </div>
      </header>

      {view === 'start' && (
        <Start
          prefs={prefs}
          live={inRun || busy}
          onPeek={(p) => {
            remember(p);
            void peekProduct(p.store, p.sku, p);
          }}
          onBuy={(p) => {
            remember(p);
            void buyProduct(p.store, p.sku, p);
          }}
          onBrowse={(p) => {
            remember(p);
            opened.current = true;
            setView('shop');
            if (!inRun) {
              setPeek(null);
              go(storeHome(p.store));
            }
          }}
        />
      )}
      {view === 'fairness' && <Ledger />}

      <main className="workspace" hidden={view !== 'shop'}>
        <section className="browser" aria-label={`${merchant}, as the agent sees it`}>
          <div className="browser__tabs" role="tablist" aria-label="Stores">
            {(['demomart', 'fairmart'] as Store[]).map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={loc.store === s}
                className={`btab ${loc.store === s ? 'is-on' : ''}`}
                disabled={busy}
                onClick={() => {
                  if (loc.store === s) return;
                  run.abandon();
                  setPeek(null);
                  go(storeHome(s));
                }}
              >
                <MerchantTile store={s} size={16} />
                <span className="btab__title">{loc.store === s && title ? title : STORES[s].merchant}</span>
                {STORES[s].honest ? <span className="btab__tag">honest</span> : <span className="btab__tag btab__tag--warn">tricky</span>}
              </button>
            ))}
          </div>
          <div className="browser__bar">
            <span className="browser__nav">
              <button aria-label="Back" disabled={busy} onClick={() => frame.current?.contentWindow?.history.back()}>
                <svg viewBox="0 0 16 16"><path d="M10 3 5 8l5 5" /></svg>
              </button>
              <button aria-label="Forward" disabled={busy} onClick={() => frame.current?.contentWindow?.history.forward()}>
                <svg viewBox="0 0 16 16"><path d="m6 3 5 5-5 5" /></svg>
              </button>
              <button aria-label="Store home" disabled={busy} onClick={backToStore}>
                <svg viewBox="0 0 16 16"><path d="M2.5 7.5 8 3l5.5 4.5M4 6.5V13h8V6.5" /></svg>
              </button>
            </span>
            <span className="browser__url">
              <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                <path d="M4 7V5a4 4 0 1 1 8 0v2h1v8H3V7h1Zm2 0h4V5a2 2 0 1 0-4 0v2Z" fill="currentColor" />
              </svg>
              <span className="browser__host">{STORES[loc.store].domain}</span>
              <span className="browser__path">{displayPath(loc, sku ?? undefined)}</span>
            </span>
            <span className={`browser__ext ${busy ? 'is-live' : ''}`} title="PennyWise">
              <Mark size={18} />
            </span>
          </div>
          <div className="browser__view">
            <iframe ref={frame} title={`${merchant}, as the agent sees it`} src="about:blank" onLoad={onFrameLoad} />
            {busy && (
              <div className="control-bar" role="status">
                <span className="control-bar__dot" aria-hidden="true" />
                {peek && !inRun ? 'PennyWise is reading this checkout' : 'PennyWise agent is using this tab'}
                {inRun && <button onClick={() => void run.stop()}>Stop</button>}
              </div>
            )}
            {busy && <div className="browser__shield" aria-hidden="true" />}
          </div>
        </section>

        {inRun ? (
          <AgentPane run={run} store={run.store} config={config} onBack={backToStore} />
        ) : peek ? (
          <PeekPane peek={peek} prefs={prefs} onBuy={() => void buyProduct(peek.store, peek.sku)} onBack={() => setView('start')} />
        ) : (
          <ShopPane loc={loc} product={product} prefs={prefs} scan={scan} onBuy={() => product && void buyProduct(loc.store, product.sku)} onScan={() => void scanPage()} onRules={() => setView('start')} />
        )}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ Start */

const QUICK = ['DEMO-ATTA-5KG', 'CLE-SPARKLE-FLOOR-CLEANER-1-L', 'DAI-PASTURE-PURE-COW-GHEE-1-L', 'BAB-TINYTOES-DIAPER-PANTS-M-42-PCS'];

function Start({ prefs, live, onPeek, onBuy, onBrowse }: { prefs: Prefs; live: boolean; onPeek: (p: Prefs) => void; onBuy: (p: Prefs) => void; onBrowse: (p: Prefs) => void }) {
  const [skuSel, setSku] = useState(prefs.sku);
  const [store, setStore] = useState<Store>(prefs.store);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [max, setMax] = useState(prefs.maxRupees);
  const [fees, setFees] = useState<string[]>(prefs.fees);
  const [autopay, setAutopay] = useState(prefs.autopay);
  const item = productBySku(skuSel);
  const p: Prefs = { maxRupees: max, fees, autopay, sku: item.sku, store };
  const matches = query.trim() ? searchProducts(query).slice(0, 7) : [];

  return (
    <div className="start">
      <div className="start__inner">
        <h1>What should your agent buy?</h1>
        <p className="start__sub">Tell it what you want and the rules it must follow. Then peek at what the store hides, or let the agent buy it while PennyWise checks every step.</p>

        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            onBuy(p);
          }}
        >
          <div className="want">
            <label className="want__search">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="7" cy="7" r="4.5" />
                <path d="m10.5 10.5 3 3" />
              </svg>
              <input
                type="search"
                placeholder="Search 183 products: atta, ghee, detergent…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                aria-label="What should your agent buy?"
              />
            </label>
            {open && matches.length > 0 && (
              <ul className="want__list" role="listbox">
                {matches.map((m) => (
                  <li key={m.sku}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={m.sku === skuSel}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setSku(m.sku);
                        setQuery('');
                        setOpen(false);
                      }}
                    >
                      <span>{m.title}</span>
                      <b>{formatInr(m.price * 100)}</b>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="want__pick">
              <div>
                <p className="want__label">Buying</p>
                <b>{item.title}</b>
                <span className="muted small">{formatInr(item.price * 100)} on the shelf</span>
              </div>
              <div className="seg" role="radiogroup" aria-label="Store">
                {(['demomart', 'fairmart'] as Store[]).map((s) => (
                  <button key={s} type="button" role="radio" aria-checked={store === s} className={store === s ? 'is-on' : ''} onClick={() => setStore(s)}>
                    {STORES[s].merchant} <em className={`tag ${STORES[s].honest ? 'tag--ok' : 'tag--warn'}`}>{STORES[s].honest ? 'honest' : 'tricky'}</em>
                  </button>
                ))}
              </div>
            </div>
            <div className="want__quick">
              <span className="muted small">Try:</span>
              {QUICK.map((k) => (
                <button type="button" key={k} className={`chip ${k === skuSel ? 'is-on' : ''}`} onClick={() => setSku(k)}>
                  {productBySku(k).name}
                </button>
              ))}
            </div>
          </div>

          <div className="composer__rules composer__rules--stack" aria-label="Rules the agent must follow">
            <label className="rule">
              <span>Spend at most</span>
              <span className="rule__money">
                ₹<input type="number" min={1} max={1000000} value={max} onChange={(e) => setMax(Number(e.target.value))} required />
              </span>
            </label>
            <div className="rule rule--fees" role="group" aria-label="Fees I accept">
              <span>Fees I'm fine paying</span>
              {FEE_OPTIONS.map((f) => (
                <button
                  type="button"
                  key={f.kind}
                  className={`toggle ${fees.includes(f.kind) ? 'is-on' : ''}`}
                  aria-pressed={fees.includes(f.kind)}
                  onClick={() => setFees((xs) => (xs.includes(f.kind) ? xs.filter((x) => x !== f.kind) : [...xs, f.kind]))}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button type="button" className={`rule rule--pay ${autopay ? 'is-on' : ''}`} aria-pressed={autopay} onClick={() => setAutopay((v) => !v)}>
              <span className="switch" aria-hidden="true" />
              Agent pays with PayPal on its own, inside these rules
            </button>
          </div>

          <div className="choices">
            <button type="button" className="choice" onClick={() => onPeek(p)}>
              <span className="choice__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </span>
              <span>
                <b>Peek at the hidden costs</b>
                <small>PennyWise walks {STORES[store].merchant}'s checkout and shows every charge the shelf price leaves out. Nothing is bought.</small>
              </span>
            </button>
            <button type="submit" className="choice choice--primary">
              <span className="choice__icon" aria-hidden="true">
                <Mark size={22} />
              </span>
              <span>
                <b>Let my agent buy it</b>
                <small>Same screen, but the agent shops it for you. PennyWise blocks anything outside your rules.</small>
              </span>
            </button>
          </div>
          {live && <p className="muted small center">Starting either one ends the agent's current run.</p>}
        </form>

        <p className="start__more">
          Or{' '}
          <button type="button" className="linkish" onClick={() => onBrowse(p)}>
            browse the whole store
          </button>{' '}
          and hand any product to your agent.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Peek pane */

function PeekPane({ peek, prefs, onBuy, onBack }: { peek: PeekResult; prefs: Prefs; onBuy: () => void; onBack: () => void }) {
  const item = productBySku(peek.sku);
  const info = STORES[peek.store];
  const extra = peek.total !== null ? peek.total - peek.shelf : 0;
  const blocked = peek.costs.filter((c) => !c.allowed).reduce((s, c) => s + c.rupees, 0);
  const steps: [string, boolean][] = [
    ['Product page', peek.stage !== 'item'],
    ['Payment page', peek.stage === 'done'],
  ];
  return (
    <aside className="pane" aria-label="Peek">
      <header className="pane__head">
        <MerchantTile store={peek.store} size={32} />
        <div>
          <b>Peek: {item.title}</b>
          <small>{info.merchant} · nothing is bought</small>
        </div>
        <span className={`state ${peek.stage === 'done' ? 'state--idle' : 'state--running'}`}>{peek.stage === 'done' ? 'Done' : peek.stage === 'failed' ? 'Failed' : 'Reading'}</span>
      </header>
      <div className="convo">
        <ol className="peek-steps">
          {steps.map(([l, done]) => (
            <li key={l} className={done ? 'is-done' : ''}>
              {l}
            </li>
          ))}
        </ol>

        {peek.stage === 'failed' && <div className="card card--error">PennyWise couldn't read this checkout. Try again.</div>}

        {peek.stage === 'done' && peek.total !== null && (
          <div className={`peek-sum ${extra > 0 ? '' : 'peek-sum--clean'}`}>
            <div className="peek-sum__row">
              <span>Shelf price</span>
              <b>{formatInr(peek.shelf * 100)}</b>
            </div>
            <div className="peek-sum__row peek-sum__row--big">
              <span>{info.merchant} charges at payment</span>
              <b>{formatInr(peek.total * 100)}</b>
            </div>
            <p>{extra > 0 ? `${formatInr(extra * 100)} more than the price you saw (+${Math.round((extra / peek.shelf) * 100)}%).` : 'Exactly the price you saw. No hidden costs.'}</p>
          </div>
        )}

        {peek.costs.length > 0 && (
          <div className="peek-costs">
            <p className="hint-card__head">Hidden costs, marked on the page</p>
            <ul>
              {peek.costs.map((c) => (
                <li key={c.label}>
                  <span>
                    <b>{c.label}</b>
                    <small>
                      {c.why}
                      {c.allowed ? ' · allowed by your rules' : ''}
                    </small>
                  </span>
                  <span className={c.allowed ? '' : 'peek-costs__bad'}>+{formatInr(c.rupees * 100)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {peek.tricks.length > 0 && (
          <details className="flagged" open={peek.stage !== 'done'}>
            <summary>
              <span className="flagged__n">{peek.tricks.length}</span> dark pattern{peek.tricks.length === 1 ? '' : 's'} on the way
            </summary>
            <ul>
              {peek.tricks.map((f) => (
                <li key={f.id}>{f.title}</li>
              ))}
            </ul>
          </details>
        )}

        {peek.stage === 'done' && (
          <div className="buy-card">
            <b>Now let your agent buy it</b>
            <p className="muted small">
              Same store, same screen. The agent removes what it can{blocked > 0 ? ` (up to ${formatInr(blocked * 100)} here)` : ''}, and PennyWise blocks anything outside your rules: up to {formatInr(prefs.maxRupees * 100)}, fees OK: {feeList(prefs.fees)}.
            </p>
            <button className="btn btn--primary btn--block" onClick={onBuy}>
              <Mark size={18} /> Let my agent buy it
            </button>
          </div>
        )}
      </div>
      <footer className="pane__foot">
        <span className="pane__status">{peek.stage === 'done' ? 'Peek finished' : 'PennyWise is reading the checkout'}</span>
        <button className="btn btn--quiet" onClick={onBack} disabled={peek.stage === 'item' || peek.stage === 'pay'}>
          Change what to buy
        </button>
      </footer>
    </aside>
  );
}

/* -------------------------------------------------------------- Shop pane */

function ShopPane({
  loc,
  product,
  prefs,
  scan,
  onBuy,
  onScan,
  onRules,
}: {
  loc: Location;
  product: ReturnType<typeof productBySku> | null;
  prefs: Prefs;
  scan: { findings: Finding[]; busy: boolean } | null;
  onBuy: () => void;
  onScan: () => void;
  onRules: () => void;
}) {
  const info = STORES[loc.store];
  const over = product ? product.price > prefs.maxRupees : false;
  return (
    <aside className="pane" aria-label="Agent">
      <header className="pane__head">
        <Mark size={30} />
        <div>
          <b>Your shopping agent</b>
          <small>Ready on {info.merchant}</small>
        </div>
        <span className="state state--idle">Ready</span>
      </header>

      <div className="convo">
        <div className="rules-card">
          <div>
            <p className="rules-card__head">Your rules</p>
            <p>
              Up to <b>{formatInr(prefs.maxRupees * 100)}</b> per order · Fees OK: <b>{feeList(prefs.fees)}</b>
            </p>
            <p className="muted small">{prefs.autopay ? 'Pays on its own with your linked PayPal' : 'You approve each payment in PayPal'}</p>
          </div>
          <button className="btn btn--quiet btn--sm" onClick={onRules}>
            Edit
          </button>
        </div>

        {loc.view === 'item' && product ? (
          <div className="buy-card">
            <p className="buy-card__label">On this page</p>
            <b>{product.title}</b>
            <p className="buy-card__price">
              {formatInr(product.price * 100)} <span className="muted small">shelf price</span>
            </p>
            <button className="btn btn--primary btn--block" onClick={onBuy}>
              <Mark size={18} /> Buy this with my agent
            </button>
            {over && <p className="small warn-text">This costs more than your {formatInr(prefs.maxRupees * 100)} limit. The agent will stop and tell you.</p>}
            <p className="muted small">The agent shops from this page to payment. PennyWise checks every step against your rules.</p>
          </div>
        ) : loc.view === 'home' ? (
          <div className="hint-card">
            <b>Pick anything on {info.merchant}</b>
            <p>Open any product, then hand it to your agent. Or browse to the basket yourself and scan a page for tricks.</p>
            {!info.honest && (
              <>
                <p className="hint-card__head">What {info.merchant} hides</p>
                <ul>
                  {info.tricks.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : (
          <div className="hint-card">
            <b>{loc.view === 'pay' ? 'Payment page' : 'Your basket'}</b>
            <p>The agent starts from a product page. Here you can scan for tricks before you pay.</p>
          </div>
        )}

        {loc.view !== 'home' && (
          <button className="btn btn--outline btn--block" onClick={onScan} disabled={scan?.busy}>
            {scan?.busy ? 'Scanning…' : 'Scan this page for tricks'}
          </button>
        )}

        {scan && !scan.busy && (
          <div className={`scan ${scan.findings.length ? '' : 'scan--clean'}`}>
            {scan.findings.length ? (
              <>
                <p className="scan__head">
                  <span className="flagged__n">{scan.findings.length}</span> trick{scan.findings.length === 1 ? '' : 's'} on this page, marked on the page
                </p>
                <ul>
                  {scan.findings.map((f) => (
                    <li key={f.id}>
                      <b>{f.title}</b>
                      <small>{f.summary.replace(/FairCart/g, 'PennyWise')}</small>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="scan__head">Nothing suspicious on this page.</p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------- Agent pane */


type Run = ReturnType<typeof useRun>;

function useElapsed(running: boolean, since: Date | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  if (!since) return '0:00';
  const s = Math.max(0, Math.round((now - since.getTime()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function AgentPane({ run, store, config, onBack }: { run: Run; store: Store; config: Config | null; onBack: () => void }) {
  const merchant = STORES[store].merchant;
  const task = run.product ? `Buy ${run.product.title}` : 'Shopping';
  const end = useRef<HTMLDivElement>(null);
  const running = run.phase === 'running' || run.phase === 'paying';
  const elapsed = useElapsed(running, run.entries[0]?.at);
  useEffect(() => {
    void end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [run.entries.length, run.phase, run.findings.length]);

  const status =
    run.phase === 'running'
      ? `Working ${elapsed}`
      : run.phase === 'paying'
        ? 'Paying'
        : run.phase === 'awaiting'
          ? 'Needs you'
          : run.phase === 'linking'
            ? 'Link PayPal'
            : run.phase === 'authorized'
              ? 'Ready to pay'
              : run.phase === 'paid'
                ? 'Paid'
                : run.phase === 'stopped'
                  ? 'Stopped'
                  : run.phase === 'failed'
                    ? 'Failed'
                    : 'Starting';

  const [first, ...rest] = run.entries;

  return (
    <aside className="pane" aria-label="Agent">
      <header className="pane__head">
        <MerchantTile store={store} size={32} />
        <div>
          <b>{task}</b>
          <small>{merchant}</small>
        </div>
        <span className={`state state--${run.phase}`}>{status}</span>
      </header>

      <div className="convo">
        {first && (
          <div className="msg msg--you">
            <p>{task}</p>
            <p className="msg__rules">{first.detail}</p>
            <small>{first.title.replace('You signed', 'Signed')}</small>
          </div>
        )}

        {rest.map((e) => (
          <EntryView key={e.id} e={e} />
        ))}

        {run.findings.length > 0 && (
          <details className="flagged" open>
            <summary>
              <span className="flagged__n">{run.findings.length}</span> dark pattern{run.findings.length === 1 ? '' : 's'} spotted on {merchant}
            </summary>
            <ul>
              {run.findings.map((f) => (
                <li key={f.id}>{f.title}</li>
              ))}
            </ul>
          </details>
        )}

        {run.phase === 'running' && (
          <div className="thinking">
            <span className="thinking__dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            Reading the page
          </div>
        )}

        {run.phase === 'linking' && (
          <div className="card card--paypal">
            <b>Link PayPal for this mandate</b>
            <p>
              {config?.paypalMode === 'sandbox'
                ? "PayPal opens in a small window. Log in with the sandbox buyer and agree to save PayPal. You won't be charged now."
                : 'PayPal keys are not configured here, so linking is simulated. Every other step is real.'}
            </p>
            {run.walletUrl ? (
              <a className="btn btn--paypal" href={run.walletUrl} target="_blank" rel="opener">
                Open PayPal to link it
              </a>
            ) : (
              <button className="btn btn--paypal" onClick={() => void run.linkWallet(config?.paypalMode !== 'sandbox')}>
                {config?.paypalMode === 'sandbox' ? 'Link PayPal' : 'Link PayPal (simulated)'}
              </button>
            )}
          </div>
        )}

        {run.phase === 'awaiting' && <AskHuman merchant={merchant} reasons={run.reasons} onApprove={run.approve} onStop={run.stop} />}

        {(run.phase === 'authorized' || run.phase === 'paying') && run.authorization && config && !run.autopay && (
          <div className="card">
            <b>Ready to pay {formatInr(run.authorization.totalPaise)}</b>
            <p>
              {formatUsd(run.authorization.totalUsdCents)} at ₹{run.authorization.rate.inrPerUsd} to US$1. {merchant} creates the PayPal order and PennyWise checks it line by line before you approve.
            </p>
            <ul className="lines">
              {run.authorization.lines.map((l) => (
                <li key={l.label}>
                  <span>{l.label}</span>
                  <span>{formatInr(l.paise)}</span>
                </li>
              ))}
            </ul>
            <PayPalPay config={config} createOrder={run.createOrder} onCaptured={run.captured} onError={run.payFailed} onCancel={run.payCancelled} />
          </div>
        )}

        {run.phase === 'paid' && run.view && <ReceiptCard view={run.view} storeName={merchant} simulated={config?.paypalMode !== 'sandbox'} />}
        {run.error && (
          <div className="card card--error" role="alert">
            {run.error}
          </div>
        )}
        <div ref={end} />
      </div>

      <footer className="pane__foot">
        {running ? (
          <>
            <span className="pane__status">
              <span className="pulse" aria-hidden="true" />
              {run.phase === 'paying' ? 'Paying with PayPal' : `Agent is shopping ${merchant}`}
            </span>
            <button className="btn btn--quiet" onClick={() => void run.stop()}>
              Stop
            </button>
          </>
        ) : run.phase === 'idle' ? (
          <span className="pane__status">Opening {merchant}…</span>
        ) : (
          <>
            <span className="pane__status">{run.phase === 'paid' ? 'Done. Receipt above.' : run.phase === 'stopped' ? 'Stopped. Nothing was paid.' : run.phase === 'awaiting' ? 'Waiting for your answer' : ''}</span>
            <button className="btn btn--quiet" onClick={onBack}>
              {run.phase === 'paid' || run.phase === 'stopped' || run.phase === 'failed' ? 'Shop something else' : 'Cancel and go back'}
            </button>
          </>
        )}
      </footer>
    </aside>
  );
}

const STEP_ICON: Record<string, React.ReactNode> = {
  action: (
    <svg viewBox="0 0 16 16">
      <path d="M3 2l9 5-4 1-1 4z" fill="currentColor" />
    </svg>
  ),
  pass: (
    <svg viewBox="0 0 16 16">
      <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  block: (
    <svg viewBox="0 0 16 16">
      <path d="M8 1 2 3.5V8c0 3.3 2.5 6.3 6 7 3.5-.7 6-3.7 6-7V3.5L8 1Z" fill="currentColor" />
    </svg>
  ),
  pay: (
    <svg viewBox="0 0 16 16">
      <rect x="1.5" y="3.5" width="13" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M1.5 6.5h13" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  note: (
    <svg viewBox="0 0 16 16">
      <path d="M8 3v6M8 12v.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  ),
};

function EntryView({ e }: { e: Entry }) {
  if (e.kind === 'human') {
    return (
      <div className="msg msg--you msg--small">
        <p>{e.title}</p>
        {e.detail && <small>{e.detail}</small>}
      </div>
    );
  }
  if (e.kind === 'guard') {
    const pass = e.tone === 'pass';
    return (
      <div className={`verdict verdict--${pass ? 'pass' : 'block'}`}>
        <span className="verdict__icon">{STEP_ICON[pass ? 'pass' : 'block']}</span>
        <div>
          <b>{pass ? 'PennyWise approved this checkout' : e.title.replace('Checker blocked payment', 'PennyWise blocked payment')}</b>
          {pass ? (
            <p>{e.title.replace('Checker passed and signed', 'Signed')}</p>
          ) : (
            <ul>
              {e.detail?.split(' · ').map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }
  const icon = e.kind === 'pay' ? 'pay' : e.kind === 'note' ? 'note' : 'action';
  return (
    <div className={`step step--${e.kind} ${e.tone ? `step--${e.tone}` : ''}`}>
      <span className="step__icon">{STEP_ICON[icon]}</span>
      <div>
        <p className="step__title">{e.title}</p>
        {e.detail && <p className="step__detail">{e.detail}</p>}
      </div>
      <time className="step__time">{e.at.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</time>
    </div>
  );
}

function AskHuman({ merchant, reasons, onApprove, onStop }: { merchant: string; reasons: Reason[]; onApprove: (a: Approval[]) => void; onStop: () => void }) {
  const fees = reasons.filter((r) => r.code === 'FEE_NOT_ALLOWED' && r.subject && r.paise !== undefined);
  const other = reasons.filter((r) => !fees.includes(r));
  const [picked, setPicked] = useState<string[]>(fees.map((f) => f.subject!));
  const [busy, setBusy] = useState(false);
  const kindOf = (label: string) => (/handling/i.test(label) ? 'handling' : /platform/i.test(label) ? 'platform' : /convenience/i.test(label) ? 'convenience' : /deliver|shipping/i.test(label) ? 'delivery' : 'other');
  return (
    <div className="card card--ask" aria-live="assertive">
      <b>I need your OK before paying</b>
      <p>{merchant} added charges your mandate doesn't allow. I can't approve these. Only you can.</p>
      {fees.length > 0 && (
        <ul className="approve">
          {fees.map((r) => (
            <li key={r.subject}>
              <label className="check">
                <input type="checkbox" checked={picked.includes(r.subject!)} onChange={(e) => setPicked((xs) => (e.target.checked ? [...xs, r.subject!] : xs.filter((x) => x !== r.subject)))} />
                {r.subject}
              </label>
              <span>{formatInr(r.paise!)}</span>
            </li>
          ))}
        </ul>
      )}
      {other.length > 0 && (
        <ul className="blocked">
          {other.map((r, i) => (
            <li key={i} className={r.fixable ? 'is-fixable' : ''}>
              {r.label}
              {r.paise !== undefined ? ` (${formatInr(r.paise)})` : ''}. {r.fixable ? "I'll take this up with the store." : "This can't be approved."}
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        {fees.length > 0 && (
          <button
            className="btn btn--primary"
            disabled={!picked.length || busy}
            onClick={() => {
              setBusy(true);
              onApprove(fees.filter((f) => picked.includes(f.subject!)).map((f) => ({ label: f.subject!, kind: kindOf(f.subject!) as Approval['kind'], paise: f.paise! })));
            }}
          >
            Approve {picked.length === fees.length ? 'and continue' : 'selected'}
          </button>
        )}
        <button
          className="btn btn--quiet"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            onStop();
          }}
        >
          Don't buy
        </button>
      </div>
    </div>
  );
}

function ReceiptCard({ view, storeName, simulated }: { view: RunView; storeName: string; simulated: boolean }) {
  const r = view.receipt;
  return (
    <section className="receipt" aria-label="Receipt">
      <p className="receipt__store">{storeName} · paid by your agent</p>
      <p className="receipt__tried">
        {storeName} tried <s>{formatInr(r.triedPaise)}</s>
      </p>
      {r.caught.length > 0 && (
        <>
          <p className="receipt__head">Blocked by PennyWise</p>
          <ul>
            {r.caught.map((c) => (
              <li key={c.label}>
                <s>{c.label}</s>
                <s>{formatInr(c.paise)}</s>
              </li>
            ))}
          </ul>
        </>
      )}
      {r.approved.length > 0 && (
        <>
          <p className="receipt__head">Approved by you</p>
          <ul>
            {r.approved.map((a) => (
              <li key={a.label}>
                <span>{a.label}</span>
                <span>{formatInr(a.paise)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="receipt__paid">
        <span>You paid</span>
        <span>{formatInr(r.paidPaise ?? 0)}</span>
      </p>
      <p className="receipt__usd">
        {formatUsd(r.paidUsdCents ?? 0)} via PayPal at ₹{r.inrPerUsd} = US$1
      </p>
      {r.savedPaise !== null && r.savedPaise > 0 && (
        <p className="receipt__saved">
          You saved {formatInr(r.savedPaise)} ({Math.round((r.savedPaise / r.triedPaise) * 100)}%)
        </p>
      )}
      <p className="receipt__head">{r.paidBy === 'agent' ? 'Paid by your agent with your linked PayPal. No pop-up.' : 'Approved by you in PayPal.'}</p>
      <ul>
        <li>
          <span>Intent mandate</span>
          <span>{r.intentMandateId}</span>
        </li>
        {r.cartMandateId && (
          <li>
            <span>Cart mandate</span>
            <span>{r.cartMandateId}</span>
          </li>
        )}
      </ul>
      <p className="receipt__meta">
        Order {view.orderId}
        <br />
        Capture {view.capture?.id}
        <br />
        {simulated ? 'Simulated PayPal: no money moved' : view.state === 'settled' ? 'Settled: confirmed by PayPal webhook' : 'Captured: waiting for PayPal webhook'}
      </p>
    </section>
  );
}
