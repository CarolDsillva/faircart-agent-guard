/**
 * Price chart of observed points only: no interpolation between gaps longer
 * than a day, no invented history. Dates on the x axis are real observation
 * times; the 30-day low line is drawn only when the history supports it.
 */
interface Props {
  points: { at: string; price: number }[];
  low30?: number | null;
  height?: number;
  compact?: boolean;
}

const DAY = 86_400_000;

export function PriceChart({ points, low30 = null, height = 140, compact = false }: Props) {
  if (points.length < 2) return null;
  const W = 320;
  const H = height;
  const pad = compact ? { l: 4, r: 4, t: 8, b: 8 } : { l: 44, r: 10, t: 12, b: 22 };
  const ts = points.map((p) => Date.parse(p.at));
  const t0 = Math.min(...ts);
  const t1 = Math.max(...ts, t0 + DAY);
  const prices = points.map((p) => p.price);
  let lo = Math.min(...prices, ...(low30 !== null ? [low30] : []));
  let hi = Math.max(...prices);
  if (hi - lo < 1) {
    hi += 1;
    lo -= 1;
  }
  const span = hi - lo;
  lo -= span * 0.12;
  hi += span * 0.12;
  const x = (t: number) => pad.l + ((t - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const y = (p: number) => pad.t + (1 - (p - lo) / (hi - lo)) * (H - pad.t - pad.b);

  // Step line (price holds until the next observation); break segments across gaps > 3 days.
  const segs: string[] = [];
  let d = '';
  points.forEach((p, i) => {
    const px = x(ts[i]!);
    const py = y(p.price);
    if (i === 0) d = `M${px},${py}`;
    else if (ts[i]! - ts[i - 1]! > 3 * DAY) {
      segs.push(d);
      d = `M${px},${py}`;
    } else d += `H${px}V${py}`;
  });
  segs.push(d);
  const last = points[points.length - 1]!;
  const fmtDate = (t: number) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const ticks = compact ? [] : [hi - (hi - lo) * 0.12, lo + (hi - lo) * 0.12];

  return (
    <svg className="fc-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Observed prices from ${fmtDate(t0)} to ${fmtDate(t1)}, ${points.length} observations`}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="fc-chart__grid" />
          <text x={pad.l - 6} y={y(v) + 3} className="fc-chart__label" textAnchor="end">
            ₹{Math.round(v).toLocaleString('en-IN')}
          </text>
        </g>
      ))}
      {low30 !== null && (
        <g>
          <line x1={pad.l} x2={W - pad.r} y1={y(low30)} y2={y(low30)} className="fc-chart__low" />
          {!compact && (
            <text x={W - pad.r} y={y(low30) - 4} className="fc-chart__label" textAnchor="end">
              30-day low
            </text>
          )}
        </g>
      )}
      {segs.map((s, i) => (
        <path key={i} d={s} className="fc-chart__line" />
      ))}
      {points.map((p, i) => (
        <circle key={i} cx={x(ts[i]!)} cy={y(p.price)} r={compact ? 1.6 : 2.2} className="fc-chart__pt" />
      ))}
      <circle cx={x(Date.parse(last.at))} cy={y(last.price)} r={compact ? 3 : 3.5} className="fc-chart__end" />
      {!compact && (
        <>
          <text x={pad.l} y={H - 6} className="fc-chart__label">
            {fmtDate(t0)}
          </text>
          <text x={W - pad.r} y={H - 6} className="fc-chart__label" textAnchor="end">
            {fmtDate(t1)}
          </text>
        </>
      )}
    </svg>
  );
}
