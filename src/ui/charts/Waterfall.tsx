/**
 * The attribution waterfall — where a number came from.
 *
 * Reads top to bottom: each bar is one mechanism's marginal contribution to
 * the headline difference, largest first, with the unexplained interaction
 * shown as its own bar at the end rather than hidden.
 *
 * Diverging colour, because the encoded quantity has a genuine zero and the
 * sign is the whole point: blue pushes the number up, red pulls it down.
 * Every bar is also directly labelled, so the sign is never colour-only.
 */

import { useState } from 'react';

import type { Attribution, ChannelContribution } from '../../engine/attribution';
import { Why } from '../primitives';
import { ASSUMPTIONS, type AssumptionId } from '../../engine/assumptions';
import { Figure, linearScale, useSize } from './kit';

export function Waterfall({
  attribution,
  format,
  title,
  caption,
  invertGood = false,
}: {
  attribution: Attribution;
  format: (value: number) => string;
  title: string;
  caption?: string;
  /** For metrics like stress, where down is good. */
  invertGood?: boolean;
}) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [active, setActive] = useState<string | null>(null);

  const rows: (ChannelContribution & { isInteraction?: boolean })[] = [
    ...attribution.contributions,
    ...(Math.abs(attribution.interaction) > Math.abs(attribution.total) * 0.005
      ? [
          {
            channelId: '__interaction',
            label: 'Interaction between the above',
            why:
              'The channels are not independent. A salary uplift and a higher cost base compound together, a longer runway changes how a failure plays out, and so on. This bar is what the individual mechanisms do not account for on their own. A large value here is informative rather than embarrassing — it means the decision has to be judged whole rather than mechanism by mechanism.',
            assumptions: [],
            contribution: attribution.interaction,
            share: 0,
            stderr: 0,
            isInteraction: true,
          },
        ]
      : []),
  ];

  const width = Math.max(320, size.width);
  const labelWidth = Math.min(280, Math.max(150, width * 0.34));
  const valueWidth = 92;
  const barLeft = labelWidth + 12;
  const barWidth = Math.max(60, width - barLeft - valueWidth - 8);
  const rowHeight = 34;
  const height = rows.length * rowHeight + 34;

  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.contribution)), Math.abs(attribution.total) * 0.2, 1);
  const x = linearScale([-maxAbs, maxAbs], [barLeft, barLeft + barWidth]);
  const zero = x(0);

  const colourFor = (value: number) => {
    const good = invertGood ? value < 0 : value > 0;
    return good ? 'var(--diverge-pos)' : 'var(--diverge-neg)';
  };

  return (
    <Figure
      title={title}
      caption={caption}
      height={height}
      table={
        <table className="data-table">
          <thead>
            <tr>
              <th>Mechanism</th>
              <th>Contribution</th>
              <th>Uncertainty (95%)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.channelId}>
                <td>{row.label}</td>
                <td className="num">{format(row.contribution)}</td>
                <td className="num">{row.stderr ? `±${format(1.96 * row.stderr)}` : '—'}</td>
              </tr>
            ))}
            <tr className="data-table__total">
              <td>Total difference</td>
              <td className="num">{format(attribution.total)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      }
    >
      <div ref={ref} className="chart-surface waterfall">
        <svg width="100%" height={height} role="img" aria-label={title}>
          <line className="axis-line" x1={zero} x2={zero} y1={4} y2={rows.length * rowHeight + 4} />

          {rows.map((row, i) => {
            const cy = 4 + i * rowHeight + rowHeight / 2;
            const value = row.contribution;
            const from = Math.min(zero, x(value));
            const to = Math.max(zero, x(value));
            const barW = Math.max(2, to - from);
            const colour = colourFor(value);
            const isActive = active === row.channelId;
            // 95% interval on the estimate, so a bar that is really just Monte
            // Carlo noise looks like noise.
            const ciHalf = Math.abs(x(1.96 * row.stderr) - zero);

            return (
              <g
                key={row.channelId}
                onPointerEnter={() => setActive(row.channelId)}
                onPointerLeave={() => setActive(null)}
                style={{ cursor: 'default' }}
              >
                <rect x={0} y={cy - rowHeight / 2} width={width} height={rowHeight} fill={isActive ? 'var(--surface-2)' : 'transparent'} rx={6} />
                <text
                  className="waterfall__label"
                  x={labelWidth}
                  y={cy + 4}
                  textAnchor="end"
                  opacity={row.isInteraction ? 0.65 : 1}
                >
                  {truncate(row.label, Math.floor(labelWidth / 6.6))}
                </text>
                <rect
                  x={from}
                  y={cy - 7}
                  width={barW}
                  height={14}
                  rx={3}
                  fill={colour}
                  opacity={row.isInteraction ? 0.3 : isActive ? 1 : 0.82}
                  stroke="var(--surface-1)"
                  strokeWidth={1}
                />
                {ciHalf > 1.5 && (
                  <line
                    x1={x(value) - ciHalf}
                    x2={x(value) + ciHalf}
                    y1={cy}
                    y2={cy}
                    stroke="var(--ink)"
                    strokeWidth={1}
                    opacity={0.5}
                  />
                )}
                <text className="waterfall__value num" x={barLeft + barWidth + 8} y={cy + 4}>
                  {format(value)}
                </text>
              </g>
            );
          })}

          <line
            className="axis-line"
            x1={barLeft}
            x2={barLeft + barWidth}
            y1={rows.length * rowHeight + 8}
            y2={rows.length * rowHeight + 8}
          />
          <text className="axis-label" x={zero} y={rows.length * rowHeight + 24} textAnchor="middle">
            0
          </text>
        </svg>

        <div className="waterfall__total">
          <span className="waterfall__total-label">Total difference</span>
          <span className="waterfall__total-value num">{format(attribution.total)}</span>
        </div>

        <ul className="waterfall__why">
          {rows.map((row) => (
            <li key={row.channelId} className={active === row.channelId ? 'is-active' : undefined}>
              <span className="waterfall__why-dot" style={{ background: colourFor(row.contribution) }} />
              <span className="waterfall__why-label">{row.label}</span>
              <Why title={row.label}>
                <p>{row.why}</p>
                {row.assumptions.length > 0 && (
                  <>
                    <p className="why__subhead">Rests on</p>
                    <ul className="why__assumptions">
                      {row.assumptions.map((id) => {
                        const spec = ASSUMPTIONS[id as AssumptionId];
                        if (!spec) return null;
                        return (
                          <li key={id}>
                            <strong>{spec.label}</strong>
                            <span className={`why__confidence why__confidence--${spec.confidence}`}>
                              {spec.confidence} confidence
                            </span>
                            <div>{spec.rationale}</div>
                            {spec.caveat && <div className="why__caveat">{spec.caveat}</div>}
                            <div className="why__sources">
                              {spec.sources.map((s) => s.label).join(' · ')}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
                {!row.isInteraction && (
                  <p className="why__method">
                    Measured by re-running the whole simulation with this mechanism switched off and taking the
                    difference — {attribution.runsPerAblation.toLocaleString('en-GB')} paired futures per ablation.
                  </p>
                )}
              </Why>
            </li>
          ))}
        </ul>
      </div>
    </Figure>
  );
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}
