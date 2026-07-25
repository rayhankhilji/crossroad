/**
 * Individual lives.
 *
 * Bands and percentiles describe the distribution; they do not let you feel
 * it. This draws the sampled paths one by one — every faint line is one
 * complete simulated life — and lets you pull a single one to the front and
 * read what actually happened in it, year by year.
 *
 * It is the antidote to the fan chart. A percentile band is smooth and
 * reassuring; a real path is jagged, gets laid off in year four, recovers, and
 * has a market crash in year nine. No individual future looks like the median.
 */

import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';

import type { SimEvent, SimPath, SimState } from '../../engine/types';
import { Figure, linePath, linearScale, niceDomain, symlogScale, symlogTicks, ticksFor, useSize, XAxis, YAxis } from './kit';

const EVENT_STYLE: Record<string, { label: string; colour: string }> = {
  layoff: { label: 'Laid off', colour: 'var(--tone-bad)' },
  'job-change': { label: 'Changed job', colour: 'var(--series-1)' },
  promotion: { label: 'Promoted', colour: 'var(--series-3)' },
  raise: { label: 'Pay rise', colour: 'var(--series-3)' },
  'startup-failed': { label: 'Company failed', colour: 'var(--tone-bad)' },
  'startup-acquired': { label: 'Acquired', colour: 'var(--series-3)' },
  'startup-breakout': { label: 'Breakout', colour: 'var(--tone-great)' },
  'health-shock': { label: 'Health event', colour: 'var(--tone-bad)' },
  'relationship-formed': { label: 'Met someone', colour: 'var(--series-5)' },
  'relationship-ended': { label: 'Separated', colour: 'var(--tone-bad)' },
  'child-born': { label: 'Child born', colour: 'var(--series-5)' },
  relocation: { label: 'Moved', colour: 'var(--series-7)' },
  'market-crash': { label: 'Market crash', colour: 'var(--tone-mixed)' },
  'market-boom': { label: 'Strong market', colour: 'var(--series-1)' },
  windfall: { label: 'Windfall', colour: 'var(--tone-great)' },
  burnout: { label: 'Burnout', colour: 'var(--tone-bad)' },
  decision: { label: 'The decision', colour: 'var(--ink)' },
  graduation: { label: 'Graduated', colour: 'var(--series-1)' },
  recovery: { label: 'Recovered', colour: 'var(--series-3)' },
  'funding-round': { label: 'Raised money', colour: 'var(--series-3)' },
};

type TrackKey = 'netWorth' | 'happiness' | 'health' | 'income';

const TRACKS: { key: TrackKey; label: string; pick: (s: SimState) => number; symlog?: boolean }[] = [
  { key: 'netWorth', label: 'Net worth', pick: (s) => s.liquid + s.invested + s.ventureEquity - s.debt, symlog: true },
  { key: 'happiness', label: 'Wellbeing', pick: (s) => s.happiness },
  { key: 'health', label: 'Health', pick: (s) => s.health },
  { key: 'income', label: 'Income', pick: (s) => s.income + s.partnerIncome },
];

export function Timeline({
  paths,
  colour,
  branchLabel,
  format,
  height = 300,
}: {
  paths: SimPath[];
  colour: string;
  branchLabel: string;
  format: (value: number) => string;
  height?: number;
}) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [trackKey, setTrackKey] = useState<TrackKey>('netWorth');
  const [selected, setSelected] = useState<number | null>(null);

  const track = TRACKS.find((t) => t.key === trackKey)!;
  const width = Math.max(320, size.width);
  const margin = { top: 12, right: 16, bottom: 30, left: 62 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const yearCount = paths[0]?.frames.length ?? 0;

  const { y, x, yTicks } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const path of paths) {
      for (const frame of path.frames) {
        const v = track.pick(frame);
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    const useSymlog = Boolean(track.symlog);
    const domain: [number, number] = useSymlog ? [lo, hi] : niceDomain(lo, hi, 4);
    return {
      y: useSymlog
        ? symlogScale(domain, [margin.top + plotHeight, margin.top])
        : linearScale(domain, [margin.top + plotHeight, margin.top]),
      x: linearScale([0, Math.max(1, yearCount - 1)], [margin.left, margin.left + plotWidth]),
      yTicks: useSymlog ? symlogTicks(domain) : ticksFor(domain, 4),
    };
  }, [paths, track, plotHeight, plotWidth, margin.top, margin.left, yearCount]);

  if (yearCount === 0) return null;

  const formatY = (value: number) =>
    trackKey === 'netWorth' || trackKey === 'income' ? format(value) : value.toFixed(0);

  const selectedPath = selected !== null ? paths.find((p) => p.index === selected) : undefined;

  return (
    <Figure
      title={`${paths.length} individual lives — ${branchLabel}`}
      caption="Each line is one complete simulated future. Click one to follow it and read what happened."
      height={height + (selectedPath ? 0 : 0)}
      actions={
        <div className="figure__tabs">
          {TRACKS.map((t) => (
            <button
              key={t.key}
              className={`figure__tab${t.key === trackKey ? ' is-active' : ''}`}
              onClick={() => setTrackKey(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      }
    >
      <div ref={ref} className="chart-surface timeline">
        <svg width="100%" height={height} role="img" aria-label={`Sampled life paths, ${track.label}`}>
          <YAxis scale={y} ticks={yTicks} format={formatY} width={margin.left + plotWidth} left={margin.left} />

          {paths.map((path, i) => {
            const isSelected = selected === path.index;
            const points = path.frames.map((frame, year) => ({ x: x(year), y: y(track.pick(frame)) }));
            return (
              <motion.path
                key={path.index}
                d={linePath(points)}
                fill="none"
                stroke={isSelected ? colour : 'var(--ink)'}
                strokeWidth={isSelected ? 2.2 : 1}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={selected === null ? 0.16 : isSelected ? 1 : 0.05}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1], delay: Math.min(0.5, i * 0.012) }}
                style={{ cursor: 'pointer' }}
                onPointerEnter={() => setSelected(path.index)}
                onClick={() => setSelected((current) => (current === path.index ? null : path.index))}
              />
            );
          })}

          {selectedPath &&
            selectedPath.events.map((event, i) => {
              const style = EVENT_STYLE[event.kind] ?? { label: event.label, colour: 'var(--ink-muted)' };
              const frame = selectedPath.frames[Math.min(event.t, selectedPath.frames.length - 1)];
              return (
                <motion.g
                  key={`${event.kind}-${event.t}-${i}`}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.25, delay: 0.1 + i * 0.05 }}
                >
                  <line
                    x1={x(event.t)}
                    x2={x(event.t)}
                    y1={margin.top}
                    y2={margin.top + plotHeight}
                    stroke={style.colour}
                    strokeWidth={1}
                    strokeDasharray="2 3"
                    opacity={0.35}
                  />
                  <circle
                    cx={x(event.t)}
                    cy={y(track.pick(frame))}
                    r={4}
                    fill={style.colour}
                    stroke="var(--surface-1)"
                    strokeWidth={1.5}
                  />
                </motion.g>
              );
            })}

          <XAxis scale={x} ticks={ticksFor([0, yearCount - 1], 6).filter(Number.isInteger)} format={(v) => (v === 0 ? 'now' : `+${v}y`)} y={margin.top + plotHeight} />
        </svg>

        {selectedPath && (
          <motion.div
            className="timeline__story"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="timeline__story-head">
              <span>Life #{selectedPath.index.toLocaleString('en-GB')}</span>
              <button className="timeline__clear" onClick={() => setSelected(null)}>
                show all
              </button>
            </div>
            <ol className="timeline__events">
              {selectedPath.events.length === 0 && (
                <li className="timeline__event timeline__event--quiet">
                  Nothing dramatic happened in this one. Most futures are like this, which is easy to forget when
                  imagining them.
                </li>
              )}
              {selectedPath.events.map((event, i) => (
                <EventRow key={`${event.kind}-${event.t}-${i}`} event={event} />
              ))}
            </ol>
          </motion.div>
        )}
      </div>
    </Figure>
  );
}

function EventRow({ event }: { event: SimEvent }) {
  const style = EVENT_STYLE[event.kind] ?? { label: event.label, colour: 'var(--ink-muted)' };
  return (
    <li className="timeline__event">
      <span className="timeline__event-year num">{event.t === 0 ? 'now' : `+${event.t}y`}</span>
      <span className="timeline__event-dot" style={{ background: style.colour }} />
      <span className="timeline__event-label">{event.label}</span>
    </li>
  );
}
