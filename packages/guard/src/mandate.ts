import { FeeKind } from '@faircart/schemas';
import { z } from 'zod';

const Paise = z.number().int().nonnegative();

export const Approval = z.object({ label: z.string().min(1), kind: FeeKind, paise: Paise });
export type Approval = z.infer<typeof Approval>;

/** What the human signed. Only a human click creates a version or an amendment. */
export const Mandate = z.object({
  version: z.number().int().positive(),
  signedAt: z.string(),
  want: z.object({ sku: z.string().min(1), title: z.string().min(1), maxQuantity: z.number().int().positive() }),
  maxTotalPaise: Paise,
  allowedFees: z.array(FeeKind),
  feeCapsPaise: z.record(z.string(), Paise).optional(),
  amendments: z.array(z.object({ version: z.number().int(), at: z.string(), approved: z.array(Approval) })),
});
export type Mandate = z.infer<typeof Mandate>;

export function amendMandate(m: Mandate, approved: Approval[], at: string): Mandate {
  const version = m.version + 1;
  return { ...m, version, amendments: [...m.amendments, { version, at, approved }] };
}

/** True when a human amendment approved exactly this label and amount. */
export function isApproved(m: Mandate, label: string, paise: number): boolean {
  const norm = (s: string) => s.trim().toLowerCase();
  return m.amendments.some((a) => a.approved.some((x) => norm(x.label) === norm(label) && x.paise === paise));
}
