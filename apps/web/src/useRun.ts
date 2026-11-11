import type { Action } from '@faircart/agent-core';
import type { Approval, Authorization, Reason } from '@faircart/guard';
import type { Finding, TapEvent } from '@faircart/schemas';
import { useCallback, useRef, useState } from 'react';
import { api, ApiError, type RunView } from './api';
import { runAction } from './driver';
import { observeDocument, whenQuiet, type Observation } from './sensor';

export type Store = 'demomart' | 'fairmart';
export type Phase = 'idle' | 'running' | 'awaiting' | 'authorized' | 'paying' | 'paid' | 'stopped' | 'failed';

export interface Entry {
  id: number;
  kind: 'action' | 'guard' | 'human' | 'note' | 'pay';
  title: string;
  detail?: string;
  tone?: 'pass' | 'block' | 'warn' | 'stale';
}

export interface MandateInput {
  maxTotalRupees: number;
  allowedFees: string[];
}

export const PRODUCT = { sku: 'DEMO-ATTA-5KG', title: 'Sunrise Chakki Atta 5 kg', price: 289 };

const PACE_MS = 700;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function describe(a: Action): string {
  switch (a.tool) {
    case 'set_control':
      return `${a.checked ? 'Tick' : 'Untick'} ${a.controlId}`;
    case 'click':
      return `Click ${a.controlId.replace(/^act:/, '').replace(/-/g, ' ')}`;
    case 'dismiss_prompt':
      return 'Decline the pop-up';
    case 'request_checkout':
      return 'Ask the checker before paying';
    case 'ask_user':
      return a.question;
    case 'stop':
      return `Stop: ${a.reason}`;
  }
}

/** The agent run, driven from the browser: observe, plan, act, check, pay. */
export function useRun(frame: React.RefObject<HTMLIFrameElement | null>) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [runId, setRunId] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [authorization, setAuthorization] = useState<Authorization | null>(null);
  const [planner, setPlanner] = useState<'ai' | 'backup' | null>(null);
  const [view, setView] = useState<RunView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [store, setStore] = useState<Store>('demomart');

  const seq = useRef(0);
  const pageCount = useRef(0);
  const taps = useRef<TapEvent[]>([]);
  /** Each run loop has a generation; starting, stopping or resetting bumps it so stale loops end. */
  const generation = useRef(0);
  const approving = useRef(false);
  const idRef = useRef(0);

  const push = useCallback((e: Omit<Entry, 'id'>) => setEntries((xs) => [...xs, { ...e, id: ++idRef.current }]), []);
  const patchLast = useCallback((tone: Entry['tone'], detail?: string) => setEntries((xs) => xs.map((x, i) => (i === xs.length - 1 ? { ...x, tone, ...(detail ? { detail } : {}) } : x))), []);
  const addFindings = useCallback((fs: Finding[]) => setFindings((prev) => [...prev, ...fs.filter((f, i) => !prev.some((p) => p.title === f.title) && fs.findIndex((x) => x.title === f.title) === i)]), []);

  /** Called by the iframe's onLoad. */
  const onFrameLoad = useCallback(() => {
    pageCount.current += 1;
  }, []);

  /** Resolves when the store frame holds a new, fully loaded document (or after 6 s). */
  const waitForNavigation = useCallback(() => {
    const before = frame.current?.contentDocument;
    const started = Date.now();
    return new Promise<void>((resolve) => {
      const tick = () => {
        const doc = frame.current?.contentDocument;
        if ((doc && doc !== before && doc.readyState === 'complete') || Date.now() - started > 6000) resolve();
        else window.setTimeout(tick, 50);
      };
      tick();
    });
  }, [frame]);

  const observe = useCallback(async (): Promise<Observation> => {
    const doc = frame.current?.contentDocument;
    if (!doc) throw new Error('The store page is not loaded.');
    await whenQuiet(doc);
    // Read the URL from the document itself, so the URL and the page always match.
    return observeDocument(doc, doc.URL, `page-${pageCount.current}`, ++seq.current);
  }, [frame]);

  const fail = useCallback((e: unknown) => {
    const expired = e instanceof ApiError && e.body.error === 'run_expired';
    setError(expired ? 'This run has expired (the server may have restarted). Start a new run.' : e instanceof Error ? e.message : String(e));
    setPhase('failed');
  }, []);

  /** Plan and act until the guard passes, a human is needed, or the run ends. */
  const drive = useCallback(
    async (id: string) => {
      const gen = ++generation.current;
      const live = () => gen === generation.current;
      setPhase('running');
      let noticedBackup = false;
      try {
        for (let turn = 0; turn < 16; turn++) {
          if (!live()) return;
          const obs = await observe();
          const res = await api.observe(id, obs, taps.current.splice(0));
          addFindings(res.findings);
          if (res.planner) setPlanner(res.planner);
          if (res.planner === 'backup' && res.plannerError && !noticedBackup) {
            noticedBackup = true;
            push({ kind: 'note', title: 'The AI planner is unavailable, so the backup planner (no AI) is finishing this run.', detail: res.plannerError, tone: 'warn' });
          }
          if (!res.plan) {
            if (res.state === 'failed') fail(res.error ?? 'The run failed.');
            else if (res.state === 'stopped') setPhase('stopped');
            return;
          }

          let replan = false;
          for (const action of res.plan.actions) {
            if (!live()) return;
            await sleep(PACE_MS);
            if (action.tool === 'request_checkout') {
              push({ kind: 'action', title: describe(action), detail: action.explanation });
              // The checker judges the page as it is now, not as it was when the plan was made.
              await api.observe(id, await observe(), taps.current.splice(0), false);
              const g = await api.checkout(id);
              if (g.verdict === 'PASS') {
                setReasons([]);
                setAuthorization(g.authorization);
                push({ kind: 'guard', title: 'Checker passed. Every rupee matches your instructions.', tone: 'pass' });
                setPhase('authorized');
                return;
              }
              setReasons(g.reasons);
              push({ kind: 'guard', title: `Checker blocked payment: ${g.reasons.length} problem${g.reasons.length === 1 ? '' : 's'}`, detail: g.reasons.map((r) => r.label).join(' · '), tone: 'block' });
              if (g.state === 'awaiting_human') {
                setPhase('awaiting');
                return;
              }
              replan = true;
              break;
            }
            if (action.tool === 'stop') {
              push({ kind: 'action', title: describe(action), detail: action.explanation, tone: 'warn' });
              setPhase('stopped');
              return;
            }
            push({ kind: 'action', title: describe(action), detail: action.explanation });
            if (action.tool === 'ask_user') {
              setPhase('awaiting');
              return;
            }
            const r = await runAction(action, { observe, waitForNavigation });
            if (r.tap) taps.current.push(r.tap);
            if (r.result === 'stale') {
              patchLast('stale', 'The page changed, so the agent is looking again.');
              replan = true;
              break;
            }
          }
          if (!replan) continue;
        }
        fail('The agent ran out of steps.');
      } catch (e) {
        if (live()) fail(e);
      }
    },
    [addFindings, fail, observe, patchLast, push, waitForNavigation],
  );

  const reset = useCallback((s: Store) => {
    generation.current += 1;
    setStore(s);
    setPhase('idle');
    setRunId(null);
    setEntries([]);
    setFindings([]);
    setReasons([]);
    setAuthorization(null);
    setPlanner(null);
    setView(null);
    setError(null);
    taps.current = [];
    if (frame.current) frame.current.src = `/shop.html?view=item&reset=1${s === 'fairmart' ? '&store=fairmart' : ''}`;
  }, [frame]);

  const start = useCallback(
    async (m: MandateInput) => {
      setError(null);
      try {
        const { runId: id } = await api.createRun({
          want: { sku: PRODUCT.sku, title: PRODUCT.title, maxQuantity: 1 },
          maxTotalPaise: Math.round(m.maxTotalRupees * 100),
          allowedFees: m.allowedFees as never,
        });
        setRunId(id);
        push({ kind: 'human', title: 'You signed your instructions.', detail: `${PRODUCT.title}, at most ₹${m.maxTotalRupees}, fees allowed: ${m.allowedFees.join(', ') || 'none'}` });
        await drive(id);
      } catch (e) {
        fail(e);
      }
    },
    [drive, fail, push],
  );

  const approve = useCallback(
    async (approved: Approval[]) => {
      if (!runId || approving.current) return;
      approving.current = true;
      try {
        await api.amend(runId, approved);
        push({ kind: 'human', title: `You approved ${approved.map((a) => `${a.label} ₹${a.paise / 100}`).join(' and ')}.`, detail: 'Only you can add charges to your instructions. The agent cannot.' });
        setReasons([]);
        approving.current = false;
        await drive(runId);
      } catch (e) {
        fail(e);
      } finally {
        approving.current = false;
      }
    },
    [drive, fail, push, runId],
  );

  const stop = useCallback(async () => {
    generation.current += 1;
    if (runId && phase === 'awaiting') await api.stop(runId).catch(() => undefined);
    push({ kind: 'human', title: 'You stopped the run. Nothing was paid.' });
    setPhase('stopped');
  }, [phase, push, runId]);

  /** DemoMart creates the PayPal order; FairCart has already compared it line by line. */
  const createOrder = useCallback(async () => {
    if (!authorization) throw new Error('No authorization');
    setPhase('paying');
    const { orderId } = await api.merchantCheckout(authorization);
    push({ kind: 'pay', title: 'PayPal order created by DemoMart and checked by FairCart: it matches what you approved.', detail: `Order ${orderId}`, tone: 'pass' });
    return orderId;
  }, [authorization, push]);

  const captured = useCallback(
    async (orderId: string) => {
      if (!runId) return;
      const v = await api.capture(runId, orderId);
      setView(v);
      push({ kind: 'pay', title: `PayPal captured US$${v.capture?.amount}.`, detail: `Capture ${v.capture?.id}`, tone: 'pass' });
      setPhase('paid');
      // The webhook may settle the payment a few seconds later.
      const gen = generation.current;
      for (let i = 0; i < 10; i++) {
        await sleep(3000);
        if (gen !== generation.current) return;
        const fresh = await api.run(runId).catch(() => null);
        if (!fresh) return;
        setView(fresh);
        if (fresh.state === 'settled') return;
      }
    },
    [push, runId],
  );

  const payFailed = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.body.reasons) setReasons(e.body.reasons);
      fail(e);
    },
    [fail],
  );

  /** The buyer closed PayPal without approving: back to "Ready to pay". */
  const payCancelled = useCallback(() => setPhase('authorized'), []);

  return { phase, runId, entries, findings, reasons, authorization, planner, view, error, store, onFrameLoad, reset, start, approve, stop, createOrder, captured, payFailed, payCancelled };
}
