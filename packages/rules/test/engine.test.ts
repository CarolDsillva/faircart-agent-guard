import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EvaluationContext, type EvaluationContextInput, Finding, RulePack } from '@faircart/schemas';
import { CATEGORIES, getCategory, getSource, getSubPattern } from '@faircart/taxonomy';
import { describe, expect, it } from 'vitest';
import { CORE, CORE_PACK, evaluate, fnv1a64, formatNumber } from '../src';
import type { JsonObject } from '../src/json';
import { normalizeContext } from '../src/normalize';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const CASES = join(ROOT, 'fixtures', 'cases');

interface FixtureFile {
  id: string;
  description: string;
  synthetic: true;
  context: EvaluationContextInput & JsonObject;
  expect: { fired: string[] };
}
const fixtures: FixtureFile[] = readdirSync(CASES)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(CASES, f), 'utf8')));

describe('fixtures', () => {
  it('cover a positive and a negative case for every CCPA category', () => {
    const firedCategories = new Set(
      fixtures.flatMap((f) => f.expect.fired.map((id) => CORE_PACK.rules.find((r) => r.id === id)!.category)),
    );
    for (const c of CATEGORIES) expect(firedCategories, c.id).toContain(c.id);
    const negatives = fixtures.filter((f) => f.expect.fired.length === 0);
    expect(negatives.length).toBeGreaterThanOrEqual(CATEGORIES.length);
  });

  it.each(fixtures.map((f) => [f.id, f] as const))('%s', (_id, fx) => {
    const result = evaluate(fx.context, CORE);
    expect(result.findings.map((f) => f.ruleId)).toEqual(fx.expect.fired);
    for (const f of result.findings) Finding.parse(f);
  });

  it.each(fixtures.map((f) => [f.id, f] as const))('schemas/defaults.json matches zod for %s', (_id, fx) => {
    const viaZod = JSON.parse(JSON.stringify(EvaluationContext.parse(fx.context)));
    expect(normalizeContext(fx.context)).toEqual(viaZod);
  });
});

describe('engine behaviour', () => {
  const journey = fixtures.find((f) => f.id === 'journey-quick-commerce-checkout')!;

  it('produces stable ids and readable text for the quick-commerce journey', () => {
    const a = evaluate(journey.context, CORE);
    const b = evaluate(journey.context, CORE);
    expect(a).toEqual(b);
    const drip = a.findings.find((f) => f.ruleId === 'DRIP-02')!;
    expect(drip.summary).toBe('"Handling charge" (₹15) first appeared at checkout and was not shown on the product page or in the cart.');
    expect(drip.status).toBe('needs_verification');
    expect(drip.title.startsWith('Possible')).toBe(true);
    const basket = a.findings.find((f) => f.ruleId === 'BASKET-01')!;
    expect(basket.summary).toContain('₹99');
  });

  it('explains why a rule stayed silent', () => {
    const fx = fixtures.find((f) => f.id === 'drip-negative-started-at-checkout')!;
    const r = evaluate(fx.context, CORE);
    expect(r.trace).toContainEqual({ ruleId: 'DRIP-02', itemId: 'f-hand', result: 'requires_false' });
    const disclosed = evaluate(fixtures.find((f) => f.id === 'drip-negative-disclosed-early')!.context, CORE);
    expect(disclosed.trace).toContainEqual({ ruleId: 'DRIP-02', itemId: 'f-hand', result: 'when_false' });
  });

  it('skips high-sensitivity rules at standard sensitivity', () => {
    const pack = RulePack.parse({ ...CORE_PACK, rules: [{ ...CORE_PACK.rules.find((r) => r.id === 'SHAME-01')!, minSensitivity: 'high' }] });
    const fx = fixtures.find((f) => f.id === 'shame-positive')!;
    const std = evaluate(fx.context, { pack, lexicons: CORE.lexicons });
    expect(std.findings).toHaveLength(0);
    expect(std.trace[0]!.result).toBe('skipped_sensitivity');
    const high = evaluate({ ...fx.context, sensitivity: 'high' }, { pack, lexicons: CORE.lexicons });
    expect(high.findings).toHaveLength(1);
  });

  it('never emits accusatory wording', () => {
    for (const r of CORE_PACK.rules) {
      const text = `${r.emit.title} ${r.emit.summary}`.toLowerCase();
      expect(text).not.toMatch(/\b(illegal|fraud|scam|violat|breach|cheat)/);
    }
  });
});

describe('rule pack integrity', () => {
  it('references only known categories, sub-patterns and sources', () => {
    for (const r of CORE_PACK.rules) {
      expect(getCategory(r.category), r.id).toBeDefined();
      if (r.subcategory) {
        const sp = getSubPattern(r.subcategory);
        expect(sp, `${r.id} subcategory`).toBeDefined();
        expect(sp!.mapsTo, `${r.id} subcategory maps to its category`).toContain(r.category);
      }
      for (const t of r.tags) expect(getSubPattern(t), `${r.id} tag ${t}`).toBeDefined();
      for (const s of r.emit.researchRefs) expect(getSource(s), `${r.id} ref ${s}`).toBeDefined();
    }
  });

  it('covers every official category', () => {
    expect(new Set(CORE_PACK.rules.map((r) => r.category)).size).toBe(13);
  });
});

describe('primitives', () => {
  it('FNV-1a 64 matches reference vectors', () => {
    expect(fnv1a64('')).toBe('cbf29ce484222325');
    expect(fnv1a64('a')).toBe('af63dc4c8601ec8c');
    expect(fnv1a64('foobar')).toBe('85944171f73967e8');
  });
  it('formats numbers per spec', () => {
    expect(formatNumber(15)).toBe('15');
    expect(formatNumber(9.98)).toBe('9.98');
    expect(formatNumber(9.5)).toBe('9.5');
    expect(formatNumber(30.0625)).toBe('30.06');
  });
});
