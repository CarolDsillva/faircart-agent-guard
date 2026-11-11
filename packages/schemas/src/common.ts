import { z } from 'zod';

/** Retailers in the support registry. `generic` is the fallback adapter for unlisted shops. */
export const RetailerId = z.enum([
  'amazon_in',
  'flipkart',
  'myntra',
  'nykaa',
  'meesho',
  'ajio',
  'tata_neu',
  'jiomart',
  'blinkit',
  'zepto',
  'swiggy_instamart',
  'bigbasket',
  'amazon_fresh',
  'flipkart_minutes',
  'generic',
]);
export type RetailerId = z.infer<typeof RetailerId>;

export const Surface = z.enum(['web', 'android']);
export type Surface = z.infer<typeof Surface>;

/** Where the shopper is in the journey. Only the first four have an order. */
export const Stage = z.enum(['listing', 'product', 'cart', 'checkout', 'membership', 'account', 'unknown']);
export type Stage = z.infer<typeof Stage>;

export const STAGE_ORDER: Partial<Record<Stage, number>> = { listing: 0, product: 1, cart: 2, checkout: 3 };

export const Severity = z.enum(['P0', 'P1', 'P2', 'P3']);
export type Severity = z.infer<typeof Severity>;

export const FindingStatus = z.enum([
  'detected',
  'needs_verification',
  'confirmed_repeatable',
  'not_reproducible',
  'dismissed_by_user',
]);
export type FindingStatus = z.infer<typeof FindingStatus>;

/** The kind of evidence a finding rests on (report §2, evidence labels). */
export const EvidenceBasis = z.enum([
  'current_screen',
  'repeatable_test',
  'published_audit',
  'consumer_report',
  'regulatory_finding',
]);
export type EvidenceBasis = z.infer<typeof EvidenceBasis>;

export const Sensitivity = z.enum(['standard', 'high']);
export type Sensitivity = z.infer<typeof Sensitivity>;

/** Rupee amount. FairCart is India-only, so currency is implicit INR. */
export const Rupees = z.number().finite();
