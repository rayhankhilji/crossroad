/**
 * Terminal outcome distributions, two branches on one axis.
 *
 * Drawn as outlined step areas rather than filled bars, because two filled
 * histograms overlaid become mud exactly where they overlap — which is the
 * region you most need to read. Percentile markers sit underneath so the
 * median and the tails can be located precisely without hunting.
 */

import { useState } from 'react';

import type { HistogramBin, Summary } from '../../engine/stats';
import { branchPalette, Figure, linearScale, Tooltip, useSize, XAxis, type LegendItem } from './kit';

export interface DistributionSeries {
  branchId: string;
  label: string;
  bins: HistogramBin[];
  summary: Summary;
}

export function DistributionChart({
  series,
  baselineId,
  format,
  title,
  caption,
  height = 260,
}: {
  series: DistributionSeries[];
  baselineId: string;
  format: (value: number) => string;
  title: string;
  caption?: string;
  height?: number;
}) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<{ x: number; index: number } | null>(null);

  const margin = { top: 12, right: 16, bottom: 46, left: 16 };
  const width = Math.max(320, size.width);
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const bins = series[0]?.bins ?? [];
  const palette = branchPalette(series.map((s) => s.branchId), baselineId);
  if (bins.length === 0) return null;

  const xDomain: [number, number] = [bins[0].from, bins[bins.length - 1].to];
  const x = linearScale(xDomain, [margin.left, margin.left + plotWidth]);
  const maxShare = Math.max(...series.flatMap((s) => s.bins.map((b) => b.share)), 0.001);
  const y = linearScale([0, maxShare], [margin.top + plotHeight, margin.top]);

  const legend: LegendItem[] = series.map((s) => ({
    label: s.label,
    colour: palette[s.branchId],
    value: `median ${format(s.summary.median)}`,
  }));

  // A step outline: horizontal across each bin, vertical between them.
  const stepPath = (b: HistogramBin[]) => {
    let d = `M${x(b[0].from).toFixed(2)},${y(0).toFixed(2)}`;
    for (const bin of b) {
      d += ` L${x(bin.from).toFixed(2)},${y(bin.share).toFixed(2)}`;
      d += ` L${x(bin.to).toFixed(2)},${y(bin.share).toFixed(2)}`;
    }
    d += ` L${x(b[b.length - 1].to).toFixed(2)},${y(0).toFixed(2)} Z`;
    return d;
  };

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
              <th>Branch</th>
              <th>10th</th>
              <th>25th</th>
              <th>Median</th>
              <th>75th</th>
              <th>90th</th>
              <th>Mean</th>
            </tr>
          </thead>
          <tbody>
            {series.map((s) => (
              <tr key={s.branchId}>
                <td>{s.label}</td>
                <td className="num">{format(s.summary.p10)}</td>
                <td className="num">{format(s.summary.p25)}</td>
                <td className="num">{format(s.summary.median)}</td>
                <td className="num">{format(s.summary.p75)}</td>
                <td className="num">{format(s.summary.p90)}</td>
                <td className="num">{format(s.summary.mean)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div ref={ref} className="chart-surface">
        <svg width="100%" height={height} role="img" aria-label={title}>
          {series.map((s) => {
            const colour = palette[s.branchId];
            return (
              <g key={s.branchId}>
                <path d={stepPath(s.bins)} fill={colour} opacity={0.14} />
                <path d={stepPath(s.bins)} fill="none" stroke={colour} strokeWidth={1.5} strokeLinejoin="round" />
              </g>
            );
          })}

          {/* Percentile rails: median as a solid tick, quartiles as a bar. */}
          {series.map((s, i) => {
            const colour = palette[s.branchId];
            const railY = margin.top + plotHeight + 12 + i * 11;
            return (
              <g key={`${s.branchId}-rail`}>
                <line
                  x1={x(Math.max(xDomain[0], s.summary.p10))}
                  x2={x(Math.min(xDomain[1], s.summary.p90))}
                  y1={railY}
                  y2={railY}
                  stroke={colour}
                  strokeWidth={1}
                  opacity={0.45}
                />
                <line
                  x1={x(Math.max(xDomain[0], s.summary.p25))}
                  x2={x(Math.min(xDomain[1], s.summary.p75))}
                  y1={railY}
                  y2={railY}
                  stroke={colour}
                  strokeWidth={4}
                  strokeLinecap="round"
                  opacity={0.75}
                />
                <circle
                  cx={x(Math.max(xDomain[0], Math.min(xDomain[1], s.summary.median)))}
                  cy={railY}
                  r={3.5}
                  fill={colour}
                  stroke="var(--surface-1)"
                  strokeWidth={1.5}
                />
              </g>
            );
          })}

          <XAxis scale={x} ticks={xTicksFor(xDomain)} format={format} y={margin.top + plotHeight} />

          {hover && (
            <line
              className="crosshair"
              x1={x(bins[hover.index].from + (bins[hover.index].to - bins[hover.index].from) / 2)}
              x2={x(bins[hover.index].from + (bins[hover.index].to - bins[hover.index].from) / 2)}
              y1={margin.top}
              y2={margin.top + plotHeight}
            />
          )}

          <rect
            x={margin.left}
            y={margin.top}
            width={plotWidth}
            height={plotHeight}
            fill="transparent"
            style={{ cursor: 'crosshair' }}
            onPointerMove={(event) => {
              const rect = (event.currentTarget as SVGRectElement).getBoundingClientRect();
              const fraction = (event.clientX - rect.left) / Math.max(1, rect.width);
              const index = Math.max(0, Math.min(bins.length - 1, Math.floor(fraction * bins.length)));
              setHover({ x: event.clientX - rect.left + margin.left, index });
            }}
            onPointerLeave={() => setHover(null)}
          />
        </svg>

        {hover && (
          <Tooltip x={hover.x} y={margin.top} containerWidth={width}>
            <div className="tooltip__head">
              {format(bins[hover.index].from)} – {format(bins[hover.index].to)}
            </div>
            {series.map((s) => (
              <div key={s.branchId} className="tooltip__row">
                <span className="tooltip__swatch" style={{ background: palette[s.branchId] }} />
                <span className="tooltip__label">{s.label}</span>
                <span className="tooltip__value num">{(s.bins[hover.index].share * 100).toFixed(1)}%</span>
              </div>
            ))}
            <div className="tooltip__note">Share of simulated futures landing in this range.</div>
          </Tooltip>
        )}
      </div>
    </Figure>
  );
}

function xTicksFor(domain: [number, number]): number[] {
  const [min, max] = domain;
  const out: number[] = [];
  for (let i = 0; i <= 4; i++) out.push(min + ((max - min) * i) / 4);
  return out;
}
