import type { Approval, Reason } from '@faircart/guard';
import { formatInr, formatUsd } from '@faircart/money';
import { useEffect, useRef, useState } from 'react';
import { api, type Config, type RunView } from './api';
import { PayPalPay } from './PayPalPay';
import { PRODUCT, useRun, type Entry, type MandateInput, type Store } from './useRun';

const FEES: { kind: string; label: string }[] = [
  { kind: 'delivery', label: 'Delivery' },
  { kind: 'handling', label: 'Handling' },
  { kind: 'platform', label: 'Platform fee' },
  { kind: 'convenience', label: 'Convenience fee' },
];

export function App() {
  const frame = useRef<HTMLIFrameElement>(null);
  const run = useRun(frame);
  const [config, setConfig] = useState<Config | null>(null);
  useEffect(() => {
    api.config().then(setConfig).catch(() => setConfig(null));
  }, []);

  const storeName = run.store === 'fairmart' ? 'FairMart' : 'DemoMart';
  const [path, setPath] = useState('/atta/sunrise-chakki-atta-5kg');
  const onFrameLoad = () => {
    run.onFrameLoad();
    const view = new URLSearchParams(frame.current?.contentWindow?.location.search ?? '').get('view');
    setPath(view === 'basket' ? '/basket' : view === 'pay' ? '/checkout/payment' : '/atta/sunrise-chakki-atta-5kg');
  };
  const busy = run.phase === 'running' || run.phase === 'paying';

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 2 3 6v6c0 5 3.8 9.4 9 10 5.2-.6 9-5 9-10V6l-9-4Z" fill="currentColor" /><path d="m8 12 3 3 5-6" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <span className="brand__name">FairCart</span>
          <span className="brand__product">Agent Guard</span>
        </div>
        <p className="top__line">The AI shops. FairCart checks every charge. PayPal only moves the money you approved.</p>
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

      <main className="split">
        <section className="pane pane--store" aria-label="What the agent sees">
          <div className="store-switch">
            <span>Store</span>
            <div className="seg" role="tablist" aria-label="Store">
              {(['demomart', 'fairmart'] as Store[]).map((s) => (
                <button key={s} role="tab" aria-selected={run.store === s} className={run.store === s ? 'is-on' : ''} disabled={busy} onClick={() => run.reset(s)}>
                  {s === 'demomart' ? 'DemoMart' : 'FairMart'}
                  <small>{s === 'demomart' ? 'full of tricks' : 'honest'}</small>
                </button>
              ))}
            </div>
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
                {storeName.toLowerCase()}.example{path}
              </span>
              <span className={`browser__agent ${busy ? 'is-live' : ''}`}>{busy ? 'Agent is browsing' : 'Agent idle'}</span>
            </div>
            <iframe ref={frame} title={`${storeName} store, as the agent sees it`} src="/shop.html?view=item&reset=1" onLoad={onFrameLoad} />
          </div>
        </section>

        <section className="pane pane--run" aria-label="The run">
          {run.phase === 'idle' ? (
            <MandateForm storeName={storeName} onSign={run.start} />
          ) : (
            <>
              <Timeline entries={run.entries} running={run.phase === 'running'} />
              {run.findings.length > 0 && <Findings findings={run.findings} />}
              {run.phase === 'awaiting' && <AskHuman reasons={run.reasons} onApprove={run.approve} onStop={run.stop} />}
              {(run.phase === 'authorized' || run.phase === 'paying') && run.authorization && config && (
                <section className="card card--pay">
                  <h2>Ready to pay {formatInr(run.authorization.totalPaise)}</h2>
                  <p className="muted">
                    That's {formatUsd(run.authorization.totalUsdCents)} at the demo rate of ₹{run.authorization.rate.inrPerUsd} to US$1. DemoMart creates the PayPal order and FairCart checks it line by line before you approve.
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
              {run.phase === 'paid' && run.view && <ReceiptCard view={run.view} storeName={storeName} simulated={config?.paypalMode !== 'sandbox'} />}
              {run.phase === 'stopped' && <p className="callout">Stopped. Nothing was paid.</p>}
              {run.error && (
                <p className="callout callout--error" role="alert">
                  {run.error}
                </p>
              )}
              {run.phase !== 'running' && run.phase !== 'paying' && (
                <button className="btn btn--ghost" onClick={() => run.reset(run.store)}>
                  Start a new run
                </button>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function MandateForm({ storeName, onSign }: { storeName: string; onSign: (m: MandateInput) => void }) {
  const [max, setMax] = useState(350);
  const [fees, setFees] = useState<string[]>(['delivery']);
  return (
    <form
      className="card mandate"
      onSubmit={(e) => {
        e.preventDefault();
        onSign({ maxTotalRupees: max, allowedFees: fees });
      }}
    >
      <h2>Send an agent shopping</h2>
      <p className="muted">It will buy from {storeName} for you. These rules are the only thing that lets money move, and only you can change them.</p>
      <label className="field">
        <span>Buy</span>
        <select disabled value={PRODUCT.sku}>
          <option value={PRODUCT.sku}>
            {PRODUCT.title}, ₹{PRODUCT.price}
          </option>
        </select>
      </label>
      <label className="field">
        <span>Spend at most</span>
        <span className="money-input">
          ₹<input type="number" min={1} max={100000} value={max} onChange={(e) => setMax(Number(e.target.value))} required />
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
      <p className="small muted">No add-ons, passes or subscriptions, ever. The agent can ask you about anything else.</p>
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
      <h2 className="panel__title">FairCart noticed</h2>
      <ul className="findings">
        {findings.map((f) => (
          <li key={f.id}>{f.title}</li>
        ))}
      </ul>
    </section>
  );
}

function AskHuman({ reasons, onApprove, onStop }: { reasons: Reason[]; onApprove: (a: Approval[]) => void; onStop: () => void }) {
  const fees = reasons.filter((r) => r.code === 'FEE_NOT_ALLOWED' && r.subject && r.paise !== undefined);
  const other = reasons.filter((r) => !fees.includes(r));
  const [picked, setPicked] = useState<string[]>(fees.map((f) => f.subject!));
  const [busy, setBusy] = useState(false);
  const kindOf = (label: string) => (/handling/i.test(label) ? 'handling' : /platform/i.test(label) ? 'platform' : /convenience/i.test(label) ? 'convenience' : /deliver|shipping/i.test(label) ? 'delivery' : 'other');
  return (
    <section className="card card--ask" aria-live="assertive">
      <h2>The agent needs you</h2>
      <p>DemoMart added charges your instructions don't allow. The agent can't approve them; only you can.</p>
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
          <p className="receipt__head">Blocked by FairCart</p>
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
