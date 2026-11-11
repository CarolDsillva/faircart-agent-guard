/**
 * The 13 official categories in India's CCPA Guidelines for Prevention and
 * Regulation of Dark Patterns, 2023 (report §3–4). Text is a plain-English
 * paraphrase for consumers, not the legal wording.
 */
export type CategoryId =
  | 'false_urgency'
  | 'basket_sneaking'
  | 'confirm_shaming'
  | 'forced_action'
  | 'subscription_trap'
  | 'interface_interference'
  | 'bait_and_switch'
  | 'drip_pricing'
  | 'disguised_advertisement'
  | 'nagging'
  | 'trick_wording'
  | 'saas_billing'
  | 'rogue_malware';

export interface Category {
  id: CategoryId;
  number: number;
  name: string;
  /** What the manipulation is. */
  definition: string;
  /** Why a shopper should care, without legal jargon. */
  plainEnglish: string;
  /** A typical shopping or quick-commerce example. */
  example: string;
  /** How to check it (report audit test). */
  auditTest: string;
  /** What is NOT this pattern, to keep detectors honest. */
  notThis: string;
  /** Typical ordinary-marketplace relevance. Low categories only activate on specific evidence. */
  marketplaceRelevance: 'high' | 'medium' | 'low';
  researchRefs: string[];
}

export const CATEGORIES: readonly Category[] = [
  {
    id: 'false_urgency',
    number: 1,
    name: 'False urgency',
    definition: 'Inventing or overstating urgency or scarcity to push an immediate purchase.',
    plainEnglish: 'A timer or "only 2 left" message that is not tied to a real deadline or real stock can rush you into buying.',
    example: 'A countdown that restarts when you reload the page, or a low-stock badge that never changes.',
    auditTest: 'Reload, revisit, change variant or location, and check whether the claim or timer resets without a real stock or offer change.',
    notThis: 'A real sale deadline or genuinely limited stock, shown accurately.',
    marketplaceRelevance: 'high',
    researchRefs: ['S1', 'S6', 'S7', 'S12'],
  },
  {
    id: 'basket_sneaking',
    number: 2,
    name: 'Basket sneaking',
    definition: 'Adding goods, services, memberships or donations to the basket without the shopper choosing them.',
    plainEnglish: 'Something you did not pick is in your cart, so you pay for it unless you notice and remove it.',
    example: 'A paid membership, protection plan or donation already selected at checkout.',
    auditTest: 'Start with a clean cart and record every item before and after each step. Paid additions should need a clear, unticked opt-in.',
    notThis: 'A clearly offered add-on that starts unselected, or a free gift that costs nothing.',
    marketplaceRelevance: 'high',
    researchRefs: ['S1', 'S4', 'S17', 'S18'],
  },
  {
    id: 'confirm_shaming',
    number: 3,
    name: 'Confirm shaming',
    definition: 'Using guilt, shame or fear to steer the shopper towards a purchase, add-on or subscription.',
    plainEnglish: 'The "no" button is worded to make you feel foolish or careless for declining.',
    example: '"No thanks, I\'ll pay more" or "I don\'t care about my safety".',
    auditTest: 'Check whether declining is neutral and clear, not emotionally loaded or framed as irresponsible.',
    notThis: 'A neutral "No thanks" or "Skip".',
    marketplaceRelevance: 'medium',
    researchRefs: ['S1', 'S5'],
  },
  {
    id: 'forced_action',
    number: 4,
    name: 'Forced action',
    definition: 'Requiring an unrelated purchase, sign-up, app install or data disclosure to finish the intended task.',
    plainEnglish: 'You are made to do or give something extra that is not needed for what you came to do.',
    example: 'A paid pass required to check out, or unnecessary personal details demanded before payment.',
    auditTest: 'Can the purchase be completed without the unrelated extra? Is every requested data field needed and explained?',
    notThis: 'An account or address that is genuinely needed for delivery or fraud control.',
    marketplaceRelevance: 'high',
    researchRefs: ['S1', 'S4', 'S5'],
  },
  {
    id: 'subscription_trap',
    number: 5,
    name: 'Subscription trap',
    definition: 'Making it impossible, hidden or needlessly complex to cancel a paid subscription.',
    plainEnglish: 'Joining takes one tap, but leaving takes a hunt through menus or a support call.',
    example: 'A membership with no visible cancel option in the account area.',
    auditTest: 'Compare the number and difficulty of steps to join and to cancel, and confirm cancellation is final and documented.',
    notThis: 'A membership with a clear cancel route that is as easy as joining.',
    marketplaceRelevance: 'medium',
    researchRefs: ['S1', 'S5', 'S14'],
  },
  {
    id: 'interface_interference',
    number: 6,
    name: 'Interface interference',
    definition: 'Visual design that highlights the option the platform prefers and hides or downplays alternatives or key information.',
    plainEnglish: 'The option that costs you more is big and bright; the cheaper one or the fee details are hard to see.',
    example: 'A bright "Join" button next to a faint, small "skip" link.',
    auditTest: 'Compare visual prominence, number of taps, defaults and placement of the accept and decline choices.',
    notThis: 'Accept and decline shown with similar prominence.',
    marketplaceRelevance: 'high',
    researchRefs: ['S1', 'S5'],
  },
  {
    id: 'bait_and_switch',
    number: 7,
    name: 'Bait and switch',
    definition: 'Advertising one outcome and delivering a materially different one after the shopper acts.',
    plainEnglish: 'The price or product that drew you in is not what you get once you click.',
    example: 'A low price in search that becomes a higher price, a different size or a different seller on the product page.',
    auditTest: 'Capture the entry price, selected SKU, quantity, pincode, delivery promise and final item, and compare like for like.',
    notThis: 'A price change because you chose a different variant, seller or quantity.',
    marketplaceRelevance: 'high',
    researchRefs: ['S1', 'S4', 'S5'],
  },
  {
    id: 'drip_pricing',
    number: 8,
    name: 'Drip pricing',
    definition: 'Not revealing price elements or mandatory charges upfront, or revealing them late or quietly.',
    plainEnglish: 'Extra charges appear only at the last step, after you have already decided to buy.',
    example: 'A handling, platform or small-cart fee that first appears on the payment screen.',
    auditTest: 'Compare the price in search, product page, cart, payment page and invoice. All mandatory charges should be visible early.',
    notThis: 'A fee that exists but was clearly disclosed before checkout. The fee itself is not the problem.',
    marketplaceRelevance: 'high',
    researchRefs: ['S1', 'S4', 'S5', 'S17', 'S18'],
  },
  {
    id: 'disguised_advertisement',
    number: 9,
    name: 'Disguised advertisement',
    definition: 'Paid promotion made to look like organic results, reviews or editorial content.',
    plainEnglish: 'A paid listing looks just like a normal search result, so you cannot tell it was an ad.',
    example: 'A sponsored product with a tiny, faint "Sponsored" label or none at all.',
    auditTest: 'Check whether an ordinary shopper can identify the paid placement before clicking.',
    notThis: 'A clearly labelled sponsored listing. Paid placement on its own is not a dark pattern.',
    marketplaceRelevance: 'medium',
    researchRefs: ['S1', 'S15'],
  },
  {
    id: 'nagging',
    number: 10,
    name: 'Nagging',
    definition: 'Repeated interruptions, requests or prompts unrelated to what the shopper is doing.',
    plainEnglish: 'The same pop-up keeps coming back after you have said no.',
    example: 'A membership pop-up that returns on every page after being dismissed.',
    auditTest: 'Dismiss once, continue, and count whether the same prompt keeps returning without a relevant change.',
    notThis: 'A single prompt, or a reminder about something you started yourself.',
    marketplaceRelevance: 'medium',
    researchRefs: ['S1', 'S5'],
  },
  {
    id: 'trick_wording',
    number: 11,
    name: 'Trick question / trick wording',
    definition: 'Confusing wording, double negatives or mismatched controls that lead to consent the shopper did not intend.',
    plainEnglish: 'The wording is so twisted that ticking the box may do the opposite of what you think.',
    example: '"Uncheck to not stop receiving updates."',
    auditTest: 'Ask someone to explain what the control does before clicking. Its effect should be clear at a glance.',
    notThis: 'A plain "Send me offers" checkbox that starts unticked.',
    marketplaceRelevance: 'low',
    researchRefs: ['S1', 'S5'],
  },
  {
    id: 'saas_billing',
    number: 12,
    name: 'SaaS billing',
    definition: 'Recurring charges or renewal terms not properly disclosed in subscription billing.',
    plainEnglish: 'A free trial or membership quietly turns into a recurring charge you were not clearly told about.',
    example: 'A trial whose renewal price and date are not shown before you sign up.',
    auditTest: 'Show the full renewal price, date, cadence and cancellation route before signup.',
    notThis: 'A subscription that shows price, cadence and renewal date before you agree.',
    marketplaceRelevance: 'low',
    researchRefs: ['S1', 'S5'],
  },
  {
    id: 'rogue_malware',
    number: 13,
    name: 'Rogue malware',
    definition: 'Scareware, ransomware or malicious software tactics used to make people pay or install fake protection.',
    plainEnglish: 'A fake "your device is infected" warning or a download prompt tries to scare you into installing or paying.',
    example: 'A shopping ad that redirects to a fake virus alert or an unexpected download.',
    auditTest: 'Check third-party redirects, ad destinations and download prompts. Uncommon in mainstream marketplace checkout.',
    notThis: 'The retailer\'s own app-store link, clearly labelled.',
    marketplaceRelevance: 'low',
    researchRefs: ['S1'],
  },
];
