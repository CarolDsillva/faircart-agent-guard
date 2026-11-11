import { type Finding, ScreenSnapshot } from '@faircart/schemas';
import { CORE, evaluate } from '@faircart/rules';
import { toSnapshot, type Extraction } from '../src/adapters/types';
import type { BackgroundToContent, ContentToBackground, PageToBackground } from '../src/messages';
import { productKey } from '../src/messages';
import { shouldRecord, type Observation } from '../src/pricing/history';
import { DEMO_RETAILER, RETAILERS } from '../src/retailers';
import { buildTabState, type TabRuntime } from '../src/state';
import { addSnapshot, addTap, type Journey } from '../src/store/journey';
import {
  allProducts,
  clearData,
  getDismissed,
  getFindingsLog,
  getObservations,
  getProduct,
  getSettings,
  getWatch,
  logFindings,
  putProduct,
  setDismissed,
  setObservations,
  setSettings,
  setWatch,
} from '../src/store/storage';

const CONTENT_JS = 'content-scripts/content.js';
const runtimes = new Map<number, TabRuntime>();
const panelPorts = new Set<chrome.runtime.Port>();

export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

  chrome.runtime.onInstalled.addListener(async ({ reason }) => {
    await syncContentScripts();
    const s = await getSettings();
    if (reason === 'install' || !s.onboarded) chrome.tabs.create({ url: chrome.runtime.getURL('/onboarding.html') });
    chrome.alarms.create('purge', { periodInMinutes: 24 * 60 });
  });
  chrome.runtime.onStartup.addListener(() => void syncContentScripts());
  chrome.permissions.onAdded.addListener(() => void syncContentScripts().then(() => broadcast()));
  chrome.permissions.onRemoved.addListener(() => void syncContentScripts().then(() => broadcast()));

  chrome.tabs.onRemoved.addListener((tabId) => {
    runtimes.delete(tabId);
    void chrome.storage.session.remove(`j:${tabId}`);
  });

  chrome.commands.onCommand.addListener(async (cmd) => {
    if (cmd !== 'toggle-companion-menu') return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id !== undefined) send(tab.id, { type: 'menu/toggle' });
  });

  chrome.alarms.onAlarm.addListener((a) => {
    if (a.name === 'purge') void purgeOld();
  });

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'sidepanel') return;
    panelPorts.add(port);
    port.onDisconnect.addListener(() => panelPorts.delete(port));
  });

  chrome.runtime.onMessage.addListener((msg: ContentToBackground | PageToBackground, sender, reply) => {
    handle(msg, sender)
      .then(reply)
      .catch((err) => reply({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    return true;
  });
});

function send(tabId: number, msg: BackgroundToContent) {
  chrome.tabs.sendMessage(tabId, msg).catch(() => {});
}

function broadcast(tabId?: number) {
  for (const p of panelPorts) p.postMessage({ type: 'state/changed', tabId: tabId ?? null });
}

async function enabledRetailers(): Promise<Set<string>> {
  // The demo shop is part of the extension itself and needs no site permission.
  const out = new Set<string>([DEMO_RETAILER.id]);
  for (const r of RETAILERS) {
    if (!r.origins.length) continue;
    if (await chrome.permissions.contains({ origins: r.origins })) out.add(r.id);
  }
  return out;
}

/** Register content scripts only for retailers the user granted, and inject into their open tabs. */
async function syncContentScripts() {
  const enabled = await enabledRetailers();
  const registered = new Set((await chrome.scripting.getRegisteredContentScripts()).map((s) => s.id));
  for (const r of RETAILERS) {
    const id = `fc-${r.id}`;
    if (enabled.has(r.id) && !registered.has(id)) {
      await chrome.scripting.registerContentScripts([{ id, matches: r.matches, js: [CONTENT_JS], runAt: 'document_idle', persistAcrossSessions: true }]);
      const tabs = await chrome.tabs.query({ url: r.matches });
      for (const t of tabs) {
        if (t.id !== undefined) await chrome.scripting.executeScript({ target: { tabId: t.id }, files: [CONTENT_JS] }).catch(() => {});
      }
    } else if (!enabled.has(r.id) && registered.has(id)) {
      await chrome.scripting.unregisterContentScripts({ ids: [id] });
    }
  }
}

async function loadJourney(tabId: number): Promise<Journey | undefined> {
  return (await chrome.storage.session.get(`j:${tabId}`))[`j:${tabId}`] as Journey | undefined;
}

async function onSnapshot(tabId: number, pageId: string, url: string, x: Extraction): Promise<Finding[]> {
  const settings = await getSettings();
  const capturedAt = new Date().toISOString();
  const draft = toSnapshot(x, { snapshotId: crypto.randomUUID(), journeyId: 'pending', capturedAt });
  const snap = ScreenSnapshot.parse(draft);
  const prev = await loadJourney(tabId);
  const { journey, earlier, current } = x.sensitive ? { journey: prev, earlier: prev?.snapshots ?? [], current: snap } : addSnapshot(prev, snap, pageId, () => crypto.randomUUID());
  if (journey && !x.sensitive) await chrome.storage.session.set({ [`j:${tabId}`]: journey });

  let findings: Finding[] = [];
  let trace: TabRuntime['trace'] = [];
  if (!x.sensitive && journey) {
    const result = evaluate({ snapshot: current, journey: earlier, taps: journey.taps, sensitivity: settings.sensitivity }, CORE);
    findings = result.findings;
    trace = result.trace;
  }
  runtimes.set(tabId, { url, pageId, extraction: x, findings, trace, scannedAt: capturedAt });
  if (findings.length) await logFindings(findings.map((f) => ({ finding: { ...f, elementRef: null }, url: new URL(url).origin + new URL(url).pathname })));

  // The demo shop is fictional: never let its prices into history or comparisons.
  if (x.identity && x.identity.price !== null && !x.sensitive && x.retailer !== DEMO_RETAILER.id) await recordObservation(x, capturedAt);
  broadcast(tabId);
  const dismissed = await getDismissed();
  return findings.filter((f) => !dismissed[f.id]);
}

async function recordObservation(x: Extraction, at: string) {
  const id = x.identity!;
  const key = productKey(id.retailer, id.retailerSku);
  const existing = await getProduct(key);
  await putProduct(key, { identity: id, firstSeen: existing?.firstSeen ?? at, lastSeen: at });
  const obs = await getObservations(key);
  const next: Observation = { at, price: id.price!, mrp: id.mrp, seller: id.seller, variantLabel: id.variantLabel, source: 'device' };
  if (!shouldRecord(obs.at(-1), next)) return;
  await setObservations(key, [...obs, next]);

  const watch = await getWatch(key);
  if (watch && next.price <= watch.target) {
    const recently = watch.lastNotifiedAt && Date.now() - Date.parse(watch.lastNotifiedAt) < 12 * 3600_000;
    if (!recently && (await chrome.permissions.contains({ permissions: ['notifications'] }))) {
      chrome.notifications.create(`watch:${key}:${Date.now()}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('/icon/128.png'),
        title: 'Price reached your target',
        message: `${id.title.slice(0, 80)} is ₹${next.price.toLocaleString('en-IN')} (your target ₹${watch.target.toLocaleString('en-IN')}).`,
      });
      await setWatch(key, { ...watch, lastNotifiedAt: new Date().toISOString() });
    }
  }
}

async function purgeOld() {
  const cutoff = Date.now() - 400 * 24 * 3600_000;
  for (const key of Object.keys(await allProducts())) {
    const obs = await getObservations(key);
    const kept = obs.filter((o) => Date.parse(o.at) >= cutoff);
    if (kept.length !== obs.length) await setObservations(key, kept);
  }
}

async function handle(msg: ContentToBackground | PageToBackground, sender: chrome.runtime.MessageSender): Promise<unknown> {
  const tabId = sender.tab?.id;
  switch (msg.type) {
    case 'page/snapshot': {
      if (tabId === undefined) return { ok: false };
      const findings = await onSnapshot(tabId, msg.pageId, msg.url, msg.extraction);
      const settings = await getSettings();
      return { ok: true, findings, settings };
    }
    case 'tap': {
      if (tabId === undefined) return { ok: false };
      const j = await loadJourney(tabId);
      if (j) await chrome.storage.session.set({ [`j:${tabId}`]: addTap(j, { controlId: msg.controlId, action: msg.action, at: new Date().toISOString() }) });
      return { ok: true };
    }
    case 'finding/dismiss': {
      const d = await getDismissed();
      const f = [...runtimes.values()].flatMap((r) => r.findings).find((x) => x.id === msg.id);
      if (f) d[msg.id] = { at: new Date().toISOString(), reason: msg.reason, finding: { ...f, elementRef: null, status: 'dismissed_by_user' } };
      await setDismissed(d);
      for (const [t, r] of runtimes) if (r.findings.some((x) => x.id === msg.id)) send(t, { type: 'findings/update', findings: r.findings.filter((x) => !d[x.id]) });
      broadcast();
      return { ok: true };
    }
    case 'finding/restore': {
      const d = await getDismissed();
      delete d[msg.id];
      await setDismissed(d);
      for (const [t, r] of runtimes) if (r.findings.some((x) => x.id === msg.id)) send(t, { type: 'findings/update', findings: r.findings.filter((x) => !d[x.id]) });
      broadcast();
      return { ok: true };
    }
    case 'panel/open': {
      if (tabId === undefined) return { ok: false };
      await chrome.storage.session.set({ panelTab: msg.tab });
      try {
        await chrome.sidePanel.open({ tabId });
        broadcast(tabId);
        return { ok: true };
      } catch {
        return { ok: false, reason: 'gesture' };
      }
    }
    case 'site/pause': {
      const s = await getSettings();
      const set = new Set(s.pausedRetailers);
      if (msg.paused) set.add(msg.retailer);
      else set.delete(msg.retailer);
      await setSettings({ pausedRetailers: [...set] });
      for (const t of runtimes.keys()) send(t, { type: 'settings/changed' });
      broadcast();
      return { ok: true };
    }
    case 'state/get':
    case 'state/mine': {
      const id = msg.type === 'state/get' ? msg.tabId : tabId;
      if (id === undefined) return { ok: false };
      const tab = await chrome.tabs.get(id).catch(() => undefined);
      const url = tab?.url ?? runtimes.get(id)?.url ?? sender.tab?.url ?? null;
      const settings = await getSettings();
      const state = await buildTabState(id, url, runtimes.get(id), await loadJourney(id), await enabledRetailers(), new Set(settings.pausedRetailers));
      if (msg.type === 'state/mine') return { ok: true, state };
      const { panelTab } = await chrome.storage.session.get('panelTab');
      if (panelTab) await chrome.storage.session.remove('panelTab');
      return { ok: true, state, panelTab: panelTab ?? null };
    }
    case 'watch/set': {
      if (msg.target === null) await setWatch(msg.productKey, null);
      else await setWatch(msg.productKey, { target: msg.target, createdAt: new Date().toISOString(), lastNotifiedAt: null });
      broadcast();
      return { ok: true };
    }
    case 'saved/remove': {
      await setWatch(msg.productKey, null);
      broadcast();
      return { ok: true };
    }
    case 'sites/refresh': {
      await syncContentScripts();
      broadcast();
      return { ok: true, enabled: [...(await enabledRetailers())] };
    }
    case 'data/clear': {
      await clearData(true);
      runtimes.clear();
      broadcast();
      return { ok: true };
    }
    case 'export': {
      const products = await allProducts();
      const observations: Record<string, Observation[]> = {};
      for (const k of Object.keys(products)) observations[k] = await getObservations(k);
      return { ok: true, data: { exportedAt: new Date().toISOString(), findings: await getFindingsLog(), dismissed: await getDismissed(), products, observations } };
    }
    case 'options/open': {
      await chrome.runtime.openOptionsPage();
      return { ok: true };
    }
    case 'tab/rescan': {
      send(msg.tabId, { type: 'settings/changed' });
      return { ok: true };
    }
  }
}

