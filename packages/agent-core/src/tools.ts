import { z } from 'zod';

const explanation = z.string().min(1).max(200);

/**
 * Everything the planner may do. Nothing here pays, approves, amends the
 * mandate or touches PayPal: those belong to the guard and the human.
 */
export const Action = z.discriminatedUnion('tool', [
  z.object({ tool: z.literal('set_control'), controlId: z.string(), checked: z.boolean(), explanation }),
  z.object({ tool: z.literal('click'), controlId: z.string(), explanation }),
  z.object({ tool: z.literal('dismiss_prompt'), promptId: z.string(), explanation }),
  z.object({ tool: z.literal('request_checkout'), explanation }),
  z.object({
    tool: z.literal('ask_user'),
    question: z.string().min(1).max(300),
    amounts: z.array(z.object({ label: z.string(), paise: z.number().int().nonnegative() })).max(6),
    explanation,
  }),
  z.object({ tool: z.literal('stop'), reason: z.string().min(1).max(300), explanation }),
]);
export type Action = z.infer<typeof Action>;

export const Plan = z.object({ actions: z.array(Action).min(1).max(6) });
export type Plan = z.infer<typeof Plan>;

/** JSON Schema for the planner's single tool, `submit_plan`. */
export const PLAN_JSON_SCHEMA = z.toJSONSchema(Plan);
