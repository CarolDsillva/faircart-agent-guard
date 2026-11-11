import type { Bill, Journey } from '@faircart/adapters';
import type { Authorization, Mandate, Reason } from '@faircart/guard';
import type { Finding, ScreenSnapshot } from '@faircart/schemas';

export type RunState = 'shopping' | 'awaiting_human' | 'authorized' | 'order_verified' | 'captured' | 'settled' | 'stopped' | 'failed';
export type Actor = 'human' | 'planner' | 'sensor' | 'guard' | 'merchant' | 'paypal' | 'server';

/** Which states may follow which. Anything else is refused. */
const NEXT: Record<RunState, readonly RunState[]> = {
  shopping: ['shopping', 'awaiting_human', 'authorized', 'stopped', 'failed'],
  awaiting_human: ['shopping', 'stopped', 'failed'],
  authorized: ['order_verified', 'failed'],
  order_verified: ['captured', 'failed'],
  captured: ['settled'],
  settled: [],
  stopped: [],
  failed: [],
};

export interface AuditEntry {
  at: string;
  actor: Actor;
  event: string;
  data?: unknown;
}

export interface Run {
  id: string;
  state: RunState;
  mandate: Mandate;
  journey?: Journey;
  plannerCalls: number;
  /** 'ai' until the AI planner fails once in this run; then the labelled backup planner. */
  planner: 'ai' | 'backup';
  /** One line per thing the agent or the human did, fed back to the planner. */
  history: string[];
  last?: { snapshot: ScreenSnapshot; bill: Bill | null; findings: Finding[] };
  lastGuard: Reason[] | null;
  authorization?: Authorization;
  authzUsed: boolean;
  orderId?: string;
  capture?: { id: string; status: string; amount: string };
  /** The highest total the store showed at checkout: "DemoMart tried ₹471". */
  triedPaise: number;
  error?: string;
  audit: AuditEntry[];
  touchedAt: number;
}

export class BadState extends Error {
  constructor(readonly state: RunState) {
    super(`bad_state:${state}`);
  }
}

export const MAX_PLANNER_CALLS = 8;

/** In-memory runs with a sliding TTL. A restart loses them; the UI offers a new run. */
export class RunStore {
  private runs = new Map<string, Run>();
  constructor(
    private readonly ttlMs = 30 * 60_000,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  create(mandate: Mandate): Run {
    const run: Run = { id: crypto.randomUUID(), state: 'shopping', mandate, plannerCalls: 0, planner: 'ai', history: [], lastGuard: null, authzUsed: false, triedPaise: 0, audit: [], touchedAt: this.clock() };
    this.audit(run, 'human', 'signed', { mandate });
    this.runs.set(run.id, run);
    return run;
  }

  get(id: string): Run | undefined {
    const run = this.runs.get(id);
    if (!run) return undefined;
    if (this.clock() - run.touchedAt > this.ttlMs) {
      this.runs.delete(id);
      return undefined;
    }
    run.touchedAt = this.clock();
    return run;
  }

  /** Find the run an authorization or PayPal invoice belongs to. */
  findByAuthorization(authzId: string): Run | undefined {
    for (const r of this.runs.values()) if (r.authorization?.id === authzId) return r;
    return undefined;
  }

  require(run: Run, ...states: RunState[]) {
    if (!states.includes(run.state)) throw new BadState(run.state);
  }

  transition(run: Run, to: RunState, actor: Actor, event: string, data?: unknown) {
    if (!NEXT[run.state].includes(to)) throw new BadState(run.state);
    run.state = to;
    this.audit(run, actor, event, data);
  }

  fail(run: Run, actor: Actor, error: string) {
    if (run.state === 'failed') return;
    run.error = error;
    if (NEXT[run.state].includes('failed')) this.transition(run, 'failed', actor, 'failed', { error });
  }

  audit(run: Run, actor: Actor, event: string, data?: unknown) {
    run.audit.push({ at: new Date(this.clock()).toISOString(), actor, event, ...(data === undefined ? {} : { data }) });
  }
}
