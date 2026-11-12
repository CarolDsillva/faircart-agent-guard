import { addSnapshot, addTap } from '@faircart/adapters';
import { backupPlan, buildBrief, buildMessages, planWithRetry, validatePlan, type LLMProvider, type Plan } from '@faircart/agent-core';
import { amendMandate, Approval, guard, Mandate } from '@faircart/guard';
import { formatMoney, toPaise } from '@faircart/money';
import { CORE, evaluate } from '@faircart/rules';
import { FeeKind, ScreenSnapshot, TapEvent } from '@faircart/schemas';
import { Hono } from 'hono';
import { z } from 'zod';
import { MAX_PLANNER_CALLS, MAX_TURNS, type Run, type RunStore } from '../runs';

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

const CreateRun = z.object({ mandate: Mandate.pick({ want: true, maxTotalPaise: true, allowedFees: true, feeCapsPaise: true, autopay: true, currency: true }), demo: z.boolean().optional() });
const Observe = z.object({
  seq: z.number().int(),
  pageId: z.string().min(1).max(200),
  url: z.string().url(),
  snapshot: z.unknown(),
  bill: Bill.nullable(),
  taps: z.array(TapEvent).max(50).optional(),
  plan: z.boolean().optional(),
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
    paidBy: run.paidBy ?? null,
    walletLinked: !!run.wallet,
    receipt: receipt(run),
    audit: run.audit,
  };
}

const STORE_NAMES: Record<string, string> = { fairmart: 'FairMart', skyhop: 'SkyHop' };

/** The page offers "Remove <first word of the line>". */
function removable(controls: { label: string }[], label: string): boolean {
  const first = label.toLowerCase().split(/[^a-z0-9]+/)[0] ?? '';
  return first.length > 2 && controls.some((c) => /^remove\b/i.test(c.label) && c.label.toLowerCase().includes(first));
}

/** "Add 1-year freshness protection for ₹49" → "1-year freshness protection". */
function addOnName(label: string): string {
  return label.replace(/^\s*(add|include|get)\s+/i, '').replace(/\s+(for|at|@)\s+(?:₹|\$)\s?[\d,.]+\s*$/i, '').trim() || label;
}

/** "DemoMart tried ₹471. You paid ₹313." */
function receipt(run: Run) {
  const caught = [...run.caught.values()].map(({ label, paise }) => ({ label, paise }));
  const base = run.authorization?.totalPaise ?? run.lastCheckoutPaise;
  const tried = base + caught.reduce((s, c) => s + c.paise, 0);
  const paid = run.authorization?.totalPaise ?? null;
  return {
    triedPaise: tried,
    savedPaise: paid === null ? null : tried - paid,
    intentMandateId: `IM-${run.id.slice(0, 6).toUpperCase()}-v${run.mandate.version}`,
    cartMandateId: run.authorization ? `CM-${run.authorization.id.slice(0, 6).toUpperCase()}` : null,
    paidBy: run.paidBy ?? null,
    autopay: run.mandate.autopay,
    walletLinked: !!run.wallet,
    caught,
    approved: run.mandate.amendments.flatMap((a) => a.approved.map(({ label, paise }) => ({ label, paise }))),
    paidPaise: paid,
    paidUsdCents: run.authorization?.totalUsdCents ?? null,
    inrPerUsd: run.authorization?.rate.inrPerUsd ?? null,
  };
}

/** One row of the payments ledger: a finished run, as the receipt tells it. */
export function ledgerRow(run: Run) {
  const r = receipt(run);
  return {
    runId: run.id,
    at: run.audit.at(-1)?.at ?? null,
    store: run.store ?? null,
    // A demo run's payment is simulated: never shown as paid by PayPal.
    state: run.demo ? ('demo' as const) : run.state,
    demo: !!run.demo,
    planner: run.planner,
    triedPaise: r.triedPaise,
    paidPaise: r.paidPaise,
    savedPaise: r.savedPaise,
    paidUsdCents: r.paidUsdCents,
    paidBy: r.paidBy,
    approved: r.approved,
    caught: [...run.caught.values()].map(({ label, paise, pattern }) => ({ label, paise, pattern })),
    intentMandateId: r.intentMandateId,
    cartMandateId: r.cartMandateId,
    orderId: run.orderId ?? null,
    error: run.error ?? null,
  };
}

const Peek = z.object({ url: z.string().url(), snapshot: z.unknown() });

/** "Scan this page": PennyWise's findings for one page, with no run, no mandate and no AI. */
export function peek(raw: unknown) {
  const body = Peek.parse(raw);
  const snapshot = ScreenSnapshot.parse({ ...(body.snapshot as object), journeyId: 'peek' });
  return evaluate({ snapshot, journey: [], taps: [] }, CORE).findings;
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
    if (body.demo) run.demo = true;
    return c.json({ runId: run.id, state: run.state });
  });

  /** The product demo's last step: its PayPal payment is simulated, so it is recorded as a demo. */
  app.post('/:id/demo-done', (c) => {
    const run = store.get(c.req.param('id'));
    if (!run) return c.json({ error: 'run_expired' }, 404);
    if (!run.demo) return c.json({ error: 'not_a_demo' }, 403);
    store.require(run, 'authorized');
    store.finishDemo(run);
    return c.json({ ok: true });
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
    // Findings use the journey (what was shown earlier on this page counts); planning and checking use the live page.
    const { findings } = evaluate({ snapshot: added.current, journey: added.earlier, taps: journey.taps }, CORE);
    run.last = { snapshot: snap, bill: body.bill, findings };
    run.store = STORE_NAMES[new URL(body.url).searchParams.get('store') ?? ''] ?? 'DemoMart';
    if (added.current.stage === 'checkout' && body.bill?.displayedTotal != null) run.lastCheckoutPaise = toPaise(body.bill.displayedTotal);
    for (const ctl of snap.controls) {
      if (ctl.role === 'add_on' && ctl.checked === true && ctl.paidAmount) store.noteCaught(run, `x:${toPaise(ctl.paidAmount)}`, addOnName(ctl.label), toPaise(ctl.paidAmount), false, 'Pre-ticked add-on');
    }
    for (const row of body.bill?.rows ?? []) {
      if ((row.kind === 'service' || row.kind === 'membership') && row.amount) store.noteCaught(run, `x:${toPaise(row.amount)}`, row.label, toPaise(row.amount), true, 'Added without your choice');
      // A fee the store lets you remove is an add-on in disguise (a seat "fee" you never picked).
      else if (row.kind === 'fee' && row.amount && removable(snap.controls, row.label)) store.noteCaught(run, `x:${toPaise(row.amount)}`, row.label, toPaise(row.amount), true, 'Added without your choice');
    }
    // For the receipt only (the checker re-adds the bill itself): an amount no line explains.
    if (snap.stage === 'checkout' && body.bill?.difference && body.bill.difference > 0) {
      store.noteCaught(run, 'unexplained', 'Unexplained amount in the total', toPaise(body.bill.difference), true, 'Unexplained amount');
    }
    store.audit(run, 'sensor', 'observed', { stage: added.current.stage, url: body.url, findings: findings.map((f) => f.ruleId) });

    // A fresh reading for the checker only: no plan wanted.
    if (body.plan === false || run.state !== 'shopping') return c.json({ findings, plan: null, state: run.state });
    run.turns += 1;
    if (run.turns > MAX_TURNS || (run.planner === 'ai' && run.plannerCalls >= MAX_PLANNER_CALLS)) {
      store.fail(run, 'server', `The agent reached its limit of ${run.turns > MAX_TURNS ? MAX_TURNS : MAX_PLANNER_CALLS} planning steps.`);
      return c.json({ findings, plan: null, state: run.state, error: run.error });
    }
    if (run.planner === 'ai') run.plannerCalls += 1;
    const brief = buildBrief({ mandate: run.mandate, snapshot: snap, findings, lastGuard: run.lastGuard });
    // If the AI can't be reached, the backup planner finishes the run (no repeated timeouts).
    // If it only returned a bad plan, the backup planner handles this page and the AI plans the next.
    let plan: Plan;
    let plannedBy: 'ai' | 'backup' = run.planner;
    let plannerError: string | undefined;
    const ai = run.planner === 'ai' ? await planWithRetry(deps.provider, buildMessages(brief, run.history), snap, run.lastGuard) : null;
    if (ai?.ok) {
      plan = ai.plan;
    } else {
      plannerError = ai && !ai.ok ? ai.error : undefined;
      if (run.planner === 'ai') store.audit(run, 'planner', 'backup_planner', { error: plannerError });
      if (plannerError?.startsWith('The planner could not be reached')) run.planner = 'backup';
      plannedBy = 'backup';
      const backup = validatePlan(backupPlan(brief), snap, run.lastGuard);
      if (!backup.ok) {
        store.fail(run, 'planner', backup.error);
        return c.json({ findings, plan: null, state: run.state, error: run.error });
      }
      plan = backup.plan;
    }
    for (const a of plan.actions) run.history.push(`${a.tool}${'controlId' in a ? ` ${a.controlId}` : ''}: ${a.explanation}`);
    store.audit(run, 'planner', 'planned', { planner: plannedBy, actions: plan.actions });
    const stop = plan.actions.find((a) => a.tool === 'stop');
    const ask = plan.actions.find((a) => a.tool === 'ask_user');
    if (stop && stop.tool === 'stop') store.transition(run, 'stopped', 'planner', 'stopped', { reason: stop.reason });
    // The agent can only ask; the run waits for the human's answer.
    else if (ask && ask.tool === 'ask_user') store.transition(run, 'awaiting_human', 'planner', 'asked', { question: ask.question });
    return c.json({ findings, plan, planner: plannedBy, state: run.state, ...(plannerError ? { plannerError } : {}) });
  });

  app.post('/:id/checkout', (c) => {
    const run = store.get(c.req.param('id'));
    if (!run) return c.json({ error: 'run_expired' }, 404);
    store.require(run, 'shopping');
    if (!run.last) return c.json({ error: 'nothing_observed' }, 400);

    const result = guard({ mandate: run.mandate, snapshot: run.last.snapshot, bill: run.last.bill, findings: run.last.findings, runId: run.id, now: deps.now(), secret: deps.secret });
    if (result.verdict === 'BLOCK') {
      run.lastGuard = result.reasons;
      for (const r of result.reasons) if (r.code === 'UNEXPLAINED_AMOUNT' && r.paise) store.noteCaught(run, 'unexplained', 'Unexplained amount in the total', r.paise, true, 'Unexplained amount');
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
    // Keep what the human didn't answer (an amount to question with the store) so the agent goes straight to it.
    const rest = (run.lastGuard ?? []).filter((r) => !(r.code === 'FEE_NOT_ALLOWED' && body.approved.some((a) => a.label === r.subject && a.paise === r.paise)));
    run.lastGuard = rest.length ? rest : null;
    run.history.push(`The user approved: ${body.approved.map((a) => `${a.label} ${formatMoney(a.paise, run.mandate.currency)}`).join(', ')}. Request checkout again.`);
    store.transition(run, 'shopping', 'human', 'amended', { version: run.mandate.version, approved: body.approved });
    return c.json({ state: run.state, mandateVersion: run.mandate.version });
  });

  return app;
}
