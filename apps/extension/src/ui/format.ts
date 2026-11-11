import type { Finding } from '@faircart/schemas';
import { getCategory, getSource } from '@faircart/taxonomy';
import pack from '../../../../rulepacks/core.v1.json' with { type: 'json' };

/** Display helpers shared by the companion and the side panel. */

const rationale = new Map<string, string>(pack.rules.map((r) => [r.id, r.rationale]));

export function inr(n: number | null | undefined): string {
  if (n === null || n === undefined) return 'Unknown';
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export function severityLabel(s: Finding['severity']): string {
  return { P0: 'High', P1: 'Medium-high', P2: 'Medium', P3: 'Watch' }[s];
}

export function confidenceLabel(c: number): string {
  if (c >= 0.75) return 'Strong evidence';
  if (c >= 0.55) return 'Moderate evidence';
  return 'Weak evidence — worth checking yourself';
}

export function statusLabel(s: Finding['status']): string {
  return {
    detected: 'Seen on this page',
    needs_verification: 'Needs your check',
    confirmed_repeatable: 'Seen again on repeat',
    not_reproducible: 'Not seen again',
    dismissed_by_user: 'Dismissed',
  }[s];
}

export function whyItMatters(f: Finding): string {
  return rationale.get(f.ruleId) ?? getCategory(f.category)?.plainEnglish ?? '';
}

export function categoryName(f: Finding): string {
  return getCategory(f.category)?.name ?? f.category;
}

export function sourcesFor(f: Finding): { id: string; label: string; level: string }[] {
  return f.researchRefs
    .map((id) => getSource(id))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map((s) => ({ id: s.id, label: `${s.publisher} — ${s.title}`, level: s.evidenceLevel.replace(/_/g, ' ') }));
}

export function stageLabel(stage: string | undefined): string {
  return (
    { listing: 'Search results', product: 'Product page', cart: 'Cart', checkout: 'Checkout', membership: 'Membership offer', account: 'Account', unknown: 'Page' } as Record<string, string>
  )[stage ?? 'unknown'] ?? 'Page';
}

export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export function pct(part: number, whole: number): number {
  return Math.round((part / whole) * 100);
}
