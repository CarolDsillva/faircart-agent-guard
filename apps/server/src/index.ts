import { serve } from '@hono/node-server';
import type { LLMProvider } from '@faircart/agent-core';
import { createApp } from './app';
import { loadDotEnv, readConfig } from './env';
import { RunStore } from './runs';

loadDotEnv();
const cfg = readConfig();

const noPlanner: LLMProvider = {
  plan: async () => {
    throw new Error('No AI planner is configured (set LLM_PROVIDER and LLM_API_KEY).');
  },
};

const app = createApp({
  store: new RunStore(),
  provider: cfg.provider ?? noPlanner,
  secret: cfg.secret,
  now: () => new Date(),
  paypal: cfg.paypal,
  paypalConfig: cfg.paypalConfig,
});

serve({ fetch: app.fetch, port: cfg.port }, (info) => {
  console.log(`FairCart Agent Guard on http://localhost:${info.port} (planner: ${cfg.providerName}, PayPal: ${cfg.paypalConfig.mode})`);
});
