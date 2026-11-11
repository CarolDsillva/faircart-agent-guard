import type { Action } from '@faircart/agent-core';
import type { Approval, Authorization, Reason } from '@faircart/guard';
import type { Finding, TapEvent } from '@faircart/schemas';
import { useCallback, useRef, useState } from 'react';
import { api, ApiError, type RunView } from './api';
import { runAction } from './driver';
import { mark, pointAt, type MarkTone } from './overlay';
import { observeDocument, whenQuiet, type Observation } from './sensor';

export type Store = 'demomart' | 'fairmart';
export type Phase = 'idle' | 'linking' | 'running' | 'awaiting' | 'authorized' | 'paying' | 'paid' | 'stopped' | 'failed';

export interface Entry {
  id: number;
  at: Date;
  kind: 'action' | 'guard' | 'human' | 'note' | 'pay';
  title: string;
  detail?: string;
  tone?: 'pass' | 'block' | 'warn' | 'stale';
}

export interface MandateInput {
  maxTotalRupees: number;
  allowedFees: string[];
  /** Let the agent pay on its own with a linked PayPal, inside the signed rules. */
  autopay: boolean;
}

export const intentMandateId = (runId: string, version = 1) => `IM-${runId.slice(0, 6).toUpperCase()}-v${version}`;
export const cartMandateId = (authorizationId: string) => `CM-${authorizationId.slice(0, 6).toUpperCase()}`;

/** Wait for the wallet pop-up to report back (or be closed). */
function walletReply(popup: Window | null): Promise<{ approvalTokenId: string | null; cancelled: boolean }> {
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.data?.type !== 'faircart-wallet') return;
      cleanup();
      resolve({ approvalTokenId: e.data.approvalTokenId ?? null, cancelled: !!e.data.cancelled });
    };
    const closed = window.setInterval(() => {
      if (popup?.closed) {
        cleanup();
        reject(new Error('The PayPal window was closed before linking finished.'));
      }
    }, 600);
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      window.clearInterval(closed);
    };
    window.addEventListener('message', onMessage);
  });
}

export const PRODUCT = { sku: 'DEMO-ATTA-5KG', title: 'Sunrise Chakki Atta 5 kg', price: 289 };

const PACE_MS = 500;
const MONEY = new Set(['basket_sneaking', 'drip_pricing', 'subscription_trap', 'forced_action']);

/** FairCart's findings, drawn on the page where it found them. */
function showFindings(obs: Observation, findings: Finding[]) {
  const doc = obs.refs && findings.length ? findings.map((f) => (f.elementRef ? obs.refs.get(f.elementRef) : undefined)).find(Boolean)?.ownerDocument : undefined;
  if (!doc) return;
  mark(
    doc,
    'findings',
    findings.flatMap((f) => {
      const el = f.elementRef ? obs.refs.get(f.elementRef) : undefined;
      return el ? [{ el, label: f.title, tone: (MONEY.has(f.category) ? 'money' : 'manipulation') as MarkTone }] : [];
    }),
  );
}

/** The checker's verdict, drawn on the bill lines it is about. */
function showVerdict(obs: Observation, reasons: Reason[] | null) {
  const rows = obs.bill?.rows ?? [];
  const el = (ref: string | undefined) => (ref ? obs.refs.get(ref) : undefined);
  const doc = rows.map((r) => el(r.elRef)).find(Boolean)?.ownerDocument;
  if (!doc) return;
  if (!reasons) {
    const total = rows.find((r) => r.kind === 'total');
    const t = el(total?.elRef);
    mark(doc, 'verdict', t ? [{ el: t, label: 'Matches your mandate', tone: 'ok' }] : []);
    return;
  }
  const items: { el: Element; label: string; tone: MarkTone }[] = [];
  for (const r of reasons) {
    if (r.subject) {
      const row = rows.find((x) => x.label === r.subject);
      const e = el(row?.elRef);
      if (e) items.push({ el: e, label: r.code === 'FEE_NOT_ALLOWED' ? 'Fee not in your mandate' : 'Not what you asked for', tone: 'blocked' });
    } else if (r.code === 'UNEXPLAINED_AMOUNT') {
      const e = el(rows.find((x) => x.kind === 'total')?.elRef);
      if (e) items.push({ el: e, label: `${r.paise ? `₹${r.paise / 100} ` : ''}nobody explains`, tone: 'blocked' });
    }
  }
  mark(doc, 'verdict', items);
}
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
  const [autopay, setAutopay] = useState(false);
  const [walletLinked, setWalletLinked] = useState(false);
  /** Set when the browser blocked the PayPal pop-up: the UI offers a plain link instead. */
  const [walletUrl, setWalletUrl] = useState<string | null>(null);

  const seq = useRef(0);
  const pageCount = useRef(0);
  const taps = useRef<TapEvent[]>([]);
  /** Each run loop has a generation; starting, stopping or resetting bumps it so stale loops end. */
  const generation = useRef(0);
  const approving = useRef(false);
  const idRef = useRef(0);

  const push = useCallback((e: Omit<Entry, 'id' | 'at'>) => setEntries((xs) => [...xs, { ...e, id: ++idRef.current, at: new Date() }]), []);
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
          showFindings(obs, res.findings);
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
              const checked = await observe();
              await api.observe(id, checked, taps.current.splice(0), false);
              const g = await api.checkout(id);
              showVerdict(checked, g.verdict === 'PASS' ? null : g.reasons);
              if (g.verdict === 'PASS') {
                setReasons([]);
                setAuthorization(g.authorization);
                push({ kind: 'guard', title: `Checker passed and signed cart mandate ${cartMandateId(g.authorization.id)}.`, detail: 'Every rupee matches your intent mandate.', tone: 'pass' });
                if (autopayRef.current) {
                  await payAsAgent(id, g.authorization);
                  return;
                }
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
            const r = await runAction(action, { observe, waitForNavigation, point: (el) => pointAt(el) });
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

  const autopayRef = useRef(false);

  /** Human-not-present payment: DemoMart holds the money, FairCart checks the order, then it is captured. */
  const payAsAgent = async (id: string, authz: Authorization) => {
    setPhase('paying');
    push({ kind: 'pay', title: 'Your agent is paying with your linked PayPal. No pop-up: the signed mandates allow it.' });
    const v = await api.agentPay(authz);
    setView(v);
    push({ kind: 'pay', title: `PayPal held, FairCart checked the order line by line, then captured US$${v.capture?.amount}.`, detail: `Order ${v.orderId} · Capture ${v.capture?.id}`, tone: 'pass' });
    setPhase('paid');
    const gen = generation.current;
    for (let i = 0; i < 10; i++) {
      await sleep(3000);
      if (gen !== generation.current) return;
      const fresh = await api.run(id).catch(() => null);
      if (!fresh) return;
      setView(fresh);
      if (fresh.state === 'settled') return;
    }
  };

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
    setAutopay(false);
    setWalletLinked(false);
    setWalletUrl(null);
    autopayRef.current = false;
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
          autopay: m.autopay,
        });
        setRunId(id);
        setAutopay(m.autopay);
        autopayRef.current = m.autopay;
        push({
          kind: 'human',
          title: `You signed intent mandate ${intentMandateId(id)}.`,
          detail: `${PRODUCT.title}, at most ₹${m.maxTotalRupees}, fees allowed: ${m.allowedFees.join(', ') || 'none'}. ${m.autopay ? 'The agent may pay on its own inside these rules.' : 'You approve the payment in PayPal.'}`,
        });
        if (m.autopay) {
          setPhase('linking');
          return;
        }
        await drive(id);
      } catch (e) {
        fail(e);
      }
    },
    [drive, fail, push],
  );

  /**
   * Link PayPal once for this mandate. In sandbox, PayPal's approval page opens in a pop-up (from the click,
   * so it isn't blocked); if the browser blocks it anyway, the UI shows a link to open it. Simulated mode
   * needs no PayPal page at all.
   */
  const linkWallet = useCallback(
    async (simulated: boolean) => {
      if (!runId) return;
      const popup = simulated ? null : window.open('', 'faircart-wallet', 'width=480,height=720');
      try {
        const { setupTokenId, approveUrl } = await api.walletSetup(runId, `${location.origin}/wallet-return.html`);
        if (!simulated) {
          if (popup) popup.location.href = approveUrl;
          else setWalletUrl(approveUrl);
          const reply = await walletReply(popup);
          if (reply.cancelled) throw new Error('PayPal was not linked. Start a new run to retry, or untick autopay.');
        }
        setWalletUrl(null);
        await api.walletConfirm(runId, setupTokenId);
        setWalletLinked(true);
        push({ kind: 'human', title: `You linked PayPal for this mandate${simulated ? ' (simulated)' : ''}.`, detail: 'The agent can pay with it only inside your signed rules. You were not charged.' });
        await drive(runId);
      } catch (e) {
        popup?.close();
        fail(e);
      }
    },
    [drive, fail, push, runId],
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

  return { autopay, walletLinked, walletUrl, linkWallet, phase, runId, entries, findings, reasons, authorization, planner, view, error, store, onFrameLoad, reset, start, approve, stop, createOrder, captured, payFailed, payCancelled };
}
