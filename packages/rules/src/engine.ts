import {
  DISCLAIMER,
  EvaluationContext,
  type EvaluationContextInput,
  type EvaluationResult,
  type Finding,
  type Rule,
  type RulePack,
  type TraceEntry,
} from '@faircart/schemas';
import { derive } from './derive';
import { compileLexicons, evalExpr, type Lexicons } from './expr';
import { fnv1a64 } from './fnv';
import { asString, isObject, resolvePath, type Json, type JsonObject } from './json';
import { render } from './template';

export interface CompiledPack {
  pack: RulePack;
  lexicons: Lexicons;
}

export function compilePack(pack: RulePack): CompiledPack {
  return { pack, lexicons: compileLexicons(pack.lexicons) };
}

function emit(rule: Rule, packVersion: string, scope: JsonObject, snapshot: JsonObject): Finding {
  const e = rule.emit;
  const platform = snapshot.platform as Finding['platform'];
  const stage = snapshot.stage as Finding['stage'];
  const capturedAt = snapshot.capturedAt as string;
  const sku = isObject(snapshot.product) ? asString(snapshot.product.retailerSku) : null;
  const evidenceKey = render(e.evidenceKey, scope);
  const elRef = e.elementRef ? resolvePath(scope, e.elementRef) : null;

  return {
    id: `fc_${fnv1a64(`${rule.id}|${platform}|${sku ?? ''}|${stage}|${evidenceKey}`)}`,
    ruleId: rule.id,
    packVersion,
    category: rule.category,
    subcategory: rule.subcategory ?? null,
    tags: rule.tags,
    title: render(e.title, scope),
    summary: render(e.summary, scope),
    consumerImpact: render(e.consumerImpact, scope),
    recommendedAction: render(e.recommendedAction, scope),
    evidence: e.evidence.map((ev) => {
      const observed: Json = ev.observed ? resolvePath(scope, ev.observed) : null;
      return {
        type: ev.type,
        source: ev.source,
        description: render(ev.description, scope),
        observedValue: typeof observed === 'object' ? null : observed,
        stage,
        timestamp: capturedAt,
      };
    }),
    evidenceBasis: e.evidenceBasis,
    confidence: e.confidence,
    severity: e.severity,
    status: e.status,
    platform,
    surface: snapshot.surface as Finding['surface'],
    stage,
    retailerSku: sku,
    elementRef: typeof elRef === 'string' ? elRef : null,
    researchRefs: e.researchRefs,
    limitations: e.limitations,
    disclaimer: DISCLAIMER,
    detectedAt: capturedAt,
    engineSpec: 1,
  };
}

/**
 * Evaluate one screen against a rule pack. Pure and synchronous: no network,
 * no clock, no randomness, so output is reproducible across runs and engines.
 */
export function evaluate(input: EvaluationContextInput, compiled: CompiledPack): EvaluationResult {
  const ctx = EvaluationContext.parse(input);
  const { pack, lexicons } = compiled;
  const { snapshot, derived } = derive(
    ctx.snapshot as unknown as JsonObject,
    ctx.journey as unknown as JsonObject[],
    ctx.taps as unknown as JsonObject[],
  );

  const findings: Finding[] = [];
  const trace: TraceEntry[] = [];

  for (const rule of pack.rules) {
    if (rule.minSensitivity === 'high' && ctx.sensitivity === 'standard') {
      trace.push({ ruleId: rule.id, itemId: '*', result: 'skipped_sensitivity' });
      continue;
    }
    const items: JsonObject[] =
      rule.forEach === 'snapshot' ? [snapshot] : ((snapshot[rule.forEach] as JsonObject[] | undefined) ?? []);

    for (const item of items) {
      const itemId = rule.forEach === 'snapshot' ? 'snapshot' : String(item.id);
      const scope: JsonObject = { item, snapshot, derived };
      let result: TraceEntry['result'];
      if (!evalExpr(rule.when, scope, lexicons)) result = 'when_false';
      else if (rule.requires && !evalExpr(rule.requires, scope, lexicons)) result = 'requires_false';
      else if (rule.unless && evalExpr(rule.unless, scope, lexicons)) result = 'unless_true';
      else result = 'fired';

      trace.push({ ruleId: rule.id, itemId, result });
      if (result === 'fired') findings.push(emit(rule, pack.version, scope, snapshot));
    }
  }

  return { packId: pack.packId, packVersion: pack.version, findings, trace };
}
