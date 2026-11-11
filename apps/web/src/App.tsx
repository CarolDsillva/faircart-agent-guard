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

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2 3 6v6c0 5 3.8 9.4 9 10 5.2-.6 9-5 9-10V6l-9-4Z" fill="currentColor" /><path d="m8 12 3 3 5-6" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <div>
            <h1>FairCart Agent Guard</h1>
            <p>The AI shops. FairCart checks every charge. PayPal only moves the money you approved.</p>
          </div>
        </div>
        <div className="status" aria-live="polite">
          <span className={`pill ${run.planner === 'backup' ? 'pill--warn' : ''}`}>{run.planner === 'backup' ? 'Backup planner (no AI)' : 'Planner: Gemini'}</span>
          <span className="pill">{config?.paypalMode === 'sandbox' ? 'PayPal sandbox' : 'PayPal simulated'}</span>
        </div>
      </header>

      <main className="split">
        <section className="pane pane--store" aria-label="What the agent sees">
          <div className="store-bar">
            <span className="store-bar__title">What the agent sees</span>
            <div className="seg" role="tablist" aria-label="Store">
              {(['demomart', 'fairmart'] as Store[]).map((s) => (
                <button key={s} role="tab" aria-selected={run.store === s} className={run.store === s ? 'is-on' : ''} disabled={run.phase === 'running' || run.phase === 'paying'} onClick={() => run.reset(s)}>
                  {s === 'demomart' ? 'DemoMart (tricky)' : 'FairMart (honest)'}
                </button>
              ))}
            </div>
          </div>
          <iframe ref={frame} title={`${storeName} practice store`} src="/shop.html?view=item&reset=1" onLoad={run.onFrameLoad} />
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
                  <PayPalPay config={config} createOrder={run.createOrder} onCaptured={run.captured} onError={run.payFailed} />
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
      <h2>Your instructions</h2>
      <p className="muted">The agent will shop {storeName} for you. These rules are the only thing that can let money move, and only you can change them.</p>
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
  return (
    <section className="card">
      <h2>What happened</h2>
      <ol className="timeline">
        {entries.map((e) => (
          <li key={e.id} className={`t t--${e.kind} ${e.tone ? `t--${e.tone}` : ''}`}>
            <span className="t__who">{WHO[e.kind]}</span>
            <div>
              <p className="t__title">{e.title}</p>
              {e.detail && <p className="t__detail">{e.detail}</p>}
            </div>
          </li>
        ))}
        {running && (
          <li ref={end} className="t t--thinking">
            <span className="t__who">Agent</span>
            <p className="t__title">Reading the page…</p>
          </li>
        )}
      </ol>
    </section>
  );
}

const WHO: Record<Entry['kind'], string> = { action: 'Agent', guard: 'Checker', human: 'You', note: 'Note', pay: 'PayPal' };

function Findings({ findings }: { findings: { id: string; title: string; category: string }[] }) {
  return (
    <section className="card card--findings">
      <h2>FairCart noticed</h2>
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
          <button className="btn btn--primary" disabled={!picked.length} onClick={() => onApprove(fees.filter((f) => picked.includes(f.subject!)).map((f) => ({ label: f.subject!, kind: kindOf(f.subject!) as Approval['kind'], paise: f.paise! })))}>
            Approve {picked.length === fees.length ? 'these charges' : 'selected charges'}
          </button>
        )}
        <button className="btn btn--ghost" onClick={onStop}>
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
