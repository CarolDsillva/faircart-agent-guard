import type { Expr, Operand } from '@faircart/schemas';
import { deepEqual, resolvePath, type Json } from './json';

export type Lexicons = Map<string, RegExp[]>;

export function compileLexicons(src: Record<string, string[]>): Lexicons {
  return new Map(Object.entries(src).map(([k, list]) => [k, list.map((p) => new RegExp(p, 'iu'))]));
}

function operand(op: Operand, scope: Json): Json {
  if (op !== null && typeof op === 'object' && !Array.isArray(op)) return resolvePath(scope, op.var);
  return op as Json;
}

function numbers(a: Json, b: Json): [number, number] | null {
  return typeof a === 'number' && typeof b === 'number' ? [a, b] : null;
}

export function evalExpr(e: Expr, scope: Json, lex: Lexicons): boolean {
  if ('all' in e) return e.all.every((x) => evalExpr(x, scope, lex));
  if ('any' in e) return e.any.some((x) => evalExpr(x, scope, lex));
  if ('not' in e) return !evalExpr(e.not, scope, lex);
  if ('eq' in e) return deepEqual(operand(e.eq[0], scope), operand(e.eq[1], scope));
  if ('neq' in e) return !deepEqual(operand(e.neq[0], scope), operand(e.neq[1], scope));
  if ('gt' in e) { const n = numbers(operand(e.gt[0], scope), operand(e.gt[1], scope)); return n !== null && n[0] > n[1]; }
  if ('gte' in e) { const n = numbers(operand(e.gte[0], scope), operand(e.gte[1], scope)); return n !== null && n[0] >= n[1]; }
  if ('lt' in e) { const n = numbers(operand(e.lt[0], scope), operand(e.lt[1], scope)); return n !== null && n[0] < n[1]; }
  if ('lte' in e) { const n = numbers(operand(e.lte[0], scope), operand(e.lte[1], scope)); return n !== null && n[0] <= n[1]; }
  if ('in' in e) {
    const needle = operand(e.in[0], scope);
    const hay = operand(e.in[1], scope);
    return Array.isArray(hay) && hay.some((v) => deepEqual(v, needle));
  }
  if ('exists' in e) return resolvePath(scope, e.exists) !== null;
  if ('matches' in e) {
    const v = operand(e.matches[0], scope);
    const patterns = lex.get(e.matches[1]);
    if (!patterns) throw new Error(`Unknown lexicon: ${e.matches[1]}`);
    return typeof v === 'string' && patterns.some((p) => p.test(v));
  }
  throw new Error(`Unknown expression: ${JSON.stringify(e)}`);
}
