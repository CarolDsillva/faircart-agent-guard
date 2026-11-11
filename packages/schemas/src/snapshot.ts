import { z } from 'zod';
import { RetailerId, Rupees, Sensitivity, Stage, Surface } from './common';

/**
 * ScreenSnapshot is the one shape both sensors emit: site adapters (DOM) in the
 * extension and app adapters (accessibility tree) on Android. Rules never see raw
 * DOM or nodes. `elRef` values are local handles and are never sent off device.
 */

export const Style = z.object({
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  /** WCAG contrast ratio against the element's background, 1–21. */
  contrast: z.number().min(1).max(21),
  fontWeight: z.number().default(400),
  fontSize: z.number().positive().optional(),
});
export type Style = z.infer<typeof Style>;

export const PriceFact = z.object({
  kind: z.enum(['listed', 'reference', 'unit', 'member']),
  amount: Rupees,
  label: z.string().optional(),
  elRef: z.string().optional(),
});

export const FeeKind = z.enum([
  'delivery',
  'handling',
  'platform',
  'packaging',
  'small_cart',
  'surge',
  'convenience',
  'cod',
  'tip',
  'donation',
  'other',
]);
export type FeeKind = z.infer<typeof FeeKind>;

export const FeeFact = z.object({
  id: z.string(),
  kind: FeeKind,
  /** null when the label is visible but the amount could not be read. */
  amount: Rupees.nullable(),
  label: z.string(),
  /** null when the screen does not say whether the fee is optional. */
  mandatory: z.boolean().nullable().default(null),
  /** `line` = a bill line; `disclosure` = text describing the fee before the bill. */
  context: z.enum(['line', 'disclosure']).default('line'),
  elRef: z.string().optional(),
});
export type FeeFact = z.infer<typeof FeeFact>;

export const LineItem = z.object({
  id: z.string(),
  title: z.string(),
  quantity: z.number().int().positive().default(1),
  amount: Rupees.nullable(),
  paid: z.boolean(),
  itemType: z.enum(['product', 'membership', 'protection', 'service', 'tip', 'donation', 'gift']),
  /** How the item got into the basket, as far as the adapter can tell. */
  origin: z.enum(['user_tap', 'preselected', 'unknown']).default('unknown'),
  controlId: z.string().optional(),
  retailerSku: z.string().optional(),
  elRef: z.string().optional(),
});
export type LineItem = z.infer<typeof LineItem>;

export const ControlFact = z.object({
  id: z.string(),
  kind: z.enum(['checkbox', 'toggle', 'button', 'link', 'radio']),
  label: z.string(),
  checked: z.boolean().nullable().default(null),
  role: z.enum(['accept', 'decline', 'consent', 'variant_selector', 'add_on', 'other']),
  /** Accept and decline controls for the same prompt share a groupId. */
  groupId: z.string().optional(),
  paidAmount: Rupees.nullable().optional(),
  style: Style.optional(),
  elRef: z.string().optional(),
});
export type ControlFact = z.infer<typeof ControlFact>;

export const CueFact = z.object({
  id: z.string(),
  kind: z.enum([
    'countdown',
    'stock',
    'social_proof',
    'threshold',
    'prompt',
    'gate',
    'download_prompt',
    'scareware',
  ]),
  text: z.string(),
  /** Parsed value: seconds remaining for countdowns, units for stock, count for social proof. */
  value: z.number().nullable().default(null),
  /** Stable key for the same cue across snapshots, e.g. "countdown:deal-of-day". */
  cueKey: z.string(),
  /** Identifies the offer a countdown belongs to; a change means a genuinely new offer. */
  offerRef: z.string().optional(),
  /** For prompts: the prompt's identity, used to count re-shows after dismissal. */
  promptId: z.string().optional(),
  /** For gates: what the gate demands before the user can continue. */
  gateType: z.enum(['login', 'app_install', 'membership', 'personal_data']).optional(),
  /** For download prompts and redirects: true when the target is outside the retailer. */
  targetOffRetailer: z.boolean().optional(),
  /** When this cue first appeared on this page view; set by the journey when a page is rescanned. */
  firstSeenAt: z.iso.datetime().optional(),
  elRef: z.string().optional(),
});
export type CueFact = z.infer<typeof CueFact>;

export const ListingCard = z.object({
  id: z.string(),
  retailerSku: z.string(),
  title: z.string(),
  price: Rupees.nullable(),
  variantLabel: z.string().optional(),
  /**
   * `unlabelled` is only set when the adapter recognises an ad slot from markup
   * (e.g. an ad container attribute) and finds no visible label.
   */
  sponsored: z.enum(['labelled', 'unlabelled', 'no', 'unknown']).default('unknown'),
  sponsoredLabelStyle: Style.optional(),
  cardTextStyle: Style.optional(),
  elRef: z.string().optional(),
});
export type ListingCard = z.infer<typeof ListingCard>;

export const Membership = z.object({
  name: z.string(),
  price: Rupees.nullable(),
  cadence: z.string().nullable().default(null),
  trial: z.boolean().default(false),
  /** Recurring price, cadence and renewal date all visible in the current context. */
  renewalDisclosed: z.boolean(),
  /** null = not inspected on this screen. */
  cancelRouteVisible: z.boolean().nullable().default(null),
  enrolled: z.boolean().default(false),
});

export const Product = z.object({
  title: z.string(),
  brand: z.string().optional(),
  model: z.string().optional(),
  gtin: z.string().optional(),
  mpn: z.string().optional(),
  retailerSku: z.string(),
  variant: z.record(z.string(), z.string()).default({}),
  variantLabel: z.string().optional(),
  seller: z.string().optional(),
  condition: z.enum(['new', 'refurbished', 'used', 'unknown']).default('unknown'),
  quantity: z.object({ value: z.number().positive(), unit: z.string() }).optional(),
});
export type Product = z.infer<typeof Product>;

export const ScreenSnapshot = z.object({
  schemaVersion: z.literal(1),
  snapshotId: z.string(),
  journeyId: z.string(),
  platform: RetailerId,
  surface: Surface,
  stage: Stage,
  capturedAt: z.iso.datetime(),
  adapterId: z.string(),
  adapterVersion: z.string(),
  readability: z.enum(['full', 'partial', 'none']),
  pincodeBucket: z.string().optional(),
  product: Product.optional(),
  prices: z.array(PriceFact).default([]),
  fees: z.array(FeeFact).default([]),
  lineItems: z.array(LineItem).default([]),
  controls: z.array(ControlFact).default([]),
  cues: z.array(CueFact).default([]),
  cards: z.array(ListingCard).default([]),
  membership: Membership.optional(),
  total: Rupees.nullable().default(null),
});
export type ScreenSnapshot = z.infer<typeof ScreenSnapshot>;
export type ScreenSnapshotInput = z.input<typeof ScreenSnapshot>;

/** A recorded user interaction with a control FairCart has classified. Observed, never synthesised. */
export const TapEvent = z.object({
  controlId: z.string(),
  action: z.enum(['tap', 'dismiss']),
  at: z.iso.datetime(),
});
export type TapEvent = z.infer<typeof TapEvent>;

export const EvaluationContext = z.object({
  snapshot: ScreenSnapshot,
  /** Earlier snapshots in the same journey, oldest first. */
  journey: z.array(ScreenSnapshot).default([]),
  taps: z.array(TapEvent).default([]),
  sensitivity: Sensitivity.default('standard'),
});
export type EvaluationContext = z.infer<typeof EvaluationContext>;
export type EvaluationContextInput = z.input<typeof EvaluationContext>;
