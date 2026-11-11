import { useEffect, useState } from 'react';
import { isOurs, refs } from '../actions';
import { type Box, rectOf } from '../place';
import { getState, setState } from '../store';

/**
 * "Check an element": highlights what's under the pointer; the next click
 * selects it instead of reaching the page. Esc cancels. Only active while the
 * user chose this mode, so normal page clicks are never intercepted otherwise.
 */
export function PickLayer() {
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    let last: Element | null = null;
    const onMove = (e: PointerEvent) => {
      if (isOurs(e.target) || !(e.target instanceof Element) || e.target === last) return;
      last = e.target;
      setBox(rectOf(e.target));
    };
    const onClick = (e: MouseEvent) => {
      if (isOurs(e.target) || !(e.target instanceof Element)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      let el: Element | null = e.target;
      let ref: string | null = null;
      for (let i = 0; el && i < 8; i++, el = el.parentElement) {
        const r = refs.refOf(el);
        if (r && (refs.kinds.has(r) || getState().findings.some((f) => f.elementRef === r))) {
          ref = r;
          break;
        }
      }
      const target = ref ? refs.get(ref)! : e.target;
      const finding = ref ? getState().findings.find((f) => f.elementRef === ref) : undefined;
      const text = (target.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
      setState({
        picking: false,
        card: finding ? { kind: 'finding', findingId: finding.id } : { kind: 'element', ref: ref ?? refs.ref(target), text, hover: ref ? (refs.kinds.get(ref) ?? null) : null },
        cardAnchor: ref ?? refs.ref(target),
      });
    };
    window.addEventListener('pointermove', onMove, { capture: true, passive: true });
    window.addEventListener('click', onClick, { capture: true });
    return () => {
      window.removeEventListener('pointermove', onMove, { capture: true });
      window.removeEventListener('click', onClick, { capture: true });
    };
  }, []);

  return (
    <>
      {box && <div className="fc-pick" style={{ transform: `translate(${box.x - 3}px, ${box.y - 3}px)`, width: box.w + 6, height: box.h + 6 }} />}
      <div className="fc-pick-hint" role="status">
        Click any part of the page to check it · <kbd>Esc</kbd> to cancel
      </div>
    </>
  );
}
