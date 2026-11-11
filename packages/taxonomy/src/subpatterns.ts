import type { CategoryId } from './categories';

/**
 * Additional patterns from report §5. These are tags on a finding and always map
 * to one or more official categories. They are never presented as separate legal
 * categories.
 */
export type SubPatternId =
  | 'agent_directive'
  | 'privacy_zuckering'
  | 'fake_social_proof'
  | 'misleading_scarcity'
  | 'roach_motel'
  | 'forced_registration'
  | 'reference_price_anchoring'
  | 'preselected_default'
  | 'threshold_engineering'
  | 'wallet_credit_trap'
  | 'pricing_opacity'
  | 'sponsored_ranking'
  | 'misleading_variant'
  | 'obstructive_returns'
  | 'abandoned_cart_marketing'
  | 'confirm_shaming_variation'
  // Rule-level subcategories used by core rules.
  | 'countdown_reset'
  | 'late_mandatory_fee'
  | 'unconsented_paid_item'
  | 'unlabelled_sponsorship'
  | 'repeated_prompt'
  | 'double_negative'
  | 'undisclosed_renewal'
  | 'missing_cancel_route'
  | 'decline_asymmetry'
  | 'entry_price_mismatch'
  | 'scareware';

export interface SubPattern {
  id: SubPatternId;
  name: string;
  mapsTo: CategoryId[];
  signal: string;
  /** Whether this comes straight from report §5 or is a narrower rule-level label. */
  origin: 'report_additional' | 'rule_level';
  researchRefs: string[];
}

export const SUB_PATTERNS: readonly SubPattern[] = [
  { id: 'privacy_zuckering', name: 'Privacy Zuckering', mapsTo: ['forced_action', 'trick_wording'], signal: 'Marketing consent preselected or unnecessary personal data made mandatory.', origin: 'report_additional', researchRefs: ['S4'] },
  { id: 'fake_social_proof', name: 'Fake social proof / activity cues', mapsTo: ['false_urgency'], signal: 'Activity or popularity counts that do not change across reloads or products.', origin: 'report_additional', researchRefs: ['S12'] },
  { id: 'misleading_scarcity', name: 'Misleading scarcity', mapsTo: ['false_urgency'], signal: 'Low-stock claims that conflict with available quantity or never change.', origin: 'report_additional', researchRefs: ['S12'] },
  { id: 'roach_motel', name: 'Roach motel / cancellation obstruction', mapsTo: ['subscription_trap', 'interface_interference'], signal: 'Joining is much easier than cancelling, deleting an account or stopping marketing.', origin: 'report_additional', researchRefs: ['S14'] },
  { id: 'forced_registration', name: 'Forced registration / app-install gating', mapsTo: ['forced_action'], signal: 'Product details, prices or offers hidden behind a login or app install that is not essential.', origin: 'report_additional', researchRefs: ['S14'] },
  { id: 'reference_price_anchoring', name: 'Misleading discount / reference-price anchoring', mapsTo: ['bait_and_switch'], signal: 'Claimed discount not supported by observed 30-day price history (needs full coverage).', origin: 'report_additional', researchRefs: ['S12'] },
  { id: 'preselected_default', name: 'Preselected defaults', mapsTo: ['basket_sneaking', 'interface_interference', 'forced_action'], signal: 'A paid item, tip, donation or consent switched on without a recorded tap.', origin: 'report_additional', researchRefs: ['S9'] },
  { id: 'threshold_engineering', name: 'Threshold engineering', mapsTo: ['interface_interference', 'bait_and_switch'], signal: 'A "free" delivery or gift condition revealed late or contradicted by the bill.', origin: 'report_additional', researchRefs: ['S9'] },
  { id: 'wallet_credit_trap', name: 'Loyalty, wallet-credit and cashback traps', mapsTo: ['bait_and_switch', 'trick_wording'], signal: 'Headline credit value conflicts with visible caps, expiry or minimum spend.', origin: 'report_additional', researchRefs: ['S9'] },
  { id: 'pricing_opacity', name: 'Personalised or device-dependent pricing opacity', mapsTo: ['bait_and_switch'], signal: 'Same SKU, seller and pincode at different prices across the user\'s own devices.', origin: 'report_additional', researchRefs: ['S9'] },
  { id: 'sponsored_ranking', name: 'Search-ranking manipulation / obscured sponsorship', mapsTo: ['disguised_advertisement'], signal: 'Sponsored labels hard to notice, or "recommended" claims that hide paid ranking.', origin: 'report_additional', researchRefs: ['S15'] },
  { id: 'misleading_variant', name: 'Misleading product variants', mapsTo: ['bait_and_switch'], signal: 'The card price belongs to a different size, pack or seller than the default selection.', origin: 'report_additional', researchRefs: ['S12'] },
  { id: 'obstructive_returns', name: 'Obstructive returns and refunds', mapsTo: ['interface_interference', 'forced_action'], signal: 'Return policy not reachable before checkout, or store credit pushed instead of a refund.', origin: 'report_additional', researchRefs: ['S14'] },
  { id: 'abandoned_cart_marketing', name: 'Repeated abandoned-cart marketing', mapsTo: ['nagging'], signal: 'Repeated reminders after the shopper declined or opted out.', origin: 'report_additional', researchRefs: ['S4'] },
  { id: 'confirm_shaming_variation', name: 'Confirm-shaming variations', mapsTo: ['confirm_shaming'], signal: 'Decline wording implies the buyer is foolish, unsafe or wasteful.', origin: 'report_additional', researchRefs: ['S1'] },

  { id: 'countdown_reset', name: 'Countdown reset', mapsTo: ['false_urgency'], signal: 'A countdown value went up for the same offer.', origin: 'rule_level', researchRefs: ['S1'] },
  { id: 'late_mandatory_fee', name: 'Late mandatory fee', mapsTo: ['drip_pricing'], signal: 'A mandatory fee first seen at checkout although earlier stages were observed.', origin: 'rule_level', researchRefs: ['S1', 'S17'] },
  { id: 'agent_directive', name: 'Instructions aimed at AI agents', mapsTo: ['forced_action'], signal: 'Page text tells AI shopping assistants an extra paid item is required or what to choose.', origin: 'rule_level', researchRefs: ['S1'] },
  { id: 'unconsented_paid_item', name: 'Paid item without a recorded choice', mapsTo: ['basket_sneaking'], signal: 'A paid basket item with no recorded tap.', origin: 'rule_level', researchRefs: ['S1', 'S17'] },
  { id: 'unlabelled_sponsorship', name: 'Unlabelled or faint sponsorship', mapsTo: ['disguised_advertisement'], signal: 'Ad slot with no label or a label far less prominent than the card text.', origin: 'rule_level', researchRefs: ['S1', 'S15'] },
  { id: 'repeated_prompt', name: 'Repeated prompt', mapsTo: ['nagging'], signal: 'The same prompt shown again after dismissal.', origin: 'rule_level', researchRefs: ['S1'] },
  { id: 'double_negative', name: 'Double-negative control', mapsTo: ['trick_wording'], signal: 'Control wording uses a double negative.', origin: 'rule_level', researchRefs: ['S1'] },
  { id: 'undisclosed_renewal', name: 'Renewal terms not shown', mapsTo: ['saas_billing'], signal: 'Membership or trial without visible recurring price, cadence and renewal date.', origin: 'rule_level', researchRefs: ['S1'] },
  { id: 'missing_cancel_route', name: 'No visible cancel route', mapsTo: ['subscription_trap'], signal: 'Membership management screen without a cancel option.', origin: 'rule_level', researchRefs: ['S1'] },
  { id: 'decline_asymmetry', name: 'Decline much less prominent', mapsTo: ['interface_interference'], signal: 'Accept control far more prominent than decline.', origin: 'rule_level', researchRefs: ['S1'] },
  { id: 'entry_price_mismatch', name: 'Entry price mismatch', mapsTo: ['bait_and_switch'], signal: 'Product page price differs from the listing card the shopper came from.', origin: 'rule_level', researchRefs: ['S1'] },
  { id: 'scareware', name: 'Scareware or off-site download', mapsTo: ['rogue_malware'], signal: 'Infection warnings or download prompts pointing outside the retailer.', origin: 'rule_level', researchRefs: ['S1'] },
];
