import type { Finding } from '@faircart/schemas';
import type { ProductIdentity } from '../adapters/types';
import type { Observation } from '../pricing/history';

/**
 * chrome.storage.local wrapper. Everything stays on this device; this build
 * makes no network requests. Keys:
 *   settings            Settings
 *   p:<productKey>      ProductRecord
 *   o:<productKey>      Observation[] (capped)
 *   w:<productKey>      Watch
 *   dismissed           Record<findingId, Dismissal>
 *   findingsLog         LoggedFinding[] (capped, for export)
 */

export interface Settings {
  onboarded: boolean;
  sensitivity: 'standard' | 'high';
  companion: 'follow' | 'pinned' | 'hidden';
  pinnedPos: { x: number; y: number } | null;
  pausedRetailers: string[];
  hoverHints: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  sensitivity: 'standard',
  companion: 'follow',
  pinnedPos: null,
  pausedRetailers: [],
  hoverHints: true,
};

export interface ProductRecord {
  identity: ProductIdentity;
  firstSeen: string;
  lastSeen: string;
}

export interface Watch {
  target: number;
  createdAt: string;
  lastNotifiedAt: string | null;
}

export interface Dismissal {
  at: string;
  reason: 'dismissed' | 'false_positive';
  finding: Finding;
}

export interface LoggedFinding {
  finding: Finding;
  url: string;
}

const MAX_OBS = 400;
const MAX_LOG = 300;
const area = () => chrome.storage.local;

export async function getSettings(): Promise<Settings> {
  const { settings } = await area().get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings as Partial<Settings> | undefined) };
}
export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await area().set({ settings: next });
  return next;
}

export async function getProduct(key: string): Promise<ProductRecord | undefined> {
  return (await area().get(`p:${key}`))[`p:${key}`] as ProductRecord | undefined;
}
export async function putProduct(key: string, rec: ProductRecord): Promise<void> {
  await area().set({ [`p:${key}`]: rec });
}
export async function allProducts(): Promise<Record<string, ProductRecord>> {
  const all = await area().get(null);
  const out: Record<string, ProductRecord> = {};
  for (const [k, v] of Object.entries(all)) if (k.startsWith('p:')) out[k.slice(2)] = v as ProductRecord;
  return out;
}

export async function getObservations(key: string): Promise<Observation[]> {
  return ((await area().get(`o:${key}`))[`o:${key}`] as Observation[] | undefined) ?? [];
}
export async function setObservations(key: string, obs: Observation[]): Promise<void> {
  await area().set({ [`o:${key}`]: obs.slice(-MAX_OBS) });
}

export async function getWatch(key: string): Promise<Watch | undefined> {
  return (await area().get(`w:${key}`))[`w:${key}`] as Watch | undefined;
}
export async function setWatch(key: string, w: Watch | null): Promise<void> {
  if (w) await area().set({ [`w:${key}`]: w });
  else await area().remove(`w:${key}`);
}
export async function allWatches(): Promise<Record<string, Watch>> {
  const all = await area().get(null);
  const out: Record<string, Watch> = {};
  for (const [k, v] of Object.entries(all)) if (k.startsWith('w:')) out[k.slice(2)] = v as Watch;
  return out;
}

export async function getDismissed(): Promise<Record<string, Dismissal>> {
  return ((await area().get('dismissed')).dismissed as Record<string, Dismissal> | undefined) ?? {};
}
export async function setDismissed(d: Record<string, Dismissal>): Promise<void> {
  await area().set({ dismissed: d });
}

export async function logFindings(entries: LoggedFinding[]): Promise<void> {
  if (!entries.length) return;
  const { findingsLog } = await area().get('findingsLog');
  const log = ((findingsLog as LoggedFinding[] | undefined) ?? []).filter((e) => !entries.some((n) => n.finding.id === e.finding.id));
  await area().set({ findingsLog: [...log, ...entries].slice(-MAX_LOG) });
}
export async function getFindingsLog(): Promise<LoggedFinding[]> {
  return ((await area().get('findingsLog')).findingsLog as LoggedFinding[] | undefined) ?? [];
}

/** Removes products, prices, watches, findings and journeys. Keeps settings unless asked. */
export async function clearData(keepSettings = true): Promise<void> {
  const settings = keepSettings ? await getSettings() : undefined;
  await area().clear();
  await chrome.storage.session.clear();
  if (settings) await area().set({ settings });
}
