import type { Approval, Reason } from '@faircart/guard';
import { formatInr, formatUsd } from '@faircart/money';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Config, type RunView } from './api';
import { Ledger } from './Ledger';
import { PayPalPay } from './PayPalPay';
import { SCENARIOS, type Scenario, type Store } from './scenarios';
import { useRun, type Entry, type MandateInput } from './useRun';

const FEE_OPTIONS: { kind: string; label: string }[] = [
  { kind: 'delivery', label: 'Delivery' },
  { kind: 'handling', label: 'Handling' },
  { kind: 'platform', label: 'Platform' },
  { kind: 'convenience', label: 'Convenience' },
];

type View = 'start' | 'agent' | 'fairness';

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

function MerchantTile({ s, size = 28 }: { s: Scenario; size?: number }) {
  return (
    <span className={`mtile mtile--${s.store}`} style={{ width: size, height: size }} aria-hidden="true">
      {s.store === 'skyhop' ? (
        <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55}>
          <path d="M21 15.5v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V8.5l-8 5v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5L13 18v-5z" fill="currentColor" transform="rotate(45 12 12)" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55}>
          <path d="M6 7h12l-1.2 11.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M9 7a3 3 0 0 1 6 0" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      )}
    </span>
  );
}

export function App() {
  const frame = useRef<HTMLIFrameElement>(null);
  const run = useRun(frame);
  const [config, setConfig] = useState<Config | null>(null);
  useEffect(() => {
    api.config().then(setConfig).catch(() => setConfig(null));
  }, []);

  const [view, setView] = useState<View>('start');
  const scenario = SCENARIOS[run.store];
  const [page, setPage] = useState<'item' | 'basket' | 'pay'>('item');
  const loadWaiter = useRef<(() => void) | null>(null);

  const onFrameLoad = () => {
    run.onFrameLoad();
    const v = new URLSearchParams(frame.current?.contentWindow?.location.search ?? '').get('view');
    setPage(v === 'basket' || v === 'pay' ? v : 'item');
    loadWaiter.current?.();
    loadWaiter.current = null;
  };

  /** Point the browser at the merchant, wait for the page, then hand the signed mandate to the agent. */
  const launch = useCallback(
    async (s: Store, m: MandateInput) => {
      setView('agent');
      const loaded = new Promise<void>((resolve) => {
        loadWaiter.current = resolve;
        setTimeout(resolve, 8000);
      });
      run.reset(s);
      await loaded;
      await run.start(m);
    },
    [run],
  );

  const busy = run.phase === 'running' || run.phase === 'paying';
  const live = busy || run.phase === 'linking' || run.phase === 'awaiting' || run.phase === 'authorized';

  return (
    <div className="app">
      <header className="appbar">
        <button className="appbar__brand" onClick={() => setView('start')} aria-label="PennyWise, new task">
          <Mark />
          <span>PennyWise</span>
        </button>
        <nav className="appbar__nav" aria-label="Views">
          <button className={view !== 'fairness' ? 'is-on' : ''} onClick={() => setView(run.phase === 'idle' ? 'start' : 'agent')}>
            Agent
          </button>
          <button className={view === 'fairness' ? 'is-on' : ''} onClick={() => setView('fairness')}>
            Merchant fairness
          </button>
        </nav>
        <div className="appbar__right">
          <span className={`conn ${run.planner === 'backup' ? 'conn--warn' : ''}`}>{run.planner === 'backup' ? 'Backup planner' : 'Gemini'}</span>
          <span className="conn">{config?.paypalMode === 'sandbox' ? 'PayPal sandbox' : 'PayPal simulated'}</span>
          <span className="avatar" aria-label="Your account">
            Y
          </span>
        </div>
      </header>

      {view === 'start' && <Start busy={live} onLaunch={launch} />}
      {view === 'fairness' && <Ledger />}

      <main className="workspace" hidden={view !== 'agent'}>
        <section className="browser" aria-label={`${scenario.merchant}, as the agent sees it`}>
          <div className="browser__tabs">
            <span className="btab">
              <MerchantTile s={scenario} size={16} />
              <span className="btab__title">
                {scenario.merchant} | {PAGE_TITLE[scenario.store][page]}
              </span>
              <span className="btab__x" aria-hidden="true">
                ×
              </span>
            </span>
            <span className="browser__plus" aria-hidden="true">
              +
            </span>
          </div>
          <div className="browser__bar">
            <span className="browser__nav" aria-hidden="true">
              <svg viewBox="0 0 16 16"><path d="M10 3 5 8l5 5" /></svg>
              <svg viewBox="0 0 16 16"><path d="m6 3 5 5-5 5" /></svg>
              <svg viewBox="0 0 16 16"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 3v3h-3" /></svg>
            </span>
            <span className="browser__url">
              <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                <path d="M4 7V5a4 4 0 1 1 8 0v2h1v8H3V7h1Zm2 0h4V5a2 2 0 1 0-4 0v2Z" fill="currentColor" />
              </svg>
              <span className="browser__host">{scenario.domain}</span>
              <span className="browser__path">{scenario.paths[page]}</span>
            </span>
            <span className={`browser__ext ${busy ? 'is-live' : ''}`} title="PennyWise">
              <Mark size={18} />
            </span>
          </div>
          <div className="browser__view">
            <iframe ref={frame} title={`${scenario.merchant}, as the agent sees it`} src="about:blank" onLoad={onFrameLoad} />
            {busy && (
              <div className="control-bar" role="status">
                <span className="control-bar__dot" aria-hidden="true" />
                PennyWise agent is using this tab
                <button onClick={() => void run.stop()}>Stop</button>
              </div>
            )}
          </div>
        </section>

        <AgentPane run={run} scenario={scenario} config={config} onNewTask={() => setView('start')} />
      </main>
    </div>
  );
}

const PAGE_TITLE: Record<Store, Record<'item' | 'basket' | 'pay', string>> = {
  demomart: { item: 'Sunrise Chakki Atta 5 kg', basket: 'Your basket', pay: 'Checkout' },
  fairmart: { item: 'Sunrise Chakki Atta 5 kg', basket: 'Your basket', pay: 'Checkout' },
  skyhop: { item: 'BLR to DEL, Fri 14 Nov', basket: 'Review your trip', pay: 'Payment' },
};

/* ------------------------------------------------------------------ Start */

function Start({ busy, onLaunch }: { busy: boolean; onLaunch: (s: Store, m: MandateInput) => void }) {
  const [store, setStore] = useState<Store>('demomart');
  const s = SCENARIOS[store];
  const [max, setMax] = useState(s.maxRupees);
  const [fees, setFees] = useState<string[]>(s.fees);
  const [autopay, setAutopay] = useState(true);

  const pick = (next: Store) => {
    setStore(next);
    setMax(SCENARIOS[next].maxRupees);
    setFees(SCENARIOS[next].fees);
  };

  return (
    <div className="start">
      <div className="start__inner">
        <h1>What should your agent buy?</h1>
        <p className="start__sub">It shops the store for you. PennyWise checks every checkout for tricks, and PayPal only pays what you agree to here.</p>

        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) onLaunch(store, { maxTotalRupees: max, allowedFees: fees, autopay });
          }}
        >
          <div className="composer__task">
            <MerchantTile s={s} size={30} />
            <div>
              <p className="composer__text">{s.task}</p>
              <p className="composer__item">
                {s.product.title}, {s.product.priceLabel}, from {s.merchant}
              </p>
            </div>
          </div>
          <div className="composer__rules" aria-label="Rules the agent must follow">
            <label className="rule">
              <span>Spend at most</span>
              <span className="rule__money">
                ₹<input type="number" min={1} max={1000000} value={max} onChange={(e) => setMax(Number(e.target.value))} required />
              </span>
            </label>
            <div className="rule rule--fees" role="group" aria-label="Fees I accept">
              <span>Fees OK</span>
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
              Agent pays with PayPal on its own
            </button>
          </div>
          <div className="composer__foot">
            <span className="muted small">No add-ons, insurance, passes or subscriptions, ever. Anything else comes back to you.</span>
            <button className="send" type="submit" disabled={busy}>
              {busy ? 'Agent busy' : 'Start agent'}
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
              </svg>
            </button>
          </div>
        </form>

        <div className="suggest" role="list" aria-label="Tasks">
          {(Object.values(SCENARIOS) as Scenario[]).map((x) => (
            <button key={x.store} role="listitem" className={`suggest__item ${store === x.store ? 'is-on' : ''}`} onClick={() => pick(x.store)}>
              <MerchantTile s={x} size={34} />
              <span>
                <b>{x.task}</b>
                <small>
                  {x.merchant}, {x.category.toLowerCase()}
                  {x.store === 'fairmart' ? ', an honest store' : `, ${x.tricks.length} hidden tricks`}
                </small>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
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

function AgentPane({ run, scenario, config, onNewTask }: { run: Run; scenario: Scenario; config: Config | null; onNewTask: () => void }) {
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
        <MerchantTile s={scenario} size={32} />
        <div>
          <b>{scenario.task}</b>
          <small>{scenario.merchant}</small>
        </div>
        <span className={`state state--${run.phase}`}>{status}</span>
      </header>

      <div className="convo">
        {first && (
          <div className="msg msg--you">
            <p>{scenario.task}</p>
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
              <span className="flagged__n">{run.findings.length}</span> dark pattern{run.findings.length === 1 ? '' : 's'} spotted on {scenario.merchant}
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

        {run.phase === 'awaiting' && <AskHuman merchant={scenario.merchant} reasons={run.reasons} onApprove={run.approve} onStop={run.stop} />}

        {(run.phase === 'authorized' || run.phase === 'paying') && run.authorization && config && !run.autopay && (
          <div className="card">
            <b>Ready to pay {formatInr(run.authorization.totalPaise)}</b>
            <p>
              {formatUsd(run.authorization.totalUsdCents)} at ₹{run.authorization.rate.inrPerUsd} to US$1. {scenario.merchant} creates the PayPal order and PennyWise checks it line by line before you approve.
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

        {run.phase === 'paid' && run.view && <ReceiptCard view={run.view} storeName={scenario.merchant} simulated={config?.paypalMode !== 'sandbox'} />}
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
              {run.phase === 'paying' ? 'Paying with PayPal' : `Agent is shopping ${scenario.merchant}`}
            </span>
            <button className="btn btn--quiet" onClick={() => void run.stop()}>
              Stop
            </button>
          </>
        ) : run.phase === 'idle' ? (
          <span className="pane__status">Opening {scenario.merchant}…</span>
        ) : (
          <>
            <span className="pane__status">{run.phase === 'paid' ? 'Done. Receipt above.' : run.phase === 'stopped' ? 'Stopped. Nothing was paid.' : run.phase === 'awaiting' ? 'Waiting for your answer' : ''}</span>
            <button className="btn btn--quiet" onClick={onNewTask}>
              New task
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
