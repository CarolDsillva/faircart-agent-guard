import { addSnapshot, addTap } from '@faircart/adapters';
import { backupPlan, buildBrief, buildMessages, planWithRetry, validatePlan, type LLMProvider, type Plan } from '@faircart/agent-core';
import { amendMandate, Approval, guard, Mandate } from '@faircart/guard';
import { formatInr, toPaise } from '@faircart/money';
import { CORE, evaluate } from '@faircart/rules';
import { FeeKind, ScreenSnapshot, TapEvent } from '@faircart/schemas';
import { Hono } from 'hono';
import { z } from 'zod';
import { MAX_PLANNER_CALLS, type Run, type RunStore } from '../runs';

export interface RunDeps {
  store: RunStore;
  provider: LLMProvider;
  secret: string;
  now: () => Date;
}

const BillRow = z.object({
  label: z.string().max(300),
  amount: z.number().nullable(),
  kind: z.enum(['item', 'subtotal', 'discount', 'fee', 'total', 'membership', 'service']),
  feeKind: FeeKind.optional(),
  free: z.boolean(),
  elRef: z.string(),
});
const Bill = z.object({
  rows: z.array(BillRow).max(60),
  displayedTotal: z.number().nullable(),
  computedTotal: z.number().nullable(),
  difference: z.number().nullable(),
  unreadable: z.array(z.string()),
});

const CreateRun = z.object({ mandate: Mandate.pick({ want: true, maxTotalPaise: true, allowedFees: true, feeCapsPaise: true }) });
const Observe = z.object({
  seq: z.number().int(),
  pageId: z.string().min(1).max(200),
  url: z.string().url(),
  snapshot: z.unknown(),
  bill: Bill.nullable(),
  taps: z.array(TapEvent).max(50).optional(),
});
const Amend = z.union([z.object({ stop: z.literal(true) }), z.object({ approved: z.array(Approval).max(10) })]);

/** The public view of a run, also used for the receipt. */
export function runView(run: Run) {
  return {
    runId: run.id,
    state: run.state,
    mandate: run.mandate,
    error: run.error ?? null,
    lastGuard: run.lastGuard,
    authorization: run.authorization ?? null,
    orderId: run.orderId ?? null,
    capture: run.capture ?? null,
    planner: run.planner,
    receipt: receipt(run),
    audit: run.audit,
  };
}

/** "DemoMart tried ₹471. You paid ₹313." */
function receipt(run: Run) {
  const caught = [...run.caught.values()].map(({ label, paise }) => ({ label, paise }));
  const base = run.authorization?.totalPaise ?? run.lastCheckoutPaise;
  return {
    triedPaise: base + caught.reduce((s, c) => s + c.paise, 0),
    caught,
    approved: run.mandate.amendments.flatMap((a) => a.approved.map(({ label, paise }) => ({ label, paise }))),
    paidPaise: run.authorization?.totalPaise ?? null,
    paidUsdCents: run.authorization?.totalUsdCents ?? null,
    inrPerUsd: run.authorization?.rate.inrPerUsd ?? null,
  };
}

export function runRoutes(deps: RunDeps) {
  const { store } = deps;
  const app = new Hono();
  const created = new Map<string, number[]>();

  app.post('/', async (c) => {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
    const hour = deps.now().getTime() - 3_600_000;
    const recent = (created.get(ip) ?? []).filter((t) => t > hour);
    if (recent.length >= 30) return c.json({ error: 'rate_limited' }, 429);
    created.set(ip, [...recent, deps.now().getTime()]);

    const body = CreateRun.parse(await c.req.json());
    const mandate = Mandate.parse({ ...body.mandate, version: 1, signedAt: deps.now().toISOString(), amendments: [] });
    const run = store.create(mandate);
    return c.json({ runId: run.id, state: run.state });
  });

  app.get('/:id', (c) => {
    const run = store.get(c.req.param('id'));
    return run ? c.json(runView(run)) : c.json({ error: 'run_expired' }, 404);
  });

  app.post('/:id/observe', async (c) => {
    const run = store.get(c.req.param('id'));
    if (!run) return c.json({ error: 'run_expired' }, 404);
    const body = Observe.parse(await c.req.json());

    const snap = ScreenSnapshot.parse({ ...(body.snapshot as object), journeyId: run.journey?.id ?? 'pending' });
    const added = addSnapshot(run.journey, snap, body.pageId, () => crypto.randomUUID());
    let journey = added.journey;
    for (const t of body.taps ?? []) journey = addTap(journey, t);
    run.journey = journey;
    const { findings } = evaluate({ snapshot: added.current, journey: added.earlier, taps: journey.taps }, CORE);
    run.last = { snapshot: added.current, bill: body.bill, findings };
    if (added.current.stage === 'checkout' && body.bill?.displayedTotal != null) run.lastCheckoutPaise = toPaise(body.bill.displayedTotal);
    for (const ctl of added.current.controls) {
      if (ctl.role === 'add_on' && ctl.checked === true && ctl.paidAmount) store.noteCaught(run, `x:${toPaise(ctl.paidAmount)}`, ctl.label, toPaise(ctl.paidAmount), false);
    }
    for (const row of body.bill?.rows ?? []) {
      if ((row.kind === 'service' || row.kind === 'membership') && row.amount) store.noteCaught(run, `x:${toPaise(row.amount)}`, row.label, toPaise(row.amount), true);
    }
    store.audit(run, 'sensor', 'observed', { stage: added.current.stage, url: body.url, findings: findings.map((f) => f.ruleId) });

    if (run.state !== 'shopping') return c.json({ findings, plan: null, state: run.state });
    if (run.plannerCalls >= MAX_PLANNER_CALLS) {
      store.fail(run, 'server', `The agent reached its limit of ${MAX_PLANNER_CALLS} planning steps.`);
      return c.json({ findings, plan: null, state: run.state, error: run.error });
    }
    run.plannerCalls += 1;
    const brief = buildBrief({ mandate: run.mandate, snapshot: added.current, findings, lastGuard: run.lastGuard });
    // Once the AI planner has failed in a run, the backup planner finishes it: no repeated timeouts.
    let plan: Plan;
    let plannerError: string | undefined;
    const ai = run.planner === 'ai' ? await planWithRetry(deps.provider, buildMessages(brief, run.history), added.current) : null;
    if (ai?.ok) {
      plan = ai.plan;
    } else {
      plannerError = ai && !ai.ok ? ai.error : undefined;
      if (run.planner === 'ai') store.audit(run, 'planner', 'backup_planner', { error: plannerError });
      run.planner = 'backup';
      const backup = validatePlan(backupPlan(brief), added.current);
      if (!backup.ok) {
        store.fail(run, 'planner', backup.error);
        return c.json({ findings, plan: null, state: run.state, error: run.error });
      }
      plan = backup.plan;
    }
    for (const a of plan.actions) run.history.push(`${a.tool}${'controlId' in a ? ` ${a.controlId}` : ''}: ${a.explanation}`);
    store.audit(run, 'planner', 'planned', { planner: run.planner, actions: plan.actions });
    const stop = plan.actions.find((a) => a.tool === 'stop');
    if (stop && stop.tool === 'stop') store.transition(run, 'stopped', 'planner', 'stopped', { reason: stop.reason });
    return c.json({ findings, plan, planner: run.planner, state: run.state, ...(plannerError ? { plannerError } : {}) });
  });

  app.post('/:id/checkout', (c) => {
    const run = store.get(c.req.param('id'));
    if (!run) return c.json({ error: 'run_expired' }, 404);
    store.require(run, 'shopping');
    if (!run.last) return c.json({ error: 'nothing_observed' }, 400);

    const result = guard({ mandate: run.mandate, snapshot: run.last.snapshot, bill: run.last.bill, findings: run.last.findings, runId: run.id, now: deps.now(), secret: deps.secret });
    if (result.verdict === 'BLOCK') {
      run.lastGuard = result.reasons;
      for (const r of result.reasons) if (r.code === 'UNEXPLAINED_AMOUNT' && r.paise) store.noteCaught(run, 'unexplained', 'Unexplained amount in the total', r.paise, true);
      run.history.push(`The checker blocked payment: ${result.reasons.map((r) => r.label).join('; ')}.`);
      const fixable = result.reasons.some((r) => r.fixable);
      if (fixable) store.audit(run, 'guard', 'blocked', { reasons: result.reasons });
      else store.transition(run, 'awaiting_human', 'guard', 'blocked', { reasons: result.reasons });
      return c.json({ verdict: 'BLOCK', reasons: result.reasons, state: run.state });
    }
    run.lastGuard = null;
    run.authorization = result.authorization;
    store.transition(run, 'authorized', 'guard', 'passed', { authorizationId: result.authorization.id, totalPaise: result.authorization.totalPaise });
    return c.json({ verdict: 'PASS', authorization: result.authorization, state: run.state });
  });

  app.post('/:id/amend', async (c) => {
    const run = store.get(c.req.param('id'));
    if (!run) return c.json({ error: 'run_expired' }, 404);
    store.require(run, 'awaiting_human');
    const body = Amend.parse(await c.req.json());
    if ('stop' in body) {
      store.transition(run, 'stopped', 'human', 'stopped');
      return c.json({ state: run.state });
    }
    const raised = (run.lastGuard ?? []).filter((r) => r.code === 'FEE_NOT_ALLOWED');
    const notRaised = body.approved.filter((a) => !raised.some((r) => r.subject === a.label && r.paise === a.paise));
    if (notRaised.length) return c.json({ error: 'not_raised', labels: notRaised.map((a) => a.label) }, 400);

    run.mandate = amendMandate(run.mandate, body.approved, deps.now().toISOString());
    run.lastGuard = null;
    run.history.push(`The user approved: ${body.approved.map((a) => `${a.label} ${formatInr(a.paise)}`).join(', ')}. Request checkout again.`);
    store.transition(run, 'shopping', 'human', 'amended', { version: run.mandate.version, approved: body.approved });
    return c.json({ state: run.state, mandateVersion: run.mandate.version });
  });

  return app;
}
