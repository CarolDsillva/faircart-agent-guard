import { useEffect, useRef, useState } from 'react';
import { retailerForUrl } from '../../../src/retailers';
import { setSettings } from '../../../src/store/storage';
import { isOurs, refreshTab, refs, scanNow } from '../actions';
import { rectOf } from '../place';
import { getState, setState, useStore } from '../store';
import { CardHost } from './Cards';
import { HoverChip } from './HoverChip';
import { Mark } from './icons';
import { Markers } from './Markers';
import { Menu } from './Menu';
import { PickLayer } from './PickLayer';

export interface Point {
  x: number;
  y: number;
}

const ORB = 30;
const REST_MS = 220;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function clampPoint(p: Point): Point {
  return { x: Math.min(Math.max(8, p.x), window.innerWidth - ORB - 8), y: Math.min(Math.max(8, p.y), window.innerHeight - ORB - 8) };
}

/** Status line for the orb's tooltip and aria-label. */
function statusText(n: number, stage: string | undefined, readable: string | undefined, paused: boolean, sensitive: boolean): string {
  if (paused) return 'FairCart is paused on this site';
  if (sensitive) return 'FairCart is not reading this page (payment or password fields)';
  if (n > 0) return `${n} thing${n === 1 ? '' : 's'} worth checking`;
  if (readable === 'none') return 'FairCart could not read this page';
  if (stage === 'product') return 'Product found · price check available';
  if (stage === 'cart' || stage === 'checkout') return 'Checkout scan available';
  return 'Nothing to flag on this page';
}

export function App() {
  const settings = useStore((s) => s.settings);
  const findings = useStore((s) => s.findings);
  const extraction = useStore((s) => s.extraction);
  const menuOpen = useStore((s) => s.menuOpen);
  const card = useStore((s) => s.card);
  const hidden = useStore((s) => s.hiddenForPage);
  const picking = useStore((s) => s.picking);

  const mode = settings?.companion ?? 'follow';
  const retailer = retailerForUrl(location.href);
  const paused = !!(retailer && settings?.pausedRetailers.includes(retailer.id));
  const initial = settings?.pinnedPos ? clampPoint(settings.pinnedPos) : { x: window.innerWidth - ORB - 24, y: window.innerHeight - ORB - 24 };
  const [pos, setPos] = useState<Point>(initial);
  const [dragging, setDragging] = useState(false);
  const orbRef = useRef<HTMLButtonElement>(null);
  const restTimer = useRef<number | undefined>(undefined);
  const drag = useRef<{ start: Point; origin: Point; moved: boolean } | null>(null);

  // Follow the pointer lazily: move only after the pointer rests, never while UI is open.
  useEffect(() => {
    if (mode !== 'follow') return;
    const onMove = (e: PointerEvent) => {
      window.clearTimeout(restTimer.current);
      const s = getState();
      if (s.menuOpen || s.card || s.picking || drag.current || isOurs(e.target)) return;
      restTimer.current = window.setTimeout(() => setPos(clampPoint({ x: e.clientX + 18, y: e.clientY + 22 })), REST_MS);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.clearTimeout(restTimer.current);
    };
  }, [mode]);

  useEffect(() => {
    if (mode === 'pinned' && settings?.pinnedPos) setPos(clampPoint(settings.pinnedPos));
  }, [mode, settings?.pinnedPos]);

  // Global keys: Escape closes things; Alt+Shift+F handled by the browser command.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const s = getState();
        if (s.picking) setState({ picking: false });
        else if (s.card) setState({ card: null, cardAnchor: null });
        else if (s.menuOpen) setState({ menuOpen: false });
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // Close the menu on outside click (without blocking the page's own handling).
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!isOurs(e.target)) setState({ menuOpen: false });
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [menuOpen]);

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { start: { x: e.clientX, y: e.clientY }, origin: pos, moved: false };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.start.x;
    const dy = e.clientY - d.start.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    setDragging(true);
    setPos(clampPoint({ x: d.origin.x + dx, y: d.origin.y + dy }));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (d?.moved) {
      // Dragging pins the companion where the user put it.
      void setSettings({ companion: 'pinned', pinnedPos: pos }).then((s) => setState({ settings: s }));
    } else {
      setState((s) => ({ menuOpen: !s.menuOpen, card: null }));
      void refreshTab();
    }
  };

  const n = findings.length;
  const status = statusText(n, extraction?.stage, extraction?.readability, paused, !!extraction?.sensitive);
  const showOrb = mode !== 'hidden' && !hidden;
  const orbBox = { x: pos.x, y: pos.y, w: ORB, h: ORB };
  const tone = paused ? 'paused' : n > 0 ? 'issue' : extraction?.readability === 'none' || extraction?.sensitive ? 'muted' : extraction?.identity ? 'found' : 'idle';

  return (
    <div className="fc-root">
      {!paused && <Markers />}
      {!paused && settings?.hoverHints !== false && !menuOpen && !picking && <HoverChip />}
      {showOrb && (
        <button
          ref={orbRef}
          className={`fc-orb fc-orb--${tone}${dragging ? ' is-dragging' : ''}${reducedMotion() ? ' no-motion' : ''}`}
          style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
          aria-label={`FairCart: ${status}. Open menu`}
          aria-expanded={menuOpen}
          title={status}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setState((s) => ({ menuOpen: !s.menuOpen }));
              void refreshTab();
            }
          }}
        >
          <Mark size={16} />
          {n > 0 && <span className="fc-orb__count">{n}</span>}
        </button>
      )}
      {menuOpen && <Menu anchor={showOrb ? orbBox : { x: window.innerWidth - 40, y: 40, w: 1, h: 1 }} status={status} paused={paused} />}
      {card && <CardHost fallbackAnchor={orbBox} />}
      {picking && <PickLayer />}
    </div>
  );
}

/** Scroll an element into view and open its finding card. */
export function revealFinding(findingId: string, elementRef: string | null) {
  const el = elementRef ? refs.get(elementRef) : undefined;
  if (el) el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
  setState({ card: { kind: 'finding', findingId }, cardAnchor: elementRef, menuOpen: false });
}

export function rescanAndSummarise() {
  setState({ menuOpen: false });
  void scanNow().then(() => setState({ card: { kind: 'summary' }, cardAnchor: null }));
}

export { rectOf };
