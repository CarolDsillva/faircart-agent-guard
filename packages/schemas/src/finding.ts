import { z } from 'zod';
import { EvidenceBasis, FindingStatus, RetailerId, Severity, Stage, Surface } from './common';

export const DISCLAIMER =
  'This is a potential dark pattern based on observed interface evidence. It is not a legal finding.';

export const Evidence = z.object({
  type: z.enum(['screen_text', 'price_change', 'control_state', 'journey_diff', 'history', 'ai_reading']),
  source: z.enum(['current_page', 'journey', 'repeat_test', 'price_history', 'model']),
  description: z.string(),
  observedValue: z.union([z.string(), z.number(), z.boolean()]).nullable(),
  stage: Stage,
  timestamp: z.iso.datetime(),
});
export type Evidence = z.infer<typeof Evidence>;

export const Finding = z.object({
  /** fc_ + FNV-1a 64 of ruleId|platform|retailerSku|stage|evidenceKey. Stable across reloads and engines. */
  id: z.string().regex(/^fc_[0-9a-f]{16}$/),
  ruleId: z.string(),
  packVersion: z.string(),
  category: z.string(),
  subcategory: z.string().nullable(),
  tags: z.array(z.string()),
  title: z.string(),
  summary: z.string(),
  consumerImpact: z.string(),
  recommendedAction: z.string(),
  evidence: z.array(Evidence).min(1),
  evidenceBasis: EvidenceBasis,
  confidence: z.number().min(0).max(1),
  severity: Severity,
  status: FindingStatus,
  platform: RetailerId,
  surface: Surface,
  stage: Stage,
  retailerSku: z.string().nullable(),
  /** Local element handle; stripped before anything leaves the device. */
  elementRef: z.string().nullable(),
  researchRefs: z.array(z.string()),
  limitations: z.array(z.string()),
  disclaimer: z.string(),
  detectedAt: z.iso.datetime(),
  engineSpec: z.literal(1),
});
export type Finding = z.infer<typeof Finding>;

export const TraceEntry = z.object({
  ruleId: z.string(),
  itemId: z.string(),
  result: z.enum(['fired', 'when_false', 'requires_false', 'unless_true', 'skipped_sensitivity']),
});
export type TraceEntry = z.infer<typeof TraceEntry>;

export const EvaluationResult = z.object({
  packId: z.string(),
  packVersion: z.string(),
  findings: z.array(Finding),
  trace: z.array(TraceEntry),
});
export type EvaluationResult = z.infer<typeof EvaluationResult>;
