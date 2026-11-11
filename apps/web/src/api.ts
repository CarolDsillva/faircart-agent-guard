import type { Action, Plan } from '@faircart/agent-core';
import type { Approval, Authorization, Mandate, Reason } from '@faircart/guard';
import type { Finding, TapEvent } from '@faircart/schemas';
import type { Observation } from './sensor';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: { error?: string; message?: string; reasons?: Reason[] },
  ) {
    super(body.message ?? body.error ?? `HTTP ${status}`);
  }
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json);
  return json as T;
}

export type RunState = 'shopping' | 'awaiting_human' | 'authorized' | 'order_verified' | 'captured' | 'settled' | 'stopped' | 'failed';

export interface ObserveResult {
  findings: Finding[];
  plan: Plan | null;
  planner?: 'ai' | 'backup';
  plannerError?: string;
  state: RunState;
  error?: string;
}

export type GuardResult = { verdict: 'PASS'; authorization: Authorization; state: RunState } | { verdict: 'BLOCK'; reasons: Reason[]; state: RunState };

export interface Receipt {
  triedPaise: number;
  savedPaise: number | null;
  intentMandateId: string;
  cartMandateId: string | null;
  paidBy: 'buyer' | 'agent' | null;
  autopay: boolean;
  walletLinked: boolean;
  caught: { label: string; paise: number }[];
  approved: { label: string; paise: number }[];
  paidPaise: number | null;
  paidUsdCents: number | null;
  inrPerUsd: number | null;
}

export interface RunView {
  runId: string;
  state: RunState;
  mandate: Mandate;
  error: string | null;
  planner: 'ai' | 'backup';
  authorization: Authorization | null;
  orderId: string | null;
  capture: { id: string; status: string; amount: string } | null;
  receipt: Receipt;
}

export interface LedgerRow {
  runId: string;
  at: string | null;
  store: string | null;
  state: RunState;
  planner: 'ai' | 'backup';
  triedPaise: number;
  paidPaise: number | null;
  savedPaise: number | null;
  paidUsdCents: number | null;
  paidBy: 'buyer' | 'agent' | null;
  approved: { label: string; paise: number }[];
  caught: { label: string; paise: number; pattern: string }[];
  intentMandateId: string;
  cartMandateId: string | null;
  orderId: string | null;
  error: string | null;
}

export interface Config {
  paypalClientId: string;
  paypalMode: 'mock' | 'sandbox';
  inrPerUsd: number;
}

export const api = {
  config: () => call<Config>('GET', '/api/config'),
  createRun: (mandate: Pick<Mandate, 'want' | 'maxTotalPaise' | 'allowedFees' | 'autopay'>) => call<{ runId: string; state: RunState }>('POST', '/api/runs', { mandate }),
  observe: (runId: string, o: Observation, taps: TapEvent[], plan = true) =>
    call<ObserveResult>('POST', `/api/runs/${runId}/observe`, { seq: o.seq, pageId: o.pageId, url: o.url, snapshot: o.snapshot, bill: o.bill, taps, plan }),
  checkout: (runId: string) => call<GuardResult>('POST', `/api/runs/${runId}/checkout`),
  amend: (runId: string, approved: Approval[]) => call<{ state: RunState; mandateVersion: number }>('POST', `/api/runs/${runId}/amend`, { approved }),
  stop: (runId: string) => call<{ state: RunState }>('POST', `/api/runs/${runId}/amend`, { stop: true }),
  run: (runId: string) => call<RunView>('GET', `/api/runs/${runId}`),
  ledger: () => call<{ rows: LedgerRow[] }>('GET', '/api/ledger'),
  merchantCheckout: (authorization: Authorization) => call<{ orderId: string; state: RunState }>('POST', '/shop/api/checkout', { authorization }),
  capture: (runId: string, orderId: string) => call<RunView>('POST', '/shop/api/capture', { runId, orderId }),
  walletSetup: (runId: string, returnUrl: string) => call<{ setupTokenId: string; approveUrl: string }>('POST', `/api/runs/${runId}/wallet/setup`, { returnUrl }),
  walletConfirm: (runId: string, setupTokenId: string) => call<{ linked: true }>('POST', `/api/runs/${runId}/wallet/confirm`, { setupTokenId }),
  agentPay: (authorization: Authorization) => call<RunView>('POST', '/shop/api/agent-pay', { authorization }),
};

export type { Action };
