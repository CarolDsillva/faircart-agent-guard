import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { HoverKind } from '../../../src/adapters/types';
import { isOurs, refreshTab, refs } from '../actions';
import { type Box, placeBeside, primaryButtons, rectOf } from '../place';
import { getState, setState, type Card } from '../store';

const DWELL_MS = 650;

const ACTIONS: Record<HoverKind, { label: string; card: (ref: string, text: string) => Card }> = {
  price: { label: 'Check this price', card: () => ({ kind: 'price' }) },
  mrp: { label: 'Why is this marked as a deal?', card: () => ({ kind: 'offer' }) },
  fee: { label: 'Check this fee', card: () => ({ kind: 'checkout' }) },
  total: { label: 'Check this total', card: () => ({ kind: 'checkout' }) },
  countdown: { label: 'Is this countdown genuine?', card: (ref, text) => ({ kind: 'element', ref, text, hover: 'countdown' }) },
  stock: { label: 'Is this stock claim reliable?', card: (ref, text) => ({ kind: 'element', ref, text, hover: 'stock' }) },
  sponsored: { label: 'Is this an ad?', card: (ref, text) => ({ kind: 'element', ref, text, hover: 'sponsored' }) },
  addon: { label: 'Why is this selected?', card: (ref, text) => ({ kind: 'element', ref, text, hover: 'addon' }) },
  membership: { label: 'Check this membership', card: (ref, text) => ({ kind: 'element', ref, text, hover: 'membership' }) },
  card: { label: 'Compare this product', card: (ref, text) => ({ kind: 'element', ref, text, hover: 'card' }) },
};

/** Find the nearest classified element (or a finding's element) under the pointer. */
function classify(target: Element): { ref: string; kind: HoverKind | null; findingId: string | null; el: Element } | null {
  const findings = getState().findings;
  let el: Element | null = target;
  for (let i = 0; el && i < 8; i++, el = el.parentElement) {
    const ref = refs.refOf(el);
    if (!ref) continue;
    const f = findings.find((x) => x.elementRef === ref);
    const kind = refs.kinds.get(ref) ?? null;
    if (f || kind) return { ref, kind, findingId: f?.id ?? null, el };
  }
  return null;
}

/**
 * After the pointer rests on a meaningful element, offer one context action in
 * a chip placed beside (never over) the element. Ordinary elements get nothing.
 */
export function HoverChip() {
  const [hit, setHit] = useState<{ ref: string; kind: HoverKind | null; findingId: string | null; el: Element } | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const chip = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const current = useRef<string | null>(null);

  useEffect(() => {
    const onOver = (e: PointerEvent) => {
      if (isOurs(e.target) || !(e.target instanceof Element)) return;
      const h = classify(e.target);
      if (h?.ref === current.current) return;
      window.clearTimeout(timer.current);
      current.current = h?.ref ?? null;
      if (!h) {
        timer.current = window.setTimeout(() => setHit(null), 300);
        return;
      }
      timer.current = window.setTimeout(() => setHit(h), DWELL_MS);
    };
    document.addEventListener('pointerover', onOver, { passive: true, capture: true });
    const hide = () => setHit(null);
    window.addEventListener('scroll', hide, { passive: true, capture: true });
    return () => {
      document.removeEventListener('pointerover', onOver, { capture: true });
      window.removeEventListener('scroll', hide, { capture: true });
      window.clearTimeout(timer.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (!hit || !chip.current) return setBox(null);
    setBox(placeBeside(rectOf(hit.el), chip.current.offsetWidth, chip.current.offsetHeight, primaryButtons(), 6));
  }, [hit]);

  if (!hit) return null;
  const finding = hit.findingId ? getState().findings.find((f) => f.id === hit.findingId) : null;
  const action = hit.kind ? ACTIONS[hit.kind] : null;
  const label = finding ? finding.title : action?.label;
  if (!label) return null;

  const open = () => {
    const text = (hit.el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
    if (finding) setState({ card: { kind: 'finding', findingId: finding.id }, cardAnchor: hit.ref });
    else if (action) {
      void refreshTab();
      setState({ card: action.card(hit.ref, text), cardAnchor: hit.ref });
    }
    setHit(null);
  };

  return (
    <button
      ref={chip}
      className={`fc-chip${finding ? ' fc-chip--issue' : ''}`}
      style={box ? { transform: `translate(${box.x}px, ${box.y}px)` } : { visibility: 'hidden' }}
      onClick={open}
      onMouseLeave={() => {
        current.current = null;
        setHit(null);
      }}
    >
      <span className="fc-chip__dot" aria-hidden="true" />
      {label}
    </button>
  );
}
