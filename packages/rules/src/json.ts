/** JSON helpers shared by derivation, expressions and templates. Semantics in SPEC.md §3. */

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export type JsonObject = { [k: string]: Json };

export function isObject(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Walk `a.b.0.c`; anything missing resolves to null. */
export function resolvePath(root: Json, path: string): Json {
  let cur: Json = root;
  for (const seg of path.split('.')) {
    if (Array.isArray(cur)) {
      const i = /^\d+$/.test(seg) ? Number(seg) : NaN;
      cur = Number.isInteger(i) && i < cur.length ? (cur[i] ?? null) : null;
    } else if (isObject(cur)) {
      cur = seg in cur ? (cur[seg] ?? null) : null;
    } else {
      return null;
    }
  }
  return cur === undefined ? null : cur;
}

export function deepEqual(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i] ?? null));
  }
  if (isObject(a) && isObject(b)) {
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    return ka.length === kb.length && ka.every((k) => k in b && deepEqual(a[k] ?? null, b[k] ?? null));
  }
  return false;
}

export function asArray(v: Json | undefined): Json[] {
  return Array.isArray(v) ? v : [];
}

export function asNumber(v: Json | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function asString(v: Json | undefined): string | null {
  return typeof v === 'string' ? v : null;
}
