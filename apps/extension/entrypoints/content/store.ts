import type { Finding } from '@faircart/schemas';
import { useSyncExternalStore } from 'react';
import type { Extraction, HoverKind } from '../../src/adapters/types';
import type { TabState } from '../../src/messages';
import type { Settings } from '../../src/store/storage';

/** Minimal external store shared by the content script and its React UI. */

export type Card =
  | { kind: 'finding'; findingId: string }
  | { kind: 'summary' }
  | { kind: 'issues' }
  | { kind: 'price' }
  | { kind: 'offer' }
  | { kind: 'checkout' }
  | { kind: 'element'; ref: string | null; text: string; hover: HoverKind | null }
  | { kind: 'notice'; title: string; body: string };

export interface ContentState {
  extraction: Extraction | null;
  findings: Finding[];
  settings: Settings | null;
  tab: TabState | null;
  tabLoading: boolean;
  menuOpen: boolean;
  card: Card | null;
  /** Element the open card is about, used for placement. */
  cardAnchor: string | null;
  picking: boolean;
  hiddenForPage: boolean;
  scanning: boolean;
  lastScanAt: number;
}

let state: ContentState = {
  extraction: null,
  findings: [],
  settings: null,
  tab: null,
  tabLoading: false,
  menuOpen: false,
  card: null,
  cardAnchor: null,
  picking: false,
  hiddenForPage: false,
  scanning: false,
  lastScanAt: 0,
};
const listeners = new Set<() => void>();

export function getState(): ContentState {
  return state;
}
export function setState(patch: Partial<ContentState> | ((s: ContentState) => Partial<ContentState>)): void {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  for (const l of listeners) l();
}
export function useStore<T>(sel: (s: ContentState) => T): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => sel(state),
  );
}
