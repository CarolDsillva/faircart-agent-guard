import type { Finding } from '@faircart/schemas';
import { extractPage, RefRegistry } from '../../src/adapters';
import type { ContentToBackground, PageToBackground, PanelTab, TabState } from '../../src/messages';
import { retailerForUrl } from '../../src/retailers';
import type { Settings } from '../../src/store/storage';
import { getState, setState } from './store';

/** Content-script actions shared by the boot code and the UI. */

export const refs = new RefRegistry();
let pageId = crypto.randomUUID();
let host: HTMLElement | null = null;

export function setHost(el: HTMLElement) {
  host = el;
}
export function newPage() {
  pageId = crypto.randomUUID();
}

export function sendBg<T = unknown>(msg: ContentToBackground | PageToBackground): Promise<T> {
  return chrome.runtime.sendMessage(msg) as Promise<T>;
}

export function isOurs(node: EventTarget | null): boolean {
  if (!host || !(node instanceof Node)) return false;
  return node === host || host.contains(node) || node.getRootNode() === host.shadowRoot;
}

export async function scanNow(): Promise<void> {
  const url = new URL(location.href);
  const r = retailerForUrl(url.href);
  const s = getState().settings;
  if (!r || (s && s.pausedRetailers.includes(r.id))) return;
  setState({ scanning: true });
  const extraction = extractPage(document, url, refs);
  if (!extraction) return setState({ scanning: false });
  const res = await sendBg<{ ok: boolean; findings?: Finding[]; settings?: Settings }>({ type: 'page/snapshot', pageId, url: url.href, extraction }).catch(() => null);
  setState({ extraction, findings: res?.findings ?? [], scanning: false, lastScanAt: Date.now(), ...(res?.settings ? { settings: res.settings } : {}) });
  if (getState().tab) void refreshTab();
}

export async function refreshTab(): Promise<void> {
  setState({ tabLoading: true });
  const res = await sendBg<{ ok: boolean; state?: TabState }>({ type: 'state/mine' }).catch(() => null);
  setState({ tab: res?.state ?? null, tabLoading: false });
}

/** Opens the side panel on a tab. Falls back to an inline notice if Chrome refuses (no user gesture). */
export async function openPanel(tab: PanelTab): Promise<boolean> {
  const res = await sendBg<{ ok: boolean }>({ type: 'panel/open', tab }).catch(() => ({ ok: false }));
  if (!res.ok) {
    setState({ card: { kind: 'notice', title: 'Open the FairCart panel', body: 'Click the FairCart icon in your browser toolbar to open the full panel for this tab.' } });
  }
  return res.ok;
}

export function dismissFinding(id: string, reason: 'dismissed' | 'false_positive') {
  setState((s) => ({ findings: s.findings.filter((f) => f.id !== id), card: s.card?.kind === 'finding' && s.card.findingId === id ? null : s.card }));
  void sendBg({ type: 'finding/dismiss', id, reason });
}

export async function pauseSite(paused: boolean) {
  const r = retailerForUrl(location.href);
  if (!r) return;
  await sendBg({ type: 'site/pause', retailer: r.id, paused });
  setState((s) => ({
    settings: s.settings ? { ...s.settings, pausedRetailers: paused ? [...s.settings.pausedRetailers, r.id] : s.settings.pausedRetailers.filter((x) => x !== r.id) } : s.settings,
    findings: paused ? [] : s.findings,
    menuOpen: false,
    card: null,
  }));
  if (!paused) void scanNow();
}
