/**
 * The fan chart: how a distribution widens as it travels forward in time.
 *
 * This is the chart that carries the central argument of the whole app. A
 * single projected line invites you to read a number off it. A fan makes the
 * uncertainty impossible to ignore — and the fact that it opens up so
 * dramatically over fifteen years is the honest headline, not a presentational
 * problem to be smoothed away.
 *
 * Two bands per branch: the 10th–90th percentile and the 25th–75th, with the
 * median drawn as a line. Eight in ten futures land inside the outer band.
 */

import { useState } from 'react';

import type { Band } from '../../engine/stats';
import {
  areaPath,
  branchPalette,
  Figure,
  HoverLayer,
  linePath,
  linearScale,
  niceDomain,
  symlogScale,
  symlogTicks,
  ticksFor,
  Tooltip,
  useSize,
  XAxis,
  YAxis,
  type LegendItem,
} from './kit';

export interface FanSeries {
  branchId: string;
  label: string;
  bands: Band[];
}

export function FanChart({
  series,
  baselineId,
  format,
  title,
  caption,
  originValue,
  height = 340,
  scaleKind = 'linear',
}: {
  series: FanSeries[];
  baselineId: string;
  format: (value: number) => string;
  title: string;
  caption?: string;
  /** Where the person stands today, drawn as a reference line. */
  originValue?: number;
  height?: number;
  scaleKind?: 'linear' | 'symlog';
}) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<{ x: number; y: number; index: number } | null>(null);

  const margin = { top: 14, right: 16, bottom: 30, left: 62 };
  const width = Math.max(320, size.width);
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const yearCount = series[0]?.bands.length ?? 0;
  const palette = branchPalette(series.map((s) => s.branchId), baselineId);
  if (yearCount === 0) return null;

  // One shared y-domain across branches — comparing two fans on different
  // scales would be meaningless.
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of series) {
    for (const b of s.bands) {
      lo = Math.min(lo, b.p10);
      hi = Math.max(hi, b.p90);
    }
  }
  if (originValue !== undefined) {
    lo = Math.min(lo, originValue);
    hi = Math.max(hi, originValue);
  }

  const useSymlog = scaleKind === 'symlog';
  const domain: [number, number] = useSymlog ? [lo, hi] : niceDomain(lo, hi, 5);
  const y = useSymlog
    ? symlogScale(domain, [margin.top + plotHeight, margin.top])
    : linearScale(domain, [margin.top + plotHeight, margin.top]);
  const x = linearScale([0, yearCount - 1], [margin.left, margin.left + plotWidth]);

  const yTicks = useSymlog ? symlogTicks(domain) : ticksFor(domain, 5);
  const xTicks = ticksFor([0, yearCount - 1], Math.min(8, yearCount - 1)).filter((t) => Number.isInteger(t));

  const legend: LegendItem[] = series.map((s) => ({
    label: s.label,
    colour: palette[s.branchId],
    value: hover ? format(s.bands[hover.index]?.median ?? 0) : undefined,
  }));

  const points = (bands: Band[], pick: (b: Band) => number) =>
    bands.map((b, i) => ({ x: x(i), y: y(pick(b)) }));

  return (
    <Figure
      title={title}
      caption={caption}
      legend={legend}
      height={height}
      table={
        <table className="data-table">
          <thead>
            <tr>
              <th>Year</th>
              {series.map((s) => (
                <th key={s.branchId} colSpan={3}>
                  {s.label}
                </th>
              ))}
            </tr>
            <tr>
              <th />
              {series.flatMap((s) => [
                <th key={`${s.branchId}-lo`}>10th</th>,
                <th key={`${s.branchId}-md`}>Median</th>,
                <th key={`${s.branchId}-hi`}>90th</th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: yearCount }, (_, i) => (
              <tr key={i}>
                <td className="num">{i}</td>
                {series.flatMap((s) => [
                  <td key={`${s.branchId}-${i}-lo`} className="num">
                    {format(s.bands[i].p10)}
                  </td>,
                  <td key={`${s.branchId}-${i}-md`} className="num">
                    {format(s.bands[i].median)}
                  </td>,
                  <td key={`${s.branchId}-${i}-hi`} className="num">
                    {format(s.bands[i].p90)}
                  </td>,
                ])}
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div ref={ref} className="chart-surface">
        <svg width="100%" height={height} role="img" aria-label={title}>
          <YAxis scale={y} ticks={yTicks} format={format} width={margin.left + plotWidth} left={margin.left} />

          {originValue !== undefined && (
            <g>
              <line
                className="reference-line"
                x1={margin.left}
                x2={margin.left + plotWidth}
                y1={y(originValue)}
                y2={y(originValue)}
              />
              <text className="reference-label" x={margin.left + plotWidth} y={y(originValue) - 5} textAnchor="end">
                today
              </text>
            </g>
          )}

          {series.map((s) => {
            const colour = palette[s.branchId];
            return (
              <g key={s.branchId}>
                <path
                  d={areaPath(points(s.bands, (b) => b.p90), points(s.bands, (b) => b.p10))}
                  fill={colour}
                  opacity={0.1}
                />
                <path
                  d={areaPath(points(s.bands, (b) => b.p75), points(s.bands, (b) => b.p25))}
                  fill={colour}
                  opacity={0.2}
                />
                <path
                  d={linePath(points(s.bands, (b) => b.median))}
                  fill="none"
                  stroke={colour}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            );
          })}

          {hover && (
            <g>
              <line
                className="crosshair"
                x1={x(hover.index)}
                x2={x(hover.index)}
                y1={margin.top}
                y2={margin.top + plotHeight}
              />
              {series.map((s) => (
                <circle
                  key={s.branchId}
                  cx={x(hover.index)}
                  cy={y(s.bands[hover.index].median)}
                  r={4}
                  fill={palette[s.branchId]}
                  stroke="var(--surface-0)"
                  strokeWidth={2}
                />
              ))}
            </g>
          )}

          <XAxis
            scale={x}
            ticks={xTicks}
            format={(v) => (v === 0 ? 'now' : `+${v}y`)}
            y={margin.top + plotHeight}
          />

          <HoverLayer
            x={margin.left}
            y={margin.top}
            width={plotWidth}
            height={plotHeight}
            count={yearCount}
            onHover={setHover}
            onLeave={() => setHover(null)}
          />
        </svg>

        {hover && (
          <Tooltip x={hover.x + margin.left} y={margin.top} containerWidth={width}>
            <div className="tooltip__head">
              {hover.index === 0 ? 'Today' : `In ${hover.index} year${hover.index === 1 ? '' : 's'}`}
            </div>
            {series.map((s) => {
              const band = s.bands[hover.index];
              return (
                <div key={s.branchId} className="tooltip__row">
                  <span className="tooltip__swatch" style={{ background: palette[s.branchId] }} />
                  <span className="tooltip__label">{s.label}</span>
                  <span className="tooltip__value num">{format(band.median)}</span>
                </div>
              );
            })}
            <div className="tooltip__note">
              8 in 10 futures land between {format(Math.min(...series.map((s) => s.bands[hover.index].p10)))} and{' '}
              {format(Math.max(...series.map((s) => s.bands[hover.index].p90)))}
            </div>
          </Tooltip>
        )}
      </div>
    </Figure>
  );
}
