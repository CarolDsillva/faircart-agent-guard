import { resolvePath, type Json } from './json';

/** Number formatting from SPEC.md §4. Kotlin mirrors this with BigDecimal HALF_UP. */
export function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export function formatValue(v: Json, fmt?: string): string {
  if (fmt === 'inr') return typeof v === 'number' ? `₹${formatNumber(v)}` : 'unknown';
  if (fmt === 'pct') return typeof v === 'number' ? `${Math.round(v)}%` : 'unknown';
  if (v === null) return 'unknown';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return formatNumber(v);
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

const PLACEHOLDER = /\{([A-Za-z0-9_.]+)(?:\|([a-z]+))?\}/g;

export function render(template: string, scope: Json): string {
  return template.replace(PLACEHOLDER, (_m, path: string, fmt?: string) => formatValue(resolvePath(scope, path), fmt));
}
