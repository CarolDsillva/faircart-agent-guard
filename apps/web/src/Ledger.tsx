import { formatInr, formatUsd } from '@faircart/money';
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type GridApi, type ICellRendererParams, type ValueFormatterParams } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type LedgerRow } from './api';

ModuleRegistry.registerModules([AllCommunityModule]);

/** The grid in the console's own colours and type. */
const theme = themeQuartz.withParams({
  fontFamily: 'Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif',
  fontSize: 13.5,
  headerFontWeight: 600,
  foregroundColor: '#141b2b',
  headerTextColor: '#5a6478',
  headerBackgroundColor: '#f4f6f8',
  borderColor: '#e1e5eb',
  rowHoverColor: '#f4f6fd',
  accentColor: '#2443b5',
  wrapperBorderRadius: 10,
  spacing: 7,
});

const inr = (p: ValueFormatterParams) => (p.value === null || p.value === undefined ? '–' : formatInr(p.value as number));
const when = (p: ValueFormatterParams) => (p.value ? new Date(p.value as string).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '');

const STATE: Record<string, { label: string; tone: string }> = {
  captured: { label: 'Paid', tone: 'pass' },
  settled: { label: 'Paid · settled', tone: 'pass' },
  stopped: { label: 'Stopped', tone: 'muted' },
  failed: { label: 'Failed', tone: 'block' },
};

function StateCell(p: ICellRendererParams<LedgerRow>) {
  if (!p.value) return null;
  const s = STATE[p.value as string] ?? { label: String(p.value), tone: 'muted' };
  return <span className={`chip chip--${s.tone}`}>{s.label}</span>;
}

function PaidByCell(p: ICellRendererParams<LedgerRow>) {
  if (!p.value) return <span className="muted">–</span>;
  return <span className={`chip ${p.value === 'agent' ? 'chip--accent' : 'chip--muted'}`}>{p.value === 'agent' ? 'Agent wallet' : 'You, in PayPal'}</span>;
}

interface ChargeRow {
  at: string | null;
  store: string | null;
  pattern: string;
  label: string;
  paise: number;
  runId: string;
}

export function Ledger() {
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runsApi = useRef<GridApi<LedgerRow> | null>(null);

  const load = useCallback(() => {
    api
      .ledger()
      .then((r) => setRows(r.rows))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(load, [load]);

  const charges: ChargeRow[] = useMemo(() => (rows ?? []).flatMap((r) => r.caught.map((c) => ({ at: r.at, store: r.store, runId: r.runId, ...c }))), [rows]);

  const totals = useMemo(() => {
    const paid = (rows ?? []).filter((r) => r.paidPaise !== null);
    return {
      runs: rows?.length ?? 0,
      paidRuns: paid.length,
      tried: paid.reduce((s, r) => s + r.triedPaise, 0),
      paid: paid.reduce((s, r) => s + (r.paidPaise ?? 0), 0),
      saved: paid.reduce((s, r) => s + (r.savedPaise ?? 0), 0),
      blocked: charges.reduce((s, c) => s + c.paise, 0),
      byAgent: paid.filter((r) => r.paidBy === 'agent').length,
    };
  }, [rows, charges]);

  const runCols: ColDef<LedgerRow>[] = useMemo(
    () => [
      { field: 'at', headerName: 'When', valueFormatter: when, sort: 'desc', width: 130 },
      { field: 'store', headerName: 'Store', width: 110, filter: true },
      { field: 'state', headerName: 'Outcome', cellRenderer: StateCell, width: 130, filter: true },
      { field: 'triedPaise', headerName: 'Store tried', valueFormatter: inr, type: 'numericColumn', width: 120 },
      { field: 'paidPaise', headerName: 'Paid', valueFormatter: inr, type: 'numericColumn', width: 100 },
      {
        field: 'savedPaise',
        headerName: 'Saved',
        valueFormatter: inr,
        type: 'numericColumn',
        width: 100,
        cellClassRules: { 'cell--saved': (p) => (p.value ?? 0) > 0 },
      },
      { field: 'paidUsdCents', headerName: 'PayPal (USD)', valueFormatter: (p) => (p.value === null || p.value === undefined ? '–' : formatUsd(p.value as number)), type: 'numericColumn', width: 120 },
      { field: 'paidBy', headerName: 'Approved by', cellRenderer: PaidByCell, width: 140, filter: true },
      { headerName: 'Blocked', valueGetter: (p) => p.data?.caught.length ?? 0, type: 'numericColumn', width: 95 },
      { headerName: 'Fees you approved', valueGetter: (p) => p.data?.approved.map((a) => `${a.label} ${formatInr(a.paise)}`).join(', ') || '–', flex: 1, minWidth: 180 },
      { field: 'intentMandateId', headerName: 'Intent mandate', width: 150 },
      { field: 'cartMandateId', headerName: 'Cart mandate', width: 130, valueFormatter: (p) => (p.value as string) ?? '–' },
      { field: 'orderId', headerName: 'PayPal order', width: 170, valueFormatter: (p) => (p.value as string) ?? '–' },
      { field: 'planner', headerName: 'Planner', width: 105, valueFormatter: (p) => (p.value === 'backup' ? 'Backup' : 'Gemini') },
    ],
    [],
  );

  const chargeCols: ColDef<ChargeRow>[] = useMemo(
    () => [
      { field: 'pattern', headerName: 'Dark pattern', filter: true, width: 210 },
      { field: 'label', headerName: 'Charge', flex: 1, minWidth: 200 },
      { field: 'paise', headerName: 'Amount', valueFormatter: inr, type: 'numericColumn', width: 110, sort: 'desc' },
      { field: 'store', headerName: 'Store', filter: true, width: 110 },
      { field: 'at', headerName: 'When', valueFormatter: when, width: 130 },
    ],
    [],
  );

  const pinnedRuns = useMemo(
    () => (rows?.length ? [{ at: null, store: `${totals.runs} run${totals.runs === 1 ? '' : 's'}`, state: '', triedPaise: totals.tried, paidPaise: totals.paid, savedPaise: totals.saved, paidUsdCents: null, paidBy: null, caught: [], approved: [] } as unknown as LedgerRow] : []),
    [rows, totals],
  );

  return (
    <div className="ledger">
      <header className="ledger__head">
        <div>
          <h2>Payments ledger</h2>
          <p className="muted">Every finished agent run on this server: what the store tried to charge, what PayPal actually moved, and what FairCart stopped.</p>
        </div>
        <div className="row">
          <button className="btn btn--ghost" onClick={load}>
            Refresh
          </button>
          <button className="btn btn--ghost" disabled={!rows?.length} onClick={() => runsApi.current?.exportDataAsCsv({ fileName: 'faircart-payments-ledger.csv' })}>
            Export CSV
          </button>
        </div>
      </header>

      <dl className="kpis">
        <div>
          <dt>Stores tried to charge</dt>
          <dd>{formatInr(totals.tried)}</dd>
        </div>
        <div>
          <dt>Agents paid</dt>
          <dd>{formatInr(totals.paid)}</dd>
        </div>
        <div className="kpi--good">
          <dt>Saved by FairCart</dt>
          <dd>{formatInr(totals.saved)}</dd>
        </div>
        <div>
          <dt>Charges blocked</dt>
          <dd>
            {charges.length} · {formatInr(totals.blocked)}
          </dd>
        </div>
        <div>
          <dt>Paid by the agent wallet</dt>
          <dd>
            {totals.byAgent} of {totals.paidRuns}
          </dd>
        </div>
      </dl>

      {error && <p className="callout callout--error">{error}</p>}
      {rows && rows.length === 0 && <p className="callout">No finished runs yet. Run the agent once and its payment shows up here.</p>}

      <section className="ledger__grid">
        <h3>Runs</h3>
        <div className="grid grid--runs">
          <AgGridReact<LedgerRow>
            theme={theme}
            rowData={rows ?? []}
            columnDefs={runCols}
            pinnedBottomRowData={pinnedRuns}
            onGridReady={(e) => (runsApi.current = e.api)}
            loading={rows === null}
            defaultColDef={{ sortable: true, resizable: true }}
            getRowId={(p) => p.data.runId ?? 'total'}
          />
        </div>
      </section>

      <section className="ledger__grid">
        <h3>Charges FairCart blocked</h3>
        <div className="grid grid--charges">
          <AgGridReact<ChargeRow> theme={theme} rowData={charges} columnDefs={chargeCols} defaultColDef={{ sortable: true, resizable: true }} />
        </div>
      </section>
    </div>
  );
}
