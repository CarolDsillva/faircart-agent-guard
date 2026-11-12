import type { Reason } from '@faircart/guard';
import type { ScreenSnapshot } from '@faircart/schemas';
import type { Messages } from './prompt';
import { PLAN_JSON_SCHEMA, Plan } from './tools';

/** One call: messages in, the raw `submit_plan` tool input out. */
export interface LLMProvider {
  plan(messages: Messages, toolSchema: object): Promise<unknown>;
}

export type PlanResult = { ok: true; plan: Plan } | { ok: false; error: string };

/** Schema check, then every id must exist on the page the plan is for. */
export function validatePlan(raw: unknown, snapshot: ScreenSnapshot, lastGuard: Reason[] | null = null): PlanResult {
  const parsed = Plan.safeParse(fillMissingChecked(raw, snapshot));
  if (!parsed.success) return { ok: false, error: `Plan does not match the schema: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
  const controls = new Set(snapshot.controls.map((c) => c.id));
  const prompts = new Set(snapshot.cues.map((c) => c.promptId).filter(Boolean));
  for (const a of parsed.data.actions) {
    if ((a.tool === 'set_control' || a.tool === 'click') && !controls.has(a.controlId)) return { ok: false, error: `controlId "${a.controlId}" is not on this page` };
    if (a.tool === 'dismiss_prompt' && !prompts.has(a.promptId)) return { ok: false, error: `promptId "${a.promptId}" is not on this page` };
  }
  if (parsed.data.actions.some((a) => a.tool === 'ask_user') && lastGuard?.some((r) => r.fixable)) {
    return { ok: false, error: "Do not ask the user yet: the checker marked some problems fixable. Fix them with the page controls first (dispute an unexplained amount through the store's bill help), then request checkout." };
  }
  return { ok: true, plan: parsed.data };
}

/**
 * Models often leave out `checked` on set_control. The intent is plain from the
 * page: flip the box. That is always an untick for the pre-ticked add-ons the
 * agent is there to remove, and the checker still decides what may be paid.
 */
function fillMissingChecked(raw: unknown, snapshot: ScreenSnapshot): unknown {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { actions?: unknown }).actions)) return raw;
  const actions = (raw as { actions: unknown[] }).actions.map((a) => {
    if (!a || typeof a !== 'object') return a;
    const act = a as Record<string, unknown>;
    if (act.tool !== 'set_control' || typeof act.checked === 'boolean') return a;
    const current = snapshot.controls.find((c) => c.id === act.controlId)?.checked;
    return { ...act, checked: current === true ? false : current === false ? true : false };
  });
  return { ...(raw as object), actions };
}

/** Ask once; if the plan is invalid, ask again with the reason; then give up. */
export async function planWithRetry(provider: LLMProvider, messages: Messages, snapshot: ScreenSnapshot, lastGuard: Reason[] | null = null): Promise<PlanResult> {
  let msgs = messages;
  let last = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: unknown;
    try {
      raw = await provider.plan(msgs, PLAN_JSON_SCHEMA);
    } catch (e) {
      return { ok: false, error: `The planner could not be reached: ${e instanceof Error ? e.message : String(e)}` };
    }
    const r = validatePlan(raw, snapshot, lastGuard);
    if (r.ok) return r;
    last = r.error;
    msgs = { ...messages, user: `${messages.user}\n\nYour previous plan was invalid: ${r.error}. Return a corrected plan.` };
  }
  return { ok: false, error: `The planner returned an invalid plan twice (${last}).` };
}

/** Replays fixed plans in order: for tests and the labelled recorded run. */
export class ScriptedProvider implements LLMProvider {
  readonly calls: Messages[] = [];
  constructor(private readonly steps: unknown[]) {}
  async plan(messages: Messages): Promise<unknown> {
    this.calls.push(messages);
    if (this.calls.length > this.steps.length) throw new Error('script exhausted');
    return this.steps[this.calls.length - 1];
  }
}
