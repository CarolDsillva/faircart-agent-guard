import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { retailerForUrl } from '../../../src/retailers';
import { stageLabel } from '../../../src/ui/format';
import { openPanel, pauseSite, refreshTab, sendBg } from '../actions';
import { type Box, placeBeside, primaryButtons } from '../place';
import { setState, useStore } from '../store';
import { rescanAndSummarise } from './App';
import { IconCompare, IconEyeOff, IconGear, IconHistory, IconList, IconPause, IconReceipt, IconScan, IconTag, IconTarget, Mark } from './icons';

interface Item {
  key: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  disabled?: string;
  run: () => void;
}

export function Menu({ anchor, status, paused }: { anchor: Box; status: string; paused: boolean }) {
  const extraction = useStore((s) => s.extraction);
  const findings = useStore((s) => s.findings);
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  const retailer = retailerForUrl(location.href);
  const stage = extraction?.stage;
  const hasProduct = !!extraction?.identity;
  const isCheckout = stage === 'cart' || stage === 'checkout';

  const items: Item[] = [
    { key: 's', label: 'Scan this page', icon: <IconScan />, run: rescanAndSummarise, disabled: paused ? 'Paused on this site' : undefined },
    { key: 'e', label: 'Check an element', hint: 'Click any part of the page', icon: <IconTarget />, run: () => setState({ picking: true, menuOpen: false, card: null }) },
    {
      key: 'c',
      label: 'Compare prices',
      icon: <IconCompare />,
      disabled: hasProduct ? undefined : 'Open a product page first',
      run: () => {
        setState({ menuOpen: false });
        void openPanel('compare');
      },
    },
    {
      key: 'h',
      label: 'Price history',
      icon: <IconHistory />,
      disabled: hasProduct ? undefined : 'Open a product page first',
      run: () => {
        void refreshTab();
        setState({ card: { kind: 'price' }, cardAnchor: null, menuOpen: false });
      },
    },
    {
      key: 'o',
      label: 'Explain this offer',
      icon: <IconTag />,
      disabled: hasProduct ? undefined : 'Open a product page first',
      run: () => {
        void refreshTab();
        setState({ card: { kind: 'offer' }, cardAnchor: null, menuOpen: false });
      },
    },
    {
      key: 'k',
      label: 'Scan checkout',
      icon: <IconReceipt />,
      disabled: isCheckout ? undefined : 'Open your cart or checkout first',
      run: () => setState({ card: { kind: 'checkout' }, cardAnchor: null, menuOpen: false }),
    },
    {
      key: 'i',
      label: findings.length ? `Show all issues (${findings.length})` : 'Show all issues',
      icon: <IconList />,
      run: () => setState({ card: { kind: 'issues' }, cardAnchor: null, menuOpen: false }),
    },
  ];

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setBox(placeBeside(anchor, el.offsetWidth, el.offsetHeight, primaryButtons()));
  }, [anchor.x, anchor.y, findings.length]);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button.fc-menu__item:not([disabled])')?.focus();
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button.fc-menu__item:not([disabled]), .fc-menu__foot button') ?? [])];
    const i = buttons.indexOf(e.target as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      buttons[(i + 1) % buttons.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      buttons[(i - 1 + buttons.length) % buttons.length]?.focus();
    } else if (!e.altKey && !e.ctrlKey && !e.metaKey && e.key.length === 1) {
      const it = items.find((x) => x.key === e.key.toLowerCase() && !x.disabled);
      if (it) {
        e.preventDefault();
        it.run();
      }
    }
    e.stopPropagation();
  };

  return (
    <div
      ref={ref}
      className="fc-menu"
      role="menu"
      aria-label="FairCart"
      style={box ? { transform: `translate(${box.x}px, ${box.y}px)` } : { visibility: 'hidden' }}
      onKeyDown={onKey}
    >
      <div className="fc-menu__head">
        <span className="fc-menu__mark">
          <Mark size={14} />
        </span>
        <div>
          <div className="fc-menu__title">
            {retailer?.name ?? 'FairCart'} · {stageLabel(stage)}
          </div>
          <div className="fc-menu__status">{status}</div>
        </div>
      </div>
      <div className="fc-menu__list">
        {items.map((it) => (
          <button key={it.key} className="fc-menu__item" role="menuitem" disabled={!!it.disabled} onClick={it.run} title={it.disabled ?? it.hint}>
            <span className="fc-menu__icon">{it.icon}</span>
            <span className="fc-menu__label">
              {it.label}
              {it.disabled && <span className="fc-menu__why">{it.disabled}</span>}
            </span>
            <kbd>{it.key.toUpperCase()}</kbd>
          </button>
        ))}
      </div>
      <div className="fc-menu__foot">
        <button onClick={() => void pauseSite(!paused)}>
          <IconPause size={14} /> {paused ? 'Resume here' : `Pause on ${retailer?.name ?? 'this site'}`}
        </button>
        <button onClick={() => setState({ hiddenForPage: true, menuOpen: false })} title="Hide the companion until you reload. Alt+Shift+F brings the menu back.">
          <IconEyeOff size={14} /> Hide
        </button>
        <button onClick={() => void sendBg({ type: 'options/open' })} aria-label="Settings" title="Settings">
          <IconGear size={14} />
        </button>
      </div>
    </div>
  );
}
