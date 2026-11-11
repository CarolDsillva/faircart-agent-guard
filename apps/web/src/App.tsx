import type { Approval, Reason } from '@faircart/guard';
import { formatInr, formatUsd } from '@faircart/money';
import { useEffect, useRef, useState } from 'react';
import { api, type Config, type RunView } from './api';
import { Ledger } from './Ledger';
import { PayPalPay } from './PayPalPay';
import { SCENARIOS, shopUrl, type Scenario, type Store } from './scenarios';
import { useRun, type Entry, type MandateInput } from './useRun';

const FEES: { kind: string; label: string }[] = [
  { kind: 'delivery', label: 'Delivery' },
  { kind: 'handling', label: 'Handling' },
  { kind: 'platform', label: 'Platform fee' },
  { kind: 'convenience', label: 'Convenience fee' },
];

type View = 'home' | 'run' | 'ledger';

/** PennyWise's mark: a coin with a check, drawn rather than borrowed from anyone. */
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="#0f5a43" />
      <circle cx="16" cy="16" r="11.5" fill="none" stroke="#7fd1ae" strokeWidth="1.4" strokeDasharray="2 2.2" />
      <path d="m10.5 16.4 3.6 3.6 7.6-8" stroke="#fff" strokeWidth="2.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function App() {
  const frame = useRef<HTMLIFrameElement>(null);
  const run = useRun(frame);
  const [config, setConfig] = useState<Config | null>(null);
  useEffect(() => {
    api.config().then(setConfig).catch(() => setConfig(null));
  }, []);

  const scenario = SCENARIOS[run.store];
  const [path, setPath] = useState(scenario.paths.item);
  const onFrameLoad = () => {
    run.onFrameLoad();
    const v = new URLSearchParams(frame.current?.contentWindow?.location.search ?? '').get('view');
    setPath(SCENARIOS[run.store].paths[v === 'basket' || v === 'pay' ? v : 'item']);
  };
  const busy = run.phase === 'running' || run.phase === 'paying' || run.phase === 'linking';
  const [view, setView] = useState<View>('home');

  const choose = (s: Store) => {
    run.reset(s);
    setPath(SCENARIOS[s].paths.item);
    setView('run');
  };

  return (
    <div className="app">
      <header className="top">
        <button className="brand" onClick={() => setView('home')} aria-label="PennyWise home">
          <Mark />
          <span className="brand__name">PennyWise</span>
          <span className="brand__product">for PayPal</span>
        </button>
        <nav className="views" aria-label="Views">
          {(
            [
              ['home', 'Home'],
              ['run', 'Agent run'],
              ['ledger', 'Merchant fairness'],
            ] as [View, string][]
          ).map(([v, label]) => (
            <button key={v} className={view === v ? 'is-on' : ''} aria-current={view === v ? 'page' : undefined} onClick={() => setView(v)}>
              {label}
            </button>
          ))}
        </nav>
        <span className="top__spacer" />
        <div className="status" aria-live="polite">
          <span className={`status__item ${run.planner === 'backup' ? 'is-warn' : ''}`}>
            <i aria-hidden="true" />
            {run.planner === 'backup' ? 'Backup planner (no AI)' : 'Gemini planner'}
          </span>
          <span className="status__item">
            <i aria-hidden="true" />
            {config?.paypalMode === 'sandbox' ? 'PayPal sandbox' : 'PayPal simulated'}
          </span>
        </div>
      </header>

      {view === 'home' && <Home onChoose={choose} busy={busy} current={run.store} />}
      {view === 'ledger' && <Ledger />}
      <main className="split" hidden={view !== 'run'}>
        <section className="pane pane--store" aria-label="What the agent sees">
          <div className="task-bar">
            <span className="task-bar__cat">{scenario.category}</span>
            <b>{scenario.task}</b>
            <span className="muted">at {scenario.merchant}</span>
            {!busy && run.phase === 'idle' && (
              <button className="link" onClick={() => setView('home')}>
                Change task
              </button>
            )}
          </div>
          <div className="browser">
            <div className="browser__bar">
              <span className="browser__dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="browser__url">
                <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 7V5a4 4 0 1 1 8 0v2h1v8H3V7h1Zm2 0h4V5a2 2 0 1 0-4 0v2Z" fill="currentColor" /></svg>
                {scenario.domain}
                {path}
              </span>
              <span className={`browser__agent ${busy ? 'is-live' : ''}`}>{busy ? 'Agent is browsing' : 'Agent idle'}</span>
            </div>
            <iframe ref={frame} title={`${scenario.merchant}, as the agent sees it`} src={shopUrl('demomart')} onLoad={onFrameLoad} />
          </div>
        </section>

        <section className="pane pane--run" aria-label="The run">
          {run.phase === 'idle' ? (
            <MandateForm key={run.store} scenario={scenario} onSign={run.start} />
          ) : (
            <>
              <Timeline entries={run.entries} running={run.phase === 'running'} />
              {run.phase === 'linking' && (
                <section className="card card--link">
                  <h2>Link PayPal for this mandate</h2>
                  <p className="muted">
                    {config?.paypalMode === 'sandbox'
                      ? "PayPal opens in a small window. Log in with the sandbox buyer and agree to save PayPal for this merchant. You won't be charged now."
                      : 'PayPal keys are not configured, so linking is simulated. Every other step is real.'}
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
                </section>
              )}
              {run.findings.length > 0 && <Findings findings={run.findings} />}
              {run.phase === 'awaiting' && <AskHuman merchant={scenario.merchant} reasons={run.reasons} onApprove={run.approve} onStop={run.stop} />}
              {(run.phase === 'authorized' || run.phase === 'paying') && run.authorization && config && (
                <section className="card card--pay">
                  <h2>Ready to pay {formatInr(run.authorization.totalPaise)}</h2>
                  <p className="muted">
                    That's {formatUsd(run.authorization.totalUsdCents)} at the demo rate of ₹{run.authorization.rate.inrPerUsd} to US$1. {scenario.merchant} creates the PayPal order and PennyWise checks it line by line before you approve.
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
                </section>
              )}
              {run.phase === 'paid' && run.view && <ReceiptCard view={run.view} storeName={scenario.merchant} simulated={config?.paypalMode !== 'sandbox'} />}
              {run.phase === 'stopped' && <p className="callout">Stopped. Nothing was paid.</p>}
              {run.error && (
                <p className="callout callout--error" role="alert">
                  {run.error}
                </p>
              )}
              {run.phase !== 'running' && run.phase !== 'paying' && (
                <div className="after-run">
                  <button className="btn btn--ghost" onClick={() => run.reset(run.store)}>
                    Run this task again
                  </button>
                  <button className="btn btn--ghost" onClick={() => setView('home')}>
                    Pick another task
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function Home({ onChoose, busy, current }: { onChoose: (s: Store) => void; busy: boolean; current: Store }) {
  const [saved, setSaved] = useState<{ blocked: number; count: number; runs: number } | null>(null);
  useEffect(() => {
    api
      .ledger()
      .then(({ rows }) => setSaved({ runs: rows.length, count: rows.reduce((n, r) => n + r.caught.length, 0), blocked: rows.reduce((n, r) => n + r.caught.reduce((s, c) => s + c.paise, 0), 0) }))
      .catch(() => setSaved(null));
  }, []);
  return (
    <div className="home">
      <section className="hero">
        <p className="hero__kicker">Checkout protection for people and their AI agents</p>
        <h1>
          Your AI can shop for you.
          <br />
          It shouldn't get tricked doing it.
        </h1>
        <p className="hero__lede">
          You sign a mandate once. Your agent shops any store. PennyWise reads every checkout for dark patterns, like pre-ticked add-ons, sneaked fees and charges nobody explains, and lets PayPal move only the money you agreed to.
        </p>
        {saved && saved.runs > 0 && (
          <p className="hero__stat">
            <b>{formatInr(saved.blocked)}</b> in tricks blocked across {saved.runs} agent run{saved.runs === 1 ? '' : 's'} on this server
          </p>
        )}
      </section>

      <section aria-labelledby="tasks-h">
        <h2 id="tasks-h" className="home__h">Give the agent a task</h2>
        <div className="tasks">
          {(Object.values(SCENARIOS) as Scenario[]).map((s) => (
            <article key={s.store} className={`task task--${s.store}`}>
              <header>
                <span className="task__cat">{s.category}</span>
                <span className="task__merchant">{s.merchant}</span>
              </header>
              <h3>{s.task}</h3>
              <p className="task__mandate">
                {s.product.priceLabel} item · at most ₹{s.maxRupees.toLocaleString('en-IN')} · {s.fees.length ? `${s.fees.join(', ')} fee OK` : 'no extra fees'}
              </p>
              <ul className="task__tricks" aria-label={`What ${s.merchant} hides`}>
                {s.tricks.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              <button className="btn btn--primary" disabled={busy} onClick={() => onChoose(s.store)}>
                {busy && current === s.store ? 'Running…' : 'Start this task'}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="how" aria-labelledby="how-h">
        <h2 id="how-h" className="home__h">How a payment gets through</h2>
        <ol>
          <li>
            <b>You sign an intent mandate.</b> What to buy, the most to spend, which fees are fine. Link PayPal once if the agent may pay on its own.
          </li>
          <li>
            <b>The agent shops; PennyWise watches.</b> Every page is read for the 13 dark patterns India's CCPA guidelines name. Tricks are undone, or brought to you.
          </li>
          <li>
            <b>Only a matching cart gets paid.</b> PennyWise signs a cart mandate, the store creates the PayPal order, PennyWise checks it line by line, and only then is it captured.
          </li>
        </ol>
      </section>
    </div>
  );
}

function MandateForm({ scenario, onSign }: { scenario: Scenario; onSign: (m: MandateInput) => void }) {
  const [max, setMax] = useState(scenario.maxRupees);
  const [fees, setFees] = useState<string[]>(scenario.fees);
  const [autopay, setAutopay] = useState(true);
  return (
    <form
      className="card mandate"
      onSubmit={(e) => {
        e.preventDefault();
        onSign({ maxTotalRupees: max, allowedFees: fees, autopay });
      }}
    >
      <p className="mandate__kicker">Intent mandate</p>
      <h2>{scenario.task}</h2>
      <p className="muted">The agent will shop {scenario.merchant} for you. These rules are the only thing that lets money move, and only you can change them.</p>
      <label className="field">
        <span>Buy</span>
        <select disabled value={scenario.product.sku}>
          <option value={scenario.product.sku}>
            {scenario.product.title}, {scenario.product.priceLabel}
          </option>
        </select>
      </label>
      <label className="field">
        <span>Spend at most</span>
        <span className="money-input">
          ₹<input type="number" min={1} max={1000000} value={max} onChange={(e) => setMax(Number(e.target.value))} required />
        </span>
      </label>
      <fieldset className="field">
        <legend>Fees I accept</legend>
        <div className="checks">
          {FEES.map((f) => (
            <label key={f.kind} className="check">
              <input type="checkbox" checked={fees.includes(f.kind)} onChange={(e) => setFees((xs) => (e.target.checked ? [...xs, f.kind] : xs.filter((x) => x !== f.kind)))} />
              {f.label}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="small muted">No add-ons, passes, insurance or subscriptions, ever. The agent can ask you about anything else.</p>
      <label className="autopay">
        <input type="checkbox" checked={autopay} onChange={(e) => setAutopay(e.target.checked)} />
        <span>
          <b>Let the agent pay on its own, inside these rules</b>
          <small>You link PayPal once. The agent pays without a pop-up only when PennyWise signs a cart that matches. Anything outside these rules still comes back to you.</small>
        </span>
      </label>
      <button className="btn btn--primary" type="submit">
        Sign and start shopping
      </button>
    </form>
  );
}

function Timeline({ entries, running }: { entries: Entry[]; running: boolean }) {
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => {
    // scrollIntoView returns a Promise in recent browsers; an effect must not return it.
    void end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [entries.length]);
  const time = (d: Date) => d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  return (
    <section className="panel">
      <h2 className="panel__title">Activity</h2>
      <ol className="feed">
        {entries.map((e) => (
          <li key={e.id} className={`ev ev--${e.kind} ${e.tone ? `ev--${e.tone}` : ''}`}>
            <span className="ev__icon" aria-hidden="true">
              {ICON[e.tone === 'block' ? 'block' : e.tone === 'pass' ? 'pass' : e.kind]}
            </span>
            <div className="ev__body">
              <p className="ev__meta">
                <b>{WHO[e.kind]}</b>
                <time>{time(e.at)}</time>
              </p>
              <p className="ev__title">{e.title}</p>
              {e.detail && <p className="ev__detail">{e.detail}</p>}
            </div>
          </li>
        ))}
        {running && (
          <li ref={end} className="ev ev--thinking">
            <span className="ev__icon" aria-hidden="true">
              <span className="spinner" />
            </span>
            <div className="ev__body">
              <p className="ev__title">Reading the page…</p>
            </div>
          </li>
        )}
      </ol>
    </section>
  );
}

const ICON: Record<string, React.ReactNode> = {
  action: <svg viewBox="0 0 16 16"><path d="M3 2l9 5-4 1-1 4z" fill="currentColor" /></svg>,
  guard: <svg viewBox="0 0 16 16"><path d="M8 1 2 3.5V8c0 3.3 2.5 6.3 6 7 3.5-.7 6-3.7 6-7V3.5L8 1Z" fill="currentColor" /></svg>,
  block: <svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>,
  pass: <svg viewBox="0 0 16 16"><path d="m3.5 8.5 3 3 6-7" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  human: <svg viewBox="0 0 16 16"><circle cx="8" cy="5" r="3" fill="currentColor" /><path d="M2.5 14c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5z" fill="currentColor" /></svg>,
  note: <svg viewBox="0 0 16 16"><path d="M8 3v6M8 12v.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>,
  pay: <svg viewBox="0 0 16 16"><rect x="1.5" y="3.5" width="13" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M1.5 6.5h13" stroke="currentColor" strokeWidth="1.6" /></svg>,
};

const WHO: Record<Entry['kind'], string> = { action: 'Agent', guard: 'Checker', human: 'You', note: 'Note', pay: 'PayPal' };

function Findings({ findings }: { findings: { id: string; title: string; category: string }[] }) {
  return (
    <section className="panel panel--findings">
      <h2 className="panel__title">PennyWise noticed</h2>
      <ul className="findings">
        {findings.map((f) => (
          <li key={f.id}>{f.title}</li>
        ))}
      </ul>
    </section>
  );
}

function AskHuman({ merchant, reasons, onApprove, onStop }: { merchant: string; reasons: Reason[]; onApprove: (a: Approval[]) => void; onStop: () => void }) {
  const fees = reasons.filter((r) => r.code === 'FEE_NOT_ALLOWED' && r.subject && r.paise !== undefined);
  const other = reasons.filter((r) => !fees.includes(r));
  const [picked, setPicked] = useState<string[]>(fees.map((f) => f.subject!));
  const [busy, setBusy] = useState(false);
  const kindOf = (label: string) => (/handling/i.test(label) ? 'handling' : /platform/i.test(label) ? 'platform' : /convenience/i.test(label) ? 'convenience' : /deliver|shipping/i.test(label) ? 'delivery' : 'other');
  return (
    <section className="card card--ask" aria-live="assertive">
      <h2>The agent needs you</h2>
      <p>{merchant} added charges your mandate doesn't allow. The agent can't approve them; only you can.</p>
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
              {r.paise !== undefined ? ` (${formatInr(r.paise)})` : ''}. {r.fixable ? 'The agent will take this up with the store.' : "This can't be approved."}
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        {fees.length > 0 && (
          <button className="btn btn--primary" disabled={!picked.length || busy} onClick={() => {
              setBusy(true);
              onApprove(fees.filter((f) => picked.includes(f.subject!)).map((f) => ({ label: f.subject!, kind: kindOf(f.subject!) as Approval['kind'], paise: f.paise! })));
            }}>
            Approve {picked.length === fees.length ? 'these charges' : 'selected charges'}
          </button>
        )}
        <button className="btn btn--ghost" disabled={busy} onClick={() => {
            setBusy(true);
            onStop();
          }}>
          Stop, don't buy
        </button>
      </div>
    </section>
  );
}

function ReceiptCard({ view, storeName, simulated }: { view: RunView; storeName: string; simulated: boolean }) {
  const r = view.receipt;
  return (
    <section className="receipt" aria-label="Receipt">
      <p className="receipt__store">{storeName} · paid by your shopping agent</p>
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
