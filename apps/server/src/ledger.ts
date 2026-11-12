import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The payments ledger behind "Merchant fairness", kept on disk so it survives restarts and
 * deploys (on Render, a persistent disk mounted at DATA_DIR). Rows are what the receipt says,
 * never PayPal credentials or personal data.
 */
export interface StoredRow {
  runId: string;
  at: string | null;
  [key: string]: unknown;
}

const MAX_ROWS = 500;

export class LedgerBook {
  private rows = new Map<string, StoredRow>();
  private readonly file: string | null;

  constructor(dir: string | null) {
    let file = dir ? join(dir, 'ledger.json') : null;
    if (file) {
      try {
        mkdirSync(dir!, { recursive: true });
      } catch {
        console.warn(`Ledger folder ${dir} is not writable: keeping the ledger in memory only.`);
        file = null;
      }
    }
    this.file = file;
    if (!this.file) return;
    try {
      const saved = JSON.parse(readFileSync(this.file, 'utf8')) as StoredRow[];
      for (const r of saved) if (r && typeof r.runId === 'string') this.rows.set(r.runId, r);
    } catch {
      /* first boot, or an unreadable file: start empty */
    }
  }

  /** Add or replace a run's row (a capture is later settled by the webhook, for example). */
  upsert(row: StoredRow) {
    this.rows.delete(row.runId);
    this.rows.set(row.runId, row);
    while (this.rows.size > MAX_ROWS) this.rows.delete(this.rows.keys().next().value!);
    this.save();
  }

  /** Where the ledger is kept: a file path, or null when it lives in memory only. */
  get where(): string | null {
    return this.file;
  }

  /** Newest first. */
  list(): StoredRow[] {
    return [...this.rows.values()].reverse();
  }

  private save() {
    if (!this.file) return;
    try {
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify([...this.rows.values()]));
      renameSync(tmp, this.file);
    } catch (e) {
      console.warn('Could not save the ledger:', e instanceof Error ? e.message : e);
    }
  }
}
