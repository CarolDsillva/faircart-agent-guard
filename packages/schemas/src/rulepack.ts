import { z } from 'zod';
import { EvidenceBasis, FindingStatus, Sensitivity, Severity } from './common';
import { Evidence } from './finding';

/**
 * Rule packs are data, not code: they can ship from the backend without breaking
 * MV3's remote-code ban, and the same JSON runs in the TypeScript and Kotlin
 * evaluators. See packages/rules/SPEC.md for exact semantics.
 */

type Literal = string | number | boolean | null;
export type Operand = Literal | Literal[] | { var: string };
export type Expr =
  | { all: Expr[] }
  | { any: Expr[] }
  | { not: Expr }
  | { eq: [Operand, Operand] }
  | { neq: [Operand, Operand] }
  | { gt: [Operand, Operand] }
  | { gte: [Operand, Operand] }
  | { lt: [Operand, Operand] }
  | { lte: [Operand, Operand] }
  | { in: [Operand, Operand] }
  | { exists: string }
  | { matches: [Operand, string] };

const LiteralSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const OperandSchema: z.ZodType<Operand> = z.union([
  LiteralSchema,
  z.array(LiteralSchema),
  z.object({ var: z.string() }).strict(),
]);
const pair = z.tuple([OperandSchema, OperandSchema]);

export const ExprSchema: z.ZodType<Expr> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(ExprSchema).min(1) }).strict(),
    z.object({ any: z.array(ExprSchema).min(1) }).strict(),
    z.object({ not: ExprSchema }).strict(),
    z.object({ eq: pair }).strict(),
    z.object({ neq: pair }).strict(),
    z.object({ gt: pair }).strict(),
    z.object({ gte: pair }).strict(),
    z.object({ lt: pair }).strict(),
    z.object({ lte: pair }).strict(),
    z.object({ in: pair }).strict(),
    z.object({ exists: z.string() }).strict(),
    z.object({ matches: z.tuple([OperandSchema, z.string()]) }).strict(),
  ]),
);

export const RuleSubject = z.enum(['snapshot', 'fees', 'lineItems', 'controls', 'cues', 'cards']);

export const EvidenceTemplate = z.object({
  type: Evidence.shape.type,
  source: Evidence.shape.source,
  /** Template: `{path}` or `{path|inr}`, `{path|pct}`. */
  description: z.string(),
  /** Path whose value is copied into Evidence.observedValue. */
  observed: z.string().optional(),
});

export const Rule = z.object({
  id: z.string().regex(/^[A-Z]+-\d{2}$/),
  category: z.string(),
  subcategory: z.string().optional(),
  tags: z.array(z.string()).default([]),
  /** One-line rationale shown to developers and in "why did this fire". */
  rationale: z.string(),
  forEach: RuleSubject,
  minSensitivity: Sensitivity.default('standard'),
  when: ExprSchema,
  requires: ExprSchema.optional(),
  unless: ExprSchema.optional(),
  emit: z.object({
    title: z.string(),
    summary: z.string(),
    consumerImpact: z.string(),
    recommendedAction: z.string(),
    severity: Severity,
    confidence: z.number().min(0).max(1),
    status: FindingStatus.extract(['detected', 'needs_verification']),
    evidenceBasis: EvidenceBasis,
    evidence: z.array(EvidenceTemplate).min(1),
    evidenceKey: z.string(),
    elementRef: z.string().optional(),
    researchRefs: z.array(z.string()).default([]),
    limitations: z.array(z.string()).default([]),
  }),
});
export type Rule = z.infer<typeof Rule>;

export const RulePack = z.object({
  schemaVersion: z.literal(1),
  packId: z.string(),
  version: z.string(),
  /** Case-insensitive regex sources. Keep to syntax shared by JS and java.util.regex. */
  lexicons: z.record(z.string(), z.array(z.string()).min(1)),
  rules: z.array(Rule).min(1),
});
export type RulePack = z.infer<typeof RulePack>;
