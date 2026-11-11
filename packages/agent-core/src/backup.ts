import type { PageBrief } from './brief';
import type { Action, Plan } from './tools';

/**
 * The backup planner: no AI, no knowledge of any store. It plays the same
 * moves a careful shopper would, from FairCart's reading of the page: untick
 * paid add-ons, decline upsells, remove what wasn't asked for, question an
 * amount nobody explains, and ask the checker before paying. Used when the AI
 * planner is unavailable, and labelled as such in the UI.
 */
export function backupPlan(brief: PageBrief): Plan {
  const { page, mandate } = brief;
  const product = mandate.product.toLowerCase();
  const controls = page.controls;
  const find = (re: RegExp) => controls.find((c) => re.test(c.label));
  const actions: Action[] = [];

  const removeUnrequested = () => {
    for (const c of controls) {
      if (/^remove\b/i.test(c.label) && !product.includes(c.label.replace(/^remove\s+/i, '').toLowerCase())) {
        actions.push({ tool: 'click', controlId: c.id, explanation: `"${c.label.replace(/^remove\s+/i, '')}" isn't in your instructions, so I'm removing it.` });
      }
    }
  };

  const unexplained = brief.lastGuard?.find((r) => r.code === 'UNEXPLAINED_AMOUNT' && r.fixable);
  if (page.stage === 'checkout' && unexplained) {
    const dispute = find(/recogni[sz]e a charge|dispute/i);
    const help = find(/question about your bill|bill help/i);
    if (dispute) {
      actions.push({ tool: 'click', controlId: dispute.id, explanation: `The total includes ${unexplained.amount ?? 'an amount'} no line explains, so I'm disputing it.` });
      actions.push({ tool: 'request_checkout', explanation: 'Asking the checker again now the bill is corrected.' });
    } else if (help) {
      actions.push({ tool: 'click', controlId: help.id, explanation: "Opening the store's bill help to question an amount nobody explained." });
    }
    if (actions.length) return { actions };
  }

  for (const c of controls) {
    if (c.role === 'add_on' && c.checked === true) actions.push({ tool: 'set_control', controlId: c.id, checked: false, explanation: `"${c.label}" was ticked for you and isn't in your instructions.` });
  }
  for (const p of page.prompts) actions.push({ tool: 'dismiss_prompt', promptId: p.promptId, explanation: 'Declining an upsell pop-up.' });

  if (page.stage === 'product') {
    const add = find(/^(add to (basket|cart|bag)|buy now)/i);
    if (add) actions.push({ tool: 'click', controlId: add.id, explanation: `Adding ${mandate.product} to the basket.` });
  } else if (page.stage === 'cart') {
    removeUnrequested();
    const next = find(/^(proceed to (checkout|pay)|checkout|go to checkout)/i);
    if (next) actions.push({ tool: 'click', controlId: next.id, explanation: 'Going to checkout.' });
  } else if (page.stage === 'checkout') {
    removeUnrequested();
    actions.push({ tool: 'request_checkout', explanation: 'Asking the checker before any money moves.' });
  }

  return { actions: actions.length ? actions.slice(0, 6) : [{ tool: 'stop', reason: "I can't tell what to do on this page.", explanation: 'Stopping rather than guessing.' }] };
}
