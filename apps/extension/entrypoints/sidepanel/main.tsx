import type { Finding } from '@faircart/schemas';
import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import type { Offer, PanelTab, TabState } from '../../src/messages';
import type { MatchTier } from '../../src/pricing/match';
import { retailerById } from '../../src/retailers';
import { ago, categoryName, confidenceLabel, inr, pct, severityLabel, sourcesFor, stageLabel, statusLabel, whyItMatters } from '../../src/ui/format';
import { PriceChart } from '../../src/ui/PriceChart';
import { IconExternal, Mark } from '../content/ui/icons';
import '../../src/ui/page.css';
import './sidepanel.css';

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; state: TabState };

const send = <T,>(msg: unknown) => chrome.runtime.sendMessage(msg) as Promise<T>;

function useActiveTabState() {
  const [tabId, setTabId] = useState<number | null>(null);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [requestedTab, setRequestedTab] = useState<PanelTab | null>(null);

  const fetchState = useCallback(async (id: number) => {
    try {
      const res = await send<{ ok: boolean; state?: TabState; panelTab?: PanelTab | null; error?: string }>({ type: 'state/get', tabId: id });
      if (!res?.ok || !res.state) throw new Error(res?.error ?? 'No response from FairCart.');
      setLoad({ status: 'ready', state: res.state });
      if (res.panelTab) setRequestedTab(res.panelTab);
    } catch (e) {
      setLoad({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    const pick = async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id !== undefined) {
        setTabId(tab.id);
        void fetchState(tab.id);
      }
    };
    void pick();
    const onActivated = ({ tabId: id }: { tabId: number }) => {
      setTabId(id);
      setLoad({ status: 'loading' });
      void fetchState(id);
    };
    chrome.tabs.onActivated.addListener(onActivated);
    return () => chrome.tabs.onActivated.removeListener(onActivated);
  }, [fetchState]);

  useEffect(() => {
    if (tabId === null) return;
    const port = chrome.runtime.connect({ name: 'sidepanel' });
    port.onMessage.addListener((m: { type: string; tabId: number | null }) => {
      if (m.type === 'state/changed' && (m.tabId === null || m.tabId === tabId)) void fetchState(tabId);
    });
    const onUpdated = (id: number, info: { status?: string; url?: string }) => {
      if (id === tabId && (info.status === 'complete' || info.url)) void fetchState(id);
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      port.disconnect();
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [tabId, fetchState]);

  return { load, refetch: () => tabId !== null && fetchState(tabId), requestedTab, clearRequested: () => setRequestedTab(null) };
}

function Panel() {
  const { load, refetch, requestedTab, clearRequested } = useActiveTabState();
  const [tab, setTab] = useState<PanelTab>('issues');
  useEffect(() => {
    if (requestedTab) {
      setTab(requestedTab);
      clearRequested();
    }
  }, [requestedTab]);

  if (load.status === 'loading') return <Shell><Empty title="Reading this tab…" body="" /></Shell>;
  if (load.status === 'error')
    return (
      <Shell>
        <Empty title="FairCart couldn't load this tab" body={load.message}>
          <button className="btn" onClick={() => void refetch()}>
            Try again
          </button>
        </Empty>
      </Shell>
    );
  const s = load.state;
  const counts = { issues: s.findings.length, compare: s.offers.filter((o) => !o.isCurrent).length, saved: s.saved.length };

  return (
    <Shell state={s}>
      <nav className="tabs" role="tablist">
        {(
          [
            ['issues', 'Dark patterns', counts.issues],
            ['compare', 'Compare', counts.compare],
            ['history', 'History', null],
            ['saved', 'Saved', counts.saved],
          ] as const
        ).map(([id, label, n]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
            {n ? <span className="tabs__n">{n}</span> : null}
          </button>
        ))}
      </nav>
      <div className="tabpanel" role="tabpanel">
        {tab !== 'saved' && <PageGate s={s} />}
        {tab === 'issues' && <IssuesTab s={s} />}
        {tab === 'compare' && <CompareTab s={s} />}
        {tab === 'history' && <HistoryTab s={s} />}
        {tab === 'saved' && <SavedTab s={s} />}
      </div>
    </Shell>
  );
}

function Shell({ state, children }: { state?: TabState; children: React.ReactNode }) {
  const r = state?.retailer;
  return (
    <div className="panel">
      <header className="ctx">
        <span className="ctx__mark">
          <Mark size={18} />
        </span>
        <div className="ctx__body">
          <div className="ctx__line">
            <b>{r?.name ?? 'FairCart'}</b>
            {state?.page && <span className="muted">· {stageLabel(state.page.stage)}</span>}
            {r && (r.id === 'generic' ? <span className="pill pill--warn">Demo</span> : <span className={`pill ${r.support === 'full' ? 'pill--ok' : ''}`}>{r.support === 'full' ? 'Full support' : r.support === 'generic' ? 'Limited' : 'Not supported'}</span>)}
          </div>
          {state?.identity ? <div className="ctx__title">{state.identity.title}</div> : <div className="ctx__title muted">{r ? 'No product on this page' : 'Not a shopping page FairCart covers'}</div>}
        </div>
        <button className="ctx__gear" onClick={() => void chrome.runtime.openOptionsPage()} aria-label="Settings" title="Settings">
          ⚙
        </button>
      </header>
      {children}
    </div>
  );
}

function Empty({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {children}
    </div>
  );
}

/** Explains when FairCart can't help on this tab, and how to change that. */
function PageGate({ s }: { s: TabState }) {
  if (!s.retailer)
    return (
      <Empty title="Open a supported shopping site" body="FairCart works on Amazon India, Flipkart and the other sites listed in settings. It does nothing on other websites.">
        <a className="btn" href={chrome.runtime.getURL('/demo.html')} target="_blank" rel="noreferrer">
          Try the demo shop
        </a>
        <p className="small muted" style={{ marginTop: 10 }}>A fictional store with planted dark patterns, to see FairCart at work.</p>
      </Empty>
    );
  if (s.retailer.support === 'not_supported') return <Empty title={`${s.retailer.name} isn't supported`} body={retailerById(s.retailer.id)?.note ?? ''} />;
  if (!s.enabled) {
    const r = retailerById(s.retailer.id)!;
    return (
      <Empty title={`FairCart is off for ${r.name}`} body="Turn it on to let FairCart read prices, fees and offers on this site. Chrome will ask you to confirm.">
        <button
          className="btn btn--primary"
          onClick={async () => {
            if (await chrome.permissions.request({ origins: r.origins })) await send({ type: 'sites/refresh' });
          }}
        >
          Turn on for {r.name}
        </button>
      </Empty>
    );
  }
  if (s.paused)
    return (
      <Empty title={`Paused on ${s.retailer.name}`} body="FairCart isn't reading this site until you resume.">
        <button className="btn" onClick={() => void send({ type: 'site/pause', retailer: s.retailer!.id, paused: false })}>
          Resume
        </button>
      </Empty>
    );
  if (!s.page) return <Empty title="Waiting for the page" body="Reload the tab if FairCart was just turned on for this site." />;
  if (s.page.sensitive) return <Empty title="Not reading this page" body="It has password or payment fields. FairCart skips these pages entirely." />;
  return null;
}

// ── Dark patterns ──────────────────────────────────────────────────────────

function FindingItem({ f, dismissed = false }: { f: Finding; dismissed?: boolean }) {
  const [open, setOpen] = useState(false);
  const high = f.severity === 'P0' || f.severity === 'P1';
  return (
    <li className={`finding ${open ? 'is-open' : ''}`}>
      <button className="finding__head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={`dot ${high ? 'dot--high' : ''}`} />
        <span className="finding__t">
          <b>{f.title}</b>
          <span className="muted small">
            {categoryName(f)} · {severityLabel(f.severity)} · {statusLabel(f.status)}
          </span>
        </span>
      </button>
      {open && (
        <div className="finding__body">
          <p>{f.summary}</p>
          <h4>What FairCart saw</h4>
          <ul>
            {f.evidence.map((e, i) => (
              <li key={i}>
                {e.description} <span className="muted small">({stageLabel(e.stage)}, {ago(e.timestamp)})</span>
              </li>
            ))}
          </ul>
          <h4>Why it can matter</h4>
          <p>{whyItMatters(f)}</p>
          <h4>What you can do</h4>
          <p>{f.recommendedAction}</p>
          <p className="small muted">
            {confidenceLabel(f.confidence)} ({Math.round(f.confidence * 100)}%). {f.limitations.join(' ')}
          </p>
          <details>
            <summary className="small">Research behind this category</summary>
            <ul className="small">
              {sourcesFor(f).map((s) => (
                <li key={s.id}>
                  {s.id} · {s.label} <span className="muted">({s.level})</span>
                </li>
              ))}
            </ul>
            <p className="small muted">These sources describe the pattern in general. They are not findings about this retailer.</p>
          </details>
          <p className="small muted">{f.disclaimer}</p>
          <div className="row">
            {dismissed ? (
              <button className="btn btn--small" onClick={() => void send({ type: 'finding/restore', id: f.id })}>
                Restore
              </button>
            ) : (
              <>
                <button className="btn btn--small" onClick={() => void send({ type: 'finding/dismiss', id: f.id, reason: 'dismissed' })}>
                  Dismiss
                </button>
                <button className="btn btn--small" onClick={() => void send({ type: 'finding/dismiss', id: f.id, reason: 'false_positive' })}>
                  Not an issue
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function IssuesTab({ s }: { s: TabState }) {
  if (!s.page || s.page.sensitive || !s.enabled || s.paused) return null;
  return (
    <>
      <section className="sec">
        <h2>{s.findings.length ? `${s.findings.length} thing${s.findings.length === 1 ? '' : 's'} worth checking` : 'Nothing flagged on this page'}</h2>
        <p className="muted small">
          Checked against all 13 categories in India's 2023 dark-pattern guidelines. Read {ago(s.page.scannedAt)} · {s.page.readability === 'full' ? 'page fully read' : s.page.readability === 'partial' ? 'page partly read' : 'page not readable'}.
        </p>
        {s.findings.length > 0 && (
          <ul className="findings">
            {s.findings.map((f) => (
              <FindingItem key={f.id} f={f} />
            ))}
          </ul>
        )}
        {s.page.gaps.length > 0 && (
          <ul className="gaps">
            {s.page.gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        )}
      </section>
      {s.bill && <Checkout s={s} />}
      {s.silentRules.length > 0 && (
        <section className="sec">
          <h3 className="eyebrow">Checked and not raised</h3>
          <ul className="cleared">
            {s.silentRules.map((r) => (
              <li key={r.ruleId}>
                <b>{r.ruleId}</b>
                <span className="muted small">{r.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {s.journey && (
        <section className="sec">
          <h3 className="eyebrow">This shopping journey</h3>
          <p className="small muted">
            {s.journey.stages.map(stageLabel).join(' → ')} · started {ago(s.journey.startedAt)}. FairCart compares these steps to spot items or fees that appear along the way.
          </p>
        </section>
      )}
      {s.dismissed.length > 0 && (
        <section className="sec">
          <h3 className="eyebrow">Dismissed</h3>
          <ul className="findings">
            {s.dismissed.map((f) => (
              <FindingItem key={f.id} f={f} dismissed />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Checkout({ s }: { s: TabState }) {
  const b = s.bill!;
  return (
    <section className="sec">
      <h3 className="eyebrow">Checkout breakdown · read only</h3>
      <table className="bill">
        <tbody>
          {b.rows.map((r) => (
            <tr key={r.elRef} className={`bill__${r.kind}`}>
              <td>{r.label}</td>
              <td className="muted small">{r.kind === 'fee' ? (r.feeKind ?? 'fee').replace('_', ' ') : r.kind}</td>
              <td className="num right">{r.free ? 'Free' : r.amount === null ? 'Unreadable' : inr(r.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {b.difference ? (
        <p className="callout callout--warn">
          The lines add up to {inr(b.computedTotal)}, but the total shows {inr(b.displayedTotal)}. {inr(Math.abs(b.difference))} isn't explained by a visible line. Check the bill yourself.
        </p>
      ) : b.computedTotal !== null ? (
        <p className="small muted">Every line FairCart read adds up to the total shown.</p>
      ) : (
        <p className="small muted">Some amounts couldn't be read, so FairCart didn't check the arithmetic.</p>
      )}
    </section>
  );
}

// ── Compare ────────────────────────────────────────────────────────────────

const TIER_LABEL: Record<MatchTier, string> = {
  exact: 'Exact match',
  same_model: 'Same model, other seller',
  variant_differs: 'Different variant',
  substitute: 'Similar alternative',
  different: 'Different',
};
type Filter = 'exact' | 'model' | 'similar' | 'lowest';

function whyCheaper(o: Offer, current: Offer | undefined): string | null {
  if (!current || o.isCurrent || o.total.amount === null || current.total.amount === null || o.total.amount >= current.total.amount) return null;
  const parts: string[] = [];
  if (o.price !== null && current.price !== null && o.price < current.price) parts.push(`item is ${inr(current.price - o.price)} less`);
  if ((o.deliveryFee ?? 0) < (current.deliveryFee ?? 0)) parts.push('delivery is cheaper');
  if (o.match.tier !== 'exact') parts.push(`it is a ${TIER_LABEL[o.match.tier].toLowerCase()}`);
  if (o.stale) parts.push(`the price was seen ${ago(o.observedAt)} and may have changed`);
  return `Cheaper because ${parts.join('; ')}. Coupons, bank offers and memberships were not read on either page.`;
}

function CompareTab({ s }: { s: TabState }) {
  const [filter, setFilter] = useState<Filter>('exact');
  const current = s.offers.find((o) => o.isCurrent);
  const rows = useMemo(() => {
    const keep: Record<Filter, MatchTier[]> = {
      exact: ['exact'],
      model: ['exact', 'same_model'],
      similar: ['exact', 'same_model', 'variant_differs', 'substitute'],
      lowest: ['exact', 'same_model', 'variant_differs', 'substitute'],
    };
    return s.offers.filter((o) => keep[filter].includes(o.match.tier));
  }, [s.offers, filter]);
  if (!s.identity) return s.page && s.enabled ? <Empty title="Open a product page" body="Comparison works from a product page, where FairCart can read the exact item and variant." /> : null;

  return (
    <>
      <section className="sec">
        <div className="row between">
          <h2>Where else you've seen it</h2>
        </div>
        <div className="seg" role="group" aria-label="Show">
          {(
            [
              ['exact', 'Exact'],
              ['model', 'Same model'],
              ['similar', 'Similar'],
              ['lowest', 'Lowest total'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
        <p className="small muted">Ranked by lowest effective total (item + known delivery). A total with an unknown charge is shown as a minimum and ranked after complete totals.</p>
        <ul className="offers">
          {rows.map((o) => {
            const why = whyCheaper(o, current);
            return (
              <li key={o.productKey} className={`offer ${o.isCurrent ? 'offer--current' : ''}`}>
                <div className="offer__top">
                  <b>{o.retailerName}</b>
                  {o.isCurrent ? <span className="pill pill--accent">This page</span> : <span className={`pill ${o.match.tier === 'exact' ? 'pill--ok' : ''}`}>{TIER_LABEL[o.match.tier]}</span>}
                  <span className="offer__total num">
                    {o.total.amount === null ? 'Price unknown' : o.total.complete ? inr(o.total.amount) : `${inr(o.total.amount)} + unknown`}
                  </span>
                </div>
                <div className="offer__title small">{o.title}</div>
                <div className="offer__meta small muted">
                  Item {inr(o.price)} · Delivery {o.deliveryFee === null ? 'unknown' : o.deliveryFee === 0 ? 'free' : inr(o.deliveryFee)}
                  {o.variantLabel ? ` · ${o.variantLabel}` : ''}
                  {o.seller ? ` · ${o.seller}` : ''}
                </div>
                <div className="offer__meta small muted">
                  {o.isCurrent ? 'Read just now' : `Seen ${ago(o.observedAt)}`}
                  {o.stale && <span className="pill pill--warn" style={{ marginLeft: 6 }}>May be out of date</span>}
                  {!o.isCurrent && ` · ${Math.round(o.match.confidence * 100)}% match: ${o.match.reasons.join(' ')}`}
                </div>
                {why && <p className="small why">{why}</p>}
                {!o.isCurrent && (
                  <a className="small" href={o.url} target="_blank" rel="noreferrer">
                    View at {o.retailerName} <IconExternal size={12} />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
        {rows.filter((o) => !o.isCurrent).length === 0 && (
          <p className="small muted">FairCart hasn't seen {filter === 'exact' ? 'an exact match for this product' : 'a matching product'} at another store yet. That doesn't mean there isn't one: it only knows stores you've browsed.</p>
        )}
      </section>
      {s.notChecked.length > 0 && (
        <section className="sec">
          <h3 className="eyebrow">Not checked yet</h3>
          <p className="small muted">Open the product at these stores and FairCart will read it there and add it here. It doesn't fetch other stores itself.</p>
          <ul className="notchecked">
            {s.notChecked.map((n) => (
              <li key={n.retailer}>
                <span>{n.retailerName}</span>
                {n.searchUrl ? (
                  <a className="btn btn--small" href={n.searchUrl} target="_blank" rel="noreferrer">
                    Search there <IconExternal size={12} />
                  </a>
                ) : (
                  <span className="muted small">No search link</span>
                )}
                {!n.enabled && <span className="muted small">FairCart is off there</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="sec">
        <h3 className="eyebrow">Price sources</h3>
        <ul className="providers">
          {s.providers.map((p) => (
            <li key={p.id}>
              <span className={`pdot pdot--${p.status}`} />
              <span>
                <b>{p.name}</b>
                <span className="muted small">{p.note}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

// ── History ────────────────────────────────────────────────────────────────

function WatchControl({ s }: { s: TabState }) {
  const current = s.identity?.price ?? null;
  const [value, setValue] = useState(s.watch ? String(s.watch.target) : current ? String(Math.floor(current * 0.9)) : '');
  const [note, setNote] = useState<string | null>(null);
  if (!s.productKey) return null;
  const save = async () => {
    const target = Number(value);
    if (!Number.isFinite(target) || target <= 0) return setNote('Enter a price in rupees.');
    const granted = await chrome.permissions.request({ permissions: ['notifications'] }).catch(() => false);
    await send({ type: 'watch/set', productKey: s.productKey, target });
    setNote(granted ? `You'll get a notification when FairCart sees ${inr(target)} or less.` : 'Saved. Notifications are off, so check the Saved tab.');
  };
  return (
    <section className="sec">
      <h3 className="eyebrow">Price alert</h3>
      <div className="row">
        <label className="field">
          ₹<input inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ''))} aria-label="Target price" />
        </label>
        <button className="btn" onClick={() => void save()}>
          {s.watch ? 'Update alert' : 'Watch price'}
        </button>
        {s.watch && (
          <button className="btn btn--small" onClick={() => void send({ type: 'watch/set', productKey: s.productKey, target: null })}>
            Remove
          </button>
        )}
      </div>
      <p className="small muted">{note ?? 'Alerts fire when FairCart sees this product at or below your target on a page you open. It does not check in the background.'}</p>
    </section>
  );
}

function HistoryTab({ s }: { s: TabState }) {
  const h = s.history;
  if (!s.identity || !h) return s.page && s.enabled ? <Empty title="Open a product page" body="Price history is kept per product and variant." /> : null;
  const discount = s.identity.mrp && s.identity.price && s.identity.mrp > s.identity.price ? pct(s.identity.mrp - s.identity.price, s.identity.mrp) : null;
  return (
    <>
      <section className="sec">
        <div className="stats">
          <div>
            <span>Now</span>
            <b className="num">{inr(s.identity.price)}</b>
          </div>
          <div>
            <span>{h.full30 ? '30-day low' : 'Lowest seen'}</span>
            <b className="num">{inr(h.low30 ?? h.lowestSeen)}</b>
          </div>
          <div>
            <span>{h.full30 ? '30-day high' : 'Highest seen'}</span>
            <b className="num">{inr(h.high30 ?? h.highestSeen)}</b>
          </div>
          <div>
            <span>30-day median</span>
            <b className="num">{h.median30 !== null ? inr(h.median30) : '—'}</b>
          </div>
        </div>
        <p className={`callout ${h.full30 ? '' : 'callout--info'}`}>{h.message}</p>
        {h.aboveLow !== null && h.aboveLow > 0 && <p className="small">Now {inr(h.aboveLow)} above the {h.full30 ? '30-day low' : 'lowest price FairCart has seen'}.</p>}
        {h.aboveLow === 0 && h.count > 1 && <p className="small">This is the lowest price FairCart has seen{h.full30 ? ' in 30 days' : ''}.</p>}
        {discount !== null && (
          <p className="small">
            Claimed discount: {discount}% off M.R.P. {inr(s.identity.mrp)}.{' '}
            {h.discountCheck === 'supported' && 'FairCart saw higher prices in the last 30 days, so this is a real drop.'}
            {h.discountCheck === 'not_supported' && `FairCart never saw it above ${inr(h.high30)} in 30 days, so the discount is against a price it hasn't sold at recently.`}
            {h.discountCheck === 'insufficient_data' && 'Not enough history yet to say whether this is a real drop.'}
          </p>
        )}
        {h.points.length >= 2 ? <PriceChart points={h.points} low30={h.low30} /> : <p className="small muted">The chart appears after FairCart has seen this product at least twice.</p>}
      </section>
      <WatchControl s={s} />
      {h.points.length > 0 && (
        <section className="sec">
          <h3 className="eyebrow">Observations · this device</h3>
          <table className="obs">
            <tbody>
              {[...h.points]
                .reverse()
                .slice(0, 12)
                .map((p) => (
                  <tr key={p.at}>
                    <td>{new Date(p.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="num right">{inr(p.price)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <p className="small muted">Each row is a price FairCart read on this product page in your browser. Same product and variant only.</p>
        </section>
      )}
    </>
  );
}

// ── Saved ──────────────────────────────────────────────────────────────────

function SavedTab({ s }: { s: TabState }) {
  if (!s.saved.length) return <Empty title="No saved products" body="Set a price alert on a product's History tab and it will appear here." />;
  return (
    <section className="sec">
      <ul className="saved">
        {s.saved.map((p) => {
          const reached = p.lastPrice !== null && p.watch && p.lastPrice <= p.watch.target;
          return (
            <li key={p.productKey}>
              <div className="row between">
                <b className="saved__t">{p.identity.title}</b>
                {reached ? <span className="pill pill--ok">Target reached</span> : <span className="pill">Watching</span>}
              </div>
              <div className="small muted">
                {retailerById(p.identity.retailer)?.name} · last {inr(p.lastPrice)} ({ago(p.lastSeen)}) · target {inr(p.watch?.target)} · lowest seen {inr(p.lowestSeen)}
              </div>
              <div className="row">
                <a className="btn btn--small" href={p.identity.url} target="_blank" rel="noreferrer">
                  Open <IconExternal size={12} />
                </a>
                <button className="btn btn--small" onClick={() => void send({ type: 'saved/remove', productKey: p.productKey })}>
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Panel />);
