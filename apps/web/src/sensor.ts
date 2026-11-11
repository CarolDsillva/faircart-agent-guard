import { extractPage, RefRegistry, toSnapshot, type Bill } from '@faircart/adapters';
import type { ScreenSnapshotInput } from '@faircart/schemas';

/** One reading of the store page: what FairCart sees, plus the element handles to act on it. */
export interface Observation {
  seq: number;
  pageId: string;
  url: string;
  snapshot: ScreenSnapshotInput & { controls: NonNullable<ScreenSnapshotInput['controls']>; cues: NonNullable<ScreenSnapshotInput['cues']> };
  bill: Bill | null;
  refs: RefRegistry;
}

/** Run FairCart's adapter on a document. Element refs stay here; only ids and facts leave the browser. */
export function observeDocument(doc: Document, url: string, pageId: string, seq: number): Observation {
  const refs = new RefRegistry();
  const x = extractPage(doc, new URL(url), refs);
  if (!x) throw new Error(`PennyWise doesn't recognise ${url} as a store page`);
  const snapshot = toSnapshot(x, { snapshotId: `s-${seq}`, journeyId: 'pending', capturedAt: new Date().toISOString() });
  return { seq, pageId, url, snapshot: { ...snapshot, controls: snapshot.controls ?? [], cues: snapshot.cues ?? [] }, bill: x.bill, refs };
}

/** Resolve once the document has had no DOM changes for `quietMs` (capped at `maxMs`). */
export function whenQuiet(doc: Document, quietMs = 300, maxMs = 2500): Promise<void> {
  return new Promise((resolve) => {
    let timer = window.setTimeout(done, quietMs);
    const cap = window.setTimeout(done, maxMs);
    const mo = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(done, quietMs);
    });
    mo.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    function done() {
      mo.disconnect();
      window.clearTimeout(timer);
      window.clearTimeout(cap);
      resolve();
    }
  });
}
