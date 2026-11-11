import type { Finding } from '@faircart/schemas';
import { useLayoutEffect, useRef, useState } from 'react';
import { PriceChart } from '../../../src/ui/PriceChart';
import { ago, categoryName, confidenceLabel, inr, pct, severityLabel, sourcesFor, stageLabel, statusLabel, whyItMatters } from '../../../src/ui/format';
import { dismissFinding, openPanel, refs, sendBg } from '../actions';
import { type Box, placeBeside, primaryButtons, rectOf } from '../place';
import { setState, useStore } from '../store';
import { revealFinding } from './App';
import { IconClose, IconPanel } from './icons';

/** Floating card anchored beside the element it explains (or the companion). */
export function CardHost({ fallbackAnchor }: { fallbackAnchor: Box }) {
  const card = useStore((s) => s.card)!;
  const anchorRef = useStore((s) => s.cardAnchor);
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = anchorRef ? refs.get(anchorRef) : undefined;
    const anchor = target ? rectOf(target) : fallbackAnchor;
    setBox(placeBeside(anchor, el.offsetWidth, el.offsetHeight, primaryButtons(), 12));
  });

  const close = () => setState({ card: null, cardAnchor: null });
  return (
    <div
      ref={ref}
      className="fc-card"
      role="dialog"
      aria-modal="false"
      aria-label="FairCart"
      style={box ? { transform: `translate(${box.x}px, ${box.y}px)` } : { visibility: 'hidden' }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button className="fc-card__close" onClick={close} aria-label="Close">
        <IconClose size={14} />
      </button>
      {card.kind === 'finding' && <FindingCard id={card.findingId} />}
      {card.kind === 'summary' && <SummaryCard />}
      {card.kind === 'issues' && <IssuesCard />}
      {card.kind === 'price' && <PriceCard />}
      {card.kind === 'offer' && <OfferCard />}
      {card.kind === 'checkout' && <CheckoutCard />}
      {card.kind === 'element' && <ElementCard text={card.text} hover={card.hover} elRef={card.ref} />}
      {card.kind === 'notice' && (
        <>
          <h3 className="fc-card__title">{card.title}</h3>
          <p className="fc-card__p">{card.body}</p>
        </>
      )}
    </div>
  );
}

function Chip({ tone, children }: { tone: 'high' | 'mid' | 'low' | 'ok' | 'neutral'; children: React.ReactNode }) {
  return <span className={`fc-pill fc-pill--${tone}`}>{children}</span>;
}

function FindingCard({ id }: { id: string }) {
  const f = useStore((s) => s.findings.find((x) => x.id === id));
  const [showSources, setShowSources] = useState(false);
  if (!f) return <p className="fc-card__p">This finding was dismissed or is no longer on the page.</p>;
  const tone = f.severity === 'P0' ? 'high' : f.severity === 'P1' ? 'mid' : 'low';
  return (
    <>
      <div className="fc-card__eyebrow">
        {categoryName(f)}
        <Chip tone={tone}>{severityLabel(f.severity)}</Chip>
        <Chip tone="neutral">{statusLabel(f.status)}</Chip>
      </div>
      <h3 className="fc-card__title">{f.title}</h3>
      <p className="fc-card__p">{f.summary}</p>
      <section className="fc-card__sec">
        <h4>What FairCart saw</h4>
        <ul className="fc-ev">
          {f.evidence.map((e, i) => (
            <li key={i}>
              {e.description}
              {e.observedValue !== null && typeof e.observedValue === 'number' && <span className="fc-ev__val"> ({e.observedValue.toLocaleString('en-IN')})</span>}
            </li>
          ))}
        </ul>
      </section>
      <section className="fc-card__sec">
        <h4>Why it can matter</h4>
        <p>{whyItMatters(f)}</p>
        <p className="fc-muted">{f.consumerImpact}</p>
      </section>
      <section className="fc-card__sec">
        <h4>What you can do</h4>
        <p>{f.recommendedAction}</p>
      </section>
      <div className="fc-conf" aria-label={`Confidence ${Math.round(f.confidence * 100)}%`}>
        <div className="fc-conf__bar">
          <span style={{ width: `${Math.round(f.confidence * 100)}%` }} />
        </div>
        <span>{confidenceLabel(f.confidence)}</span>
      </div>
      {f.limitations.length > 0 && <p className="fc-note">{f.limitations.join(' ')}</p>}
      <button className="fc-link" onClick={() => setShowSources((v) => !v)} aria-expanded={showSources}>
        {showSources ? 'Hide' : 'Show'} research behind this category
      </button>
      {showSources && (
        <ul className="fc-sources">
          {sourcesFor(f).map((s) => (
            <li key={s.id}>
              <b>{s.id}</b> {s.label} <span className="fc-muted">· {s.level}</span>
            </li>
          ))}
          <li className="fc-muted">Research describes the pattern in general. It is not a finding about this retailer.</li>
        </ul>
      )}
      <p className="fc-disclaimer">{f.disclaimer}</p>
      <div className="fc-card__actions">
        <button className="fc-btn" onClick={() => dismissFinding(f.id, 'dismissed')}>
          Dismiss
        </button>
        <button className="fc-btn" onClick={() => dismissFinding(f.id, 'false_positive')} title="Marks this as a false positive on this device">
          Not an issue
        </button>
        <button className="fc-btn fc-btn--ghost" onClick={() => void openPanel('issues')}>
          <IconPanel size={14} /> Panel
        </button>
      </div>
    </>
  );
}

function FindingRow({ f }: { f: Finding }) {
  return (
    <li>
      <button className="fc-row" onClick={() => revealFinding(f.id, f.elementRef)}>
        <span className={`fc-dot fc-dot--${f.severity === 'P0' || f.severity === 'P1' ? 'high' : 'low'}`} />
        <span>
          <b>{f.title}</b>
          <span className="fc-muted">
            {categoryName(f)} · {statusLabel(f.status)}
          </span>
        </span>
      </button>
    </li>
  );
}

function IssuesCard() {
  const findings = useStore((s) => s.findings);
  return (
    <>
      <h3 className="fc-card__title">{findings.length ? `${findings.length} thing${findings.length === 1 ? '' : 's'} worth checking` : 'Nothing flagged on this page'}</h3>
      {findings.length ? (
        <ul className="fc-rows">
          {findings.map((f) => (
            <FindingRow key={f.id} f={f} />
          ))}
        </ul>
      ) : (
        <p className="fc-card__p">FairCart checked this page against all 13 categories in India's dark-pattern guidelines and found nothing with enough evidence to raise. Ordinary offers and labels are not flagged.</p>
      )}
    </>
  );
}

function SummaryCard() {
  const x = useStore((s) => s.extraction);
  const findings = useStore((s) => s.findings);
  if (!x) return <p className="fc-card__p">FairCart couldn't read this page.</p>;
  const price = x.prices.find((p) => p.kind === 'listed');
  return (
    <>
      <div className="fc-card__eyebrow">
        Scan complete <Chip tone={x.readability === 'full' ? 'ok' : x.readability === 'partial' ? 'low' : 'neutral'}>{x.readability === 'full' ? 'Fully read' : x.readability === 'partial' ? 'Partly read' : 'Not readable'}</Chip>
      </div>
      <h3 className="fc-card__title">{stageLabel(x.stage)}</h3>
      {x.identity && (
        <p className="fc-card__p">
          <b>{x.identity.title.slice(0, 90)}</b>
          {price && <> · {inr(price.amount)}</>}
        </p>
      )}
      {x.cards.length > 0 && <p className="fc-card__p">{x.cards.length} results read, {x.cards.filter((c) => c.sponsored === 'labelled').length} labelled as sponsored.</p>}
      {x.bill && <p className="fc-card__p">Order summary found with {x.bill.rows.length} lines.</p>}
      <p className="fc-card__p">{findings.length ? `${findings.length} thing${findings.length === 1 ? '' : 's'} worth checking.` : 'Nothing with enough evidence to flag.'}</p>
      {x.gaps.length > 0 && (
        <ul className="fc-gaps">
          {x.gaps.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      )}
      {findings.length > 0 && (
        <div className="fc-card__actions">
          <button className="fc-btn fc-btn--primary" onClick={() => setState({ card: { kind: 'issues' } })}>
            Show issues
          </button>
        </div>
      )}
    </>
  );
}

function WatchForm({ productKey, current, existing }: { productKey: string; current: number | null; existing: number | null }) {
  const [value, setValue] = useState(existing ? String(existing) : current ? String(Math.floor(current * 0.9)) : '');
  const [saved, setSaved] = useState<string | null>(null);
  const save = async () => {
    const target = Number(value);
    if (!Number.isFinite(target) || target <= 0) return setSaved('Enter a price in rupees.');
    const granted = await chrome.permissions.request({ permissions: ['notifications'] }).catch(() => false);
    await sendBg({ type: 'watch/set', productKey, target });
    setSaved(granted ? `Watching for ${inr(target)} or less.` : `Saved. Notifications are off, so check Saved products in the panel.`);
  };
  return (
    <div className="fc-watch">
      <label htmlFor="fc-watch-input">Alert me at</label>
      <span className="fc-watch__field">
        ₹<input id="fc-watch-input" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ''))} />
      </span>
      <button className="fc-btn" onClick={() => void save()}>
        {existing ? 'Update' : 'Watch'}
      </button>
      {saved && <p className="fc-note">{saved}</p>}
      <p className="fc-note">FairCart checks the price whenever this product page is opened. It does not fetch pages in the background.</p>
    </div>
  );
}

function PriceCard() {
  const tab = useStore((s) => s.tab);
  const loading = useStore((s) => s.tabLoading);
  const x = useStore((s) => s.extraction);
  if (!tab && loading) return <p className="fc-card__p">Loading price history…</p>;
  const h = tab?.history;
  const id = tab?.identity ?? x?.identity;
  if (!id || !h) return <p className="fc-card__p">FairCart needs a product page with a readable price to track history.</p>;
  const best = tab?.offers.find((o) => !o.isCurrent && (o.match.tier === 'exact' || o.match.tier === 'same_model') && o.total.complete && o.total.amount !== null);
  return (
    <>
      <div className="fc-card__eyebrow">Price check</div>
      <h3 className="fc-card__title">{inr(id.price)}</h3>
      <p className="fc-muted fc-clamp">{id.title}</p>
      <div className="fc-stats">
        <div>
          <span>{h.full30 ? '30-day low' : 'Lowest seen'}</span>
          <b>{inr(h.low30 ?? h.lowestSeen)}</b>
        </div>
        <div>
          <span>{h.full30 ? '30-day high' : 'Highest seen'}</span>
          <b>{inr(h.high30 ?? h.highestSeen)}</b>
        </div>
        <div>
          <span>Observations</span>
          <b>{h.count}</b>
        </div>
      </div>
      <p className="fc-note">{h.message}</p>
      {h.points.length >= 2 && <PriceChart points={h.points} low30={h.low30} height={90} compact />}
      {best && (
        <p className="fc-card__p">
          Seen for <b>{inr(best.total.amount)}</b> all-in at {best.retailerName} ({ago(best.observedAt)}).
        </p>
      )}
      {tab?.productKey && <WatchForm productKey={tab.productKey} current={id.price} existing={tab.watch?.target ?? null} />}
      <div className="fc-card__actions">
        <button className="fc-btn" onClick={() => void openPanel('history')}>
          <IconPanel size={14} /> Full history
        </button>
        <button className="fc-btn" onClick={() => void openPanel('compare')}>
          Compare stores
        </button>
      </div>
    </>
  );
}

function OfferCard() {
  const tab = useStore((s) => s.tab);
  const x = useStore((s) => s.extraction);
  const id = tab?.identity ?? x?.identity;
  if (!id) return <p className="fc-card__p">Open a product page to explain its offer.</p>;
  const h = tab?.history;
  const discount = id.mrp && id.price && id.mrp > id.price ? pct(id.mrp - id.price, id.mrp) : null;
  return (
    <>
      <div className="fc-card__eyebrow">Explain this offer</div>
      <h3 className="fc-card__title">{discount !== null ? `${discount}% below the stated M.R.P.` : 'No discount claim found'}</h3>
      <ul className="fc-facts">
        <li>
          <span>Price</span>
          <b>{inr(id.price)}</b>
        </li>
        <li>
          <span>M.R.P. shown</span>
          <b>{id.mrp ? inr(id.mrp) : 'Not shown'}</b>
        </li>
        <li>
          <span>Delivery</span>
          <b>{id.deliveryFee === null ? 'Unknown' : id.deliveryFee === 0 ? 'Free (as shown)' : inr(id.deliveryFee)}</b>
        </li>
        {id.seller && (
          <li>
            <span>Seller</span>
            <b>{id.seller}</b>
          </li>
        )}
      </ul>
      {discount !== null && (
        <p className="fc-card__p">
          The discount is measured against the M.R.P. the seller lists. M.R.P. is a maximum price, not proof of what this item usually sells for.
        </p>
      )}
      {h && discount !== null && (
        <p className="fc-card__p">
          {h.discountCheck === 'supported' && `FairCart saw this item at up to ${inr(h.high30)} in the last 30 days, so the current price is a real drop from recent prices.`}
          {h.discountCheck === 'not_supported' && `In 30 days of tracking FairCart never saw this item above ${inr(h.high30)}. The "deal" compares against an M.R.P. it hasn't sold at recently.`}
          {h.discountCheck === 'insufficient_data' && `${h.message} Until then FairCart can't say whether this is a real drop.`}
        </p>
      )}
      <p className="fc-note">Bank offers, coupons and membership prices are not read in this version, so they are not included.</p>
    </>
  );
}

function CheckoutCard() {
  const x = useStore((s) => s.extraction);
  const findings = useStore((s) => s.findings);
  const bill = x?.bill;
  if (!x || (x.stage !== 'cart' && x.stage !== 'checkout')) return <p className="fc-card__p">Open your cart or checkout summary, then scan again.</p>;
  if (x.sensitive) return <p className="fc-card__p">This page has payment or password fields, so FairCart isn't reading it. Scan the order summary before you reach payment.</p>;
  const addOns = x.controls.filter((c) => c.role === 'add_on' && c.checked);
  const checks: string[] = [];
  if (!bill) checks.push('FairCart could not find a bill with a total on this page. Check the summary yourself.');
  if (bill?.difference) checks.push(`The lines FairCart read add up to ${inr(bill.computedTotal)}, but the total shows ${inr(bill.displayedTotal)}. ${inr(Math.abs(bill.difference))} is not explained by any visible line.`);
  if (bill?.unreadable.length) checks.push(`Amounts FairCart couldn't read: ${bill.unreadable.join(', ')}.`);
  for (const a of addOns) checks.push(`"${a.label.slice(0, 60)}" is ticked. Untick it if you didn't choose it.`);
  return (
    <>
      <div className="fc-card__eyebrow">Checkout scan · read only</div>
      <h3 className="fc-card__title">{bill?.displayedTotal !== null && bill?.displayedTotal !== undefined ? `Total ${inr(bill.displayedTotal)}` : 'Order summary'}</h3>
      {bill && (
        <table className="fc-bill">
          <tbody>
            {bill.rows.map((r) => (
              <tr key={r.elRef} className={`fc-bill__${r.kind}`}>
                <td>{r.label}</td>
                <td className="fc-bill__kind">{r.kind === 'fee' ? (r.feeKind ?? 'fee').replace('_', ' ') : r.kind}</td>
                <td className="fc-num">{r.free ? 'Free' : r.amount === null ? '—' : inr(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {findings.length > 0 && (
        <ul className="fc-rows">
          {findings.map((f) => (
            <FindingRow key={f.id} f={f} />
          ))}
        </ul>
      )}
      {checks.length > 0 && (
        <section className="fc-card__sec">
          <h4>Check before paying</h4>
          <ul className="fc-ev">
            {checks.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      )}
      {!checks.length && !findings.length && <p className="fc-card__p">Every line FairCart read adds up to the total, and nothing extra is ticked.</p>}
      <p className="fc-disclaimer">FairCart only reads this page. It never removes items, unticks options or touches payment.</p>
    </>
  );
}

const ELEMENT_COPY: Record<string, string> = {
  countdown: 'FairCart records this timer each time the page loads. If it goes back up for the same offer, FairCart flags it. One reading alone proves nothing, so reload later to test it.',
  stock: 'FairCart notes low-stock claims. A real shortage is fine; FairCart only raises it when the claim is shown to be invariant or contradicted.',
  sponsored: 'This listing is labelled as a paid placement. Clearly labelled ads are normal; FairCart flags only missing or barely legible labels.',
  addon: 'This is a paid add-on. If it is ticked and FairCart did not see you tick it, it is flagged. You decide whether to keep it.',
  membership: 'This line is a membership or pass. Check its renewal price and how to cancel before you keep it.',
  card: 'Open the product to let FairCart read its exact variant and price, then use Compare prices.',
};

function ElementCard({ text, hover }: { text: string; hover: string | null; elRef: string | null }) {
  return (
    <>
      <div className="fc-card__eyebrow">Element check</div>
      <h3 className="fc-card__title">{hover ? 'Nothing flagged here' : 'Nothing FairCart tracks here'}</h3>
      <blockquote className="fc-quote">{text || '(no text)'}</blockquote>
      <p className="fc-card__p">{hover ? ELEMENT_COPY[hover] : 'FairCart reads prices, fees, timers, stock claims, add-ons, ad labels and bills. This element is none of those, so there is nothing to check.'}</p>
    </>
  );
}
