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

/**
 * JSON Schema for the planner's single tool, `submit_plan`. Deliberately flat
 * (one action shape with optional fields) because models follow it more
 * reliably than a one-of union; `Plan` checks each action strictly afterwards.
 */
export const PLAN_JSON_SCHEMA = {
  type: 'object',
  properties: {
    actions: {
      type: 'array',
      minItems: 1,
      maxItems: 6,
      description: 'The ordered actions for this page.',
      items: {
        type: 'object',
        properties: {
          tool: { type: 'string', enum: ['set_control', 'click', 'dismiss_prompt', 'request_checkout', 'ask_user', 'stop'] },
          controlId: { type: 'string', description: 'Required for set_control and click: a control id from the page.' },
          checked: { type: 'boolean', description: 'Required for set_control: the state the checkbox should end in.' },
          promptId: { type: 'string', description: 'Required for dismiss_prompt: a prompt id from the page.' },
          question: { type: 'string', description: 'Required for ask_user.' },
          amounts: {
            type: 'array',
            description: 'For ask_user: the amounts the question is about, in paise.',
            items: { type: 'object', properties: { label: { type: 'string' }, paise: { type: 'integer' } }, required: ['label', 'paise'] },
          },
          reason: { type: 'string', description: 'Required for stop.' },
          explanation: { type: 'string', description: 'One sentence a shopper would understand.' },
        },
        required: ['tool', 'explanation'],
      },
    },
  },
  required: ['actions'],
} as const;
