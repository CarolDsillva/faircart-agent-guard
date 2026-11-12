import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import type { LLMProvider } from '@faircart/agent-core';
import { createApp } from './app';
import { LedgerBook } from './ledger';
import { ledgerRow } from './routes/runs';
import { loadDotEnv, readConfig } from './env';
import { RunStore } from './runs';

loadDotEnv();
const cfg = readConfig();

const noPlanner: LLMProvider = {
  plan: async () => {
    throw new Error('No AI planner is configured (set LLM_PROVIDER and LLM_API_KEY).');
  },
};

// The ledger lives on disk (a Render persistent disk at DATA_DIR in production), so restarts keep it.
const book = new LedgerBook(process.env.DATA_DIR ?? './data');
const store = new RunStore();
store.onFinish = (run) => book.upsert(ledgerRow(run));

const app = createApp({
  store,
  book,
  provider: cfg.provider ?? noPlanner,
  secret: cfg.secret,
  now: () => new Date(),
  paypal: cfg.paypal,
  paypalConfig: cfg.paypalConfig,
});

// In production the built console and practice stores are served by this same service.
const dist = fileURLToPath(new URL('../../web/dist', import.meta.url));
if (existsSync(dist)) {
  app.use('/*', serveStatic({ root: dist }));
  app.get('/shop', serveStatic({ path: `${dist}/shop.html` }));
}

serve({ fetch: app.fetch, port: cfg.port }, (info) => {
  console.log(`PennyWise on http://localhost:${info.port} (planner: ${cfg.providerName}, PayPal: ${cfg.paypalConfig.mode})`);
});
