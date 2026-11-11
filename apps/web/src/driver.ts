import { dismissControlFor } from '@faircart/adapters';
import type { Action } from '@faircart/agent-core';
import type { TapEvent } from '@faircart/schemas';
import type { Observation } from './sensor';

export interface DriverContext {
  /** Read the page again: the driver never acts on a stale reading. */
  observe: () => Promise<Observation>;
  /** Resolves when the store has finished loading its next page. */
  waitForNavigation: () => Promise<void>;
}

export type DriverResult = { result: 'done' | 'stale'; tap?: TapEvent };

/**
 * Carry out one page action by control id. The id is looked up in a fresh
 * reading of the page; if it's gone (the page changed), nothing is clicked.
 */
export async function runAction(action: Action, ctx: DriverContext): Promise<DriverResult> {
  const obs = await ctx.observe();

  if (action.tool === 'set_control' || action.tool === 'click') {
    const control = obs.snapshot.controls.find((c) => c.id === action.controlId);
    const el = control?.elRef ? obs.refs.get(control.elRef) : undefined;
    if (!el) return { result: 'stale' };

    if (action.tool === 'set_control') {
      const input = el instanceof HTMLInputElement ? el : (el.querySelector('input') ?? el.closest('label')?.querySelector('input') ?? null);
      if (input && input.checked === action.checked) return { result: 'done' };
      (input ?? (el as HTMLElement)).click();
      return { result: 'done' };
    }

    const navigates = el instanceof HTMLAnchorElement && !!el.getAttribute('href') && el.getAttribute('href') !== '#';
    const nav = navigates ? ctx.waitForNavigation() : null;
    (el as HTMLElement).click();
    if (nav) await nav;
    return { result: 'done' };
  }

  if (action.tool === 'dismiss_prompt') {
    for (const c of obs.snapshot.controls) {
      if (c.role !== 'decline' || !c.elRef) continue;
      const el = obs.refs.get(c.elRef);
      if (el && dismissControlFor(el)?.promptId === action.promptId) {
        (el as HTMLElement).click();
        return { result: 'done', tap: { controlId: c.id, action: 'dismiss', at: new Date().toISOString() } };
      }
    }
    return { result: 'stale' };
  }

  // request_checkout, ask_user and stop are handled by the run loop, not the page.
  return { result: 'done' };
}
