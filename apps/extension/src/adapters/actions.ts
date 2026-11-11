import type { ControlFact } from '@faircart/schemas';
import type { RefRegistry } from './types';
import { cleanText, isVisible } from './util';

/**
 * Generic action reader: the visible links and buttons in a page's main region
 * ("Remove demo pass", "Proceed to checkout") as controls with stable ids, so
 * a shopping agent can act through the same element handles FairCart reads.
 * Dialogs are left out: upsell prompts are read as accept/decline pairs instead.
 */
export function extractActions(root: ParentNode, refs: RefRegistry): ControlFact[] {
  const main = root.querySelector('main') ?? root;
  const out: ControlFact[] = [];
  const seen = new Set<string>();
  for (const el of main.querySelectorAll('a, button, [role="button"]')) {
    if (el.closest('[role="dialog"], [aria-modal="true"], dialog, [data-faircart-ui], [hidden]')) continue;
    if (!isVisible(el)) continue;
    const label = cleanText(el.textContent);
    if (!label || label.length > 60) continue;
    const id = `act:${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, kind: el.tagName === 'A' ? 'link' : 'button', label, checked: null, role: 'other', elRef: refs.ref(el) });
  }
  return out;
}
