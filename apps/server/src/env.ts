import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { LLMProvider } from '@faircart/agent-core';
import { DEFAULT_GEMINI_MODEL, GeminiProvider } from './llm/gemini';
import { PayPalSdk } from './paypal/sdk';
import { MockPayPal } from './paypal/mock';
import type { PayPal, PayPalConfig } from './paypal/types';

/** The repo root's .env, when present (local dev). Render passes real env vars. */
export function loadDotEnv() {
  const file = fileURLToPath(new URL('../../../.env', import.meta.url));
  if (existsSync(file)) process.loadEnvFile(file);
}

export interface Config {
  port: number;
  secret: string;
  paypal: PayPal;
  paypalConfig: PayPalConfig;
  provider: LLMProvider | null;
  providerName: string;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const secret = env.AUTHZ_HMAC_SECRET ?? '';
  if (secret.length < 16) throw new Error('AUTHZ_HMAC_SECRET must be set to a long random string');

  let sandbox = env.PAYPAL_MODE === 'sandbox';
  if (sandbox && (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET)) {
    // Never fail to start for judges: run with simulated PayPal, which the UI labels as such.
    console.warn('PAYPAL_MODE=sandbox but PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET is missing: using simulated PayPal.');
    sandbox = false;
  }
  const paypal = sandbox
    ? new PayPalSdk({ clientId: env.PAYPAL_CLIENT_ID!, clientSecret: env.PAYPAL_CLIENT_SECRET!, webhookId: env.PAYPAL_WEBHOOK_ID ?? '' })
    : new MockPayPal();

  const name = env.LLM_PROVIDER ?? 'scripted';
  const provider = name === 'gemini' && env.LLM_API_KEY ? new GeminiProvider({ apiKey: env.LLM_API_KEY, model: env.LLM_MODEL || DEFAULT_GEMINI_MODEL }) : null;

  return {
    port: Number(env.PORT) || 8787,
    secret,
    paypal,
    paypalConfig: { clientId: sandbox ? env.PAYPAL_CLIENT_ID! : 'mock', mode: sandbox ? 'sandbox' : 'mock' },
    provider,
    providerName: provider ? name : 'none',
  };
}
