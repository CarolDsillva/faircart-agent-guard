import { useEffect, useState } from 'react';
import { refs } from '../actions';
import { setState, useStore } from '../store';

interface Pos {
  id: string;
  x: number;
  y: number;
  high: boolean;
  title: string;
  ref: string;
}

/**
 * Small markers beside elements a finding points at. Positions update on
 * scroll/resize (passive, rAF-batched) and once a second for late layout,
 * never on every mouse move.
 */
export function Markers() {
  const findings = useStore((s) => s.findings);
  const [positions, setPositions] = useState<Pos[]>([]);

  useEffect(() => {
    const anchored = findings.filter((f) => f.elementRef);
    if (!anchored.length) {
      setPositions([]);
      return;
    }
    let frame = 0;
    const measure = () => {
      frame = 0;
      const out: Pos[] = [];
      const taken = new Set<string>();
      for (const f of anchored) {
        const el = refs.get(f.elementRef!);
        if (!el || !el.isConnected) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.bottom < 0 || r.top > window.innerHeight) continue;
        let x = Math.min(window.innerWidth - 24, r.right - 8);
        let y = Math.max(4, r.top - 8);
        // Stack markers that land on the same spot.
        while (taken.has(`${Math.round(x / 12)}:${Math.round(y / 12)}`)) x -= 22;
        taken.add(`${Math.round(x / 12)}:${Math.round(y / 12)}`);
        out.push({ id: f.id, x, y, high: f.severity === 'P0' || f.severity === 'P1', title: f.title, ref: f.elementRef! });
      }
      setPositions(out);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.addEventListener('resize', schedule, { passive: true });
    const iv = window.setInterval(schedule, 1000);
    return () => {
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
      window.clearInterval(iv);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [findings]);

  return (
    <>
      {positions.map((p) => (
        <button
          key={p.id}
          className={`fc-marker ${p.high ? 'fc-marker--high' : ''}`}
          style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
          aria-label={`FairCart: ${p.title}. Show details`}
          title={p.title}
          onClick={() => setState({ card: { kind: 'finding', findingId: p.id }, cardAnchor: p.ref, menuOpen: false })}
        >
          {p.high ? '!' : 'i'}
        </button>
      ))}
    </>
  );
}
