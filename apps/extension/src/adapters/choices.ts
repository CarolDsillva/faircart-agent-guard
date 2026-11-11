import type { ControlFact } from '@faircart/schemas';
import type { RefRegistry } from './types';
import { cleanText, hashString, isVisible, styleOf, text } from './util';

/**
 * Accept/decline pairs in upsell prompts: modal dialogs, and small blocks that
 * pitch a pass, membership, plan or protection with exactly one way to accept
 * and one to decline. Each pair shares a groupId so rules can compare wording
 * (confirm shaming) and prominence (interface interference).
 */

const OFFER_WORDS = /\b(pass|membership|member|plus|prime|subscribe|subscription|plan|protection|warranty|insurance|upgrade|trial|join)\b/i;
const DECLINE = /^(no(,| )|no thanks|not now|skip|maybe later|later|cancel|close|dismiss|i('|’)?ll pay|i don('|’)?t|continue without|remind me later|×|✕)/i;
const CLICKABLE = 'button, a, [role="button"], input[type="button"], input[type="submit"]';

function candidates(root: ParentNode): Element[] {
  const out = new Set<Element>();
  for (const d of root.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog[open]')) out.add(d);
  // Smallest blocks containing an offer phrase and 2–3 clickables.
  for (const el of root.querySelectorAll('section, aside, div, form')) {
    const clicks = el.querySelectorAll(CLICKABLE);
    if (clicks.length < 2 || clicks.length > 3) continue;
    const t = cleanText(el.textContent);
    if (t.length > 400 || !OFFER_WORDS.test(t)) continue;
    if ([...out].some((o) => o.contains(el) || el.contains(o))) continue;
    out.add(el);
  }
  return [...out];
}

export function readChoicePairs(root: ParentNode, refs: RefRegistry): ControlFact[] {
  const out: ControlFact[] = [];
  for (const box of candidates(root)) {
    if (box.closest('[data-faircart-ui]') || !isVisible(box)) continue;
    const boxText = cleanText(box.textContent);
    if (!OFFER_WORDS.test(boxText)) continue;
    const clicks = [...box.querySelectorAll(CLICKABLE)].filter((c) => isVisible(c));
    const labelled = clicks.map((c) => ({ el: c, label: text(c) || cleanText(c.getAttribute('aria-label')) || cleanText((c as HTMLInputElement).value) }));
    const declines = labelled.filter((c) => c.label && DECLINE.test(c.label));
    const accepts = labelled.filter((c) => c.label && !DECLINE.test(c.label) && c.label.length > 1);
    if (declines.length !== 1 || accepts.length !== 1) continue;
    const groupId = `choice:${hashString(boxText.slice(0, 80).toLowerCase())}`;
    for (const [c, role] of [
      [accepts[0]!, 'accept'],
      [declines[0]!, 'decline'],
    ] as const) {
      const style = styleOf(c.el);
      out.push({
        id: `${groupId}:${role}`,
        kind: c.el.tagName === 'A' ? 'link' : 'button',
        label: c.label.slice(0, 120),
        checked: null,
        role,
        groupId,
        ...(style ? { style } : {}),
        elRef: refs.ref(c.el),
      });
    }
  }
  return out;
}

/** Page stage from what the page offers, for sites whose URLs don't say. */
export function stageFromContent(root: ParentNode): 'cart' | 'checkout' | null {
  const labels = [...root.querySelectorAll(CLICKABLE)].filter((b) => !b.closest('[data-faircart-ui]')).map((b) => text(b).toLowerCase());
  if (labels.some((l) => /^(place (your )?order|pay now|proceed to pay|make payment|pay ₹)/.test(l))) return 'checkout';
  if (labels.some((l) => /^(proceed to (checkout|buy)|checkout|go to checkout|continue to (payment|checkout))/.test(l))) return 'cart';
  return null;
}
