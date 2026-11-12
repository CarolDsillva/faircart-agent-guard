import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { ZodError } from 'zod';
import { merchantRoutes, type MerchantDeps } from './routes/merchant';
import { ledgerRow, peek, runRoutes, type RunDeps } from './routes/runs';
import type { LedgerBook } from './ledger';
import { BadState } from './runs';

export type AppDeps = RunDeps & Pick<MerchantDeps, 'paypal' | 'paypalConfig'> & { book?: LedgerBook };

export function createApp(deps: AppDeps) {
  const app = new Hono();
  app.use('*', bodyLimit({ maxSize: 256 * 1024, onError: (c) => c.json({ error: 'too_large' }, 413) }));
  app.onError((err, c) => {
    if (err instanceof BadState) return c.json({ error: 'bad_state', state: err.state }, 409);
    if (err instanceof ZodError) return c.json({ error: 'bad_request', issues: err.issues.slice(0, 5) }, 400);
    if (err instanceof SyntaxError) return c.json({ error: 'bad_json' }, 400);
    console.error(err);
    return c.json({ error: 'server_error', message: err instanceof Error ? err.message.slice(0, 200) : 'unknown' }, 500);
  });
  app.get('/healthz', (c) => c.json({ ok: true, ledger: deps.book?.where ?? null }));
  app.route('/api/runs', runRoutes(deps));
  app.post('/api/peek', async (c) => c.json({ findings: peek(await c.req.json()) }));
  app.get('/api/ledger', (c) => c.json({ rows: deps.book ? deps.book.list() : deps.store.ledger().map(ledgerRow) }));
  app.route('/', merchantRoutes(deps));
  return app;
}
