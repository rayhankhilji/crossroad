/**
 * Chart infrastructure.
 *
 * Deliberately no charting library. Everything the app draws is a distribution
 * over time, a decomposition, or a tree — all three want custom marks, and a
 * general-purpose library would be fought at every step for a worse result.
 * What is shared is the boring part: scales, axes, a hover layer and a legend.
 *
 * Conventions enforced here rather than in each chart:
 *   - one y-axis, ever;
 *   - recessive grid and axes, thin marks, data carries the ink;
 *   - a legend whenever two or more series are present;
 *   - every chart has a hover layer, and every chart can become a table.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import './charts.css';

// ---------------------------------------------------------------------------
// Sizing
// ---------------------------------------------------------------------------

export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 640, height: 320 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0) setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}

// ---------------------------------------------------------------------------
// Scales
// ---------------------------------------------------------------------------

export interface Scale {
  (value: number): number;
  invert: (pixel: number) => number;
  domain: [number, number];
  range: [number, number];
}

export function linearScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  const fn = ((value: number) => r0 + ((value - d0) / span) * (r1 - r0)) as Scale;
  fn.invert = (pixel: number) => d0 + ((pixel - r0) / (r1 - r0 || 1)) * span;
  fn.domain = domain;
  fn.range = range;
  return fn;
}

/**
 * A symmetric log-ish scale for money.
 *
 * Net worth distributions span from "in debt" to "generational wealth" in the
 * same chart, and a linear axis renders 95% of the runs as an unreadable
 * smear at the bottom. A signed log handles negatives, which a plain log
 * cannot, and keeps the shape of the middle of the distribution legible.
 */
export function symlogScale(domain: [number, number], range: [number, number], constant = 10000): Scale {
  const t = (v: number) => Math.sign(v) * Math.log1p(Math.abs(v) / constant);
  const inv = (v: number) => Math.sign(v) * constant * (Math.exp(Math.abs(v)) - 1);
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const t0 = t(d0);
  const t1 = t(d1);
  const span = t1 - t0 || 1;
  const fn = ((value: number) => r0 + ((t(value) - t0) / span) * (r1 - r0)) as Scale;
  fn.invert = (pixel: number) => inv(t0 + ((pixel - r0) / (r1 - r0 || 1)) * span);
  fn.domain = domain;
  fn.range = range;
  return fn;
}

/** Round a domain out to visually pleasant bounds. */
export function niceDomain(min: number, max: number, ticks = 5): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return [min - 1, max + 1];
  }
  const span = max - min;
  const step = Math.pow(10, Math.floor(Math.log10(span / ticks)));
  const error = span / ticks / step;
  const factor = error >= 7.5 ? 10 : error >= 3.5 ? 5 : error >= 1.5 ? 2 : 1;
  const niceStep = step * factor;
  return [Math.floor(min / niceStep) * niceStep, Math.ceil(max / niceStep) * niceStep];
}

export function ticksFor(domain: [number, number], count = 5): number[] {
  const [min, max] = domain;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  const span = max - min;
  if (span === 0) return [min];
  const step = Math.pow(10, Math.floor(Math.log10(span / count)));
  const error = span / count / step;
  const factor = error >= 7.5 ? 10 : error >= 3.5 ? 5 : error >= 1.5 ? 2 : 1;
  const niceStep = step * factor;
  const out: number[] = [];
  for (let v = Math.ceil(min / niceStep) * niceStep; v <= max + niceStep * 0.001; v += niceStep) {
    out.push(Math.abs(v) < niceStep * 1e-6 ? 0 : v);
  }
  return out;
}

/** Ticks for a symlog axis: powers of ten plus zero, trimmed to the domain. */
export function symlogTicks(domain: [number, number]): number[] {
  const [min, max] = domain;
  const magnitudes = [
    -1e9, -1e8, -1e7, -1e6, -1e5, -1e4, 0, 1e4, 1e5, 5e5, 1e6, 5e6, 1e7, 5e7, 1e8, 1e9,
  ];
  return magnitudes.filter((v) => v >= min && v <= max);
}

// ---------------------------------------------------------------------------
// Axes
// ---------------------------------------------------------------------------

export function YAxis({
  scale,
  ticks,
  format,
  width,
  left = 0,
  grid = true,
}: {
  scale: Scale;
  ticks: number[];
  format: (value: number) => string;
  width: number;
  left?: number;
  grid?: boolean;
}) {
  return (
    <g className="axis axis--y">
      {ticks.map((tick) => {
        const y = scale(tick);
        return (
          <g key={tick} transform={`translate(0 ${y})`}>
            {grid && <line className="grid-line" x1={left} x2={width} />}
            <text className="axis-label" x={left - 8} y={3} textAnchor="end">
              {format(tick)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function XAxis({
  scale,
  ticks,
  format,
  y,
  tickSize = 4,
}: {
  scale: Scale;
  ticks: number[];
  format: (value: number) => string;
  y: number;
  tickSize?: number;
}) {
  return (
    <g className="axis axis--x" transform={`translate(0 ${y})`}>
      <line className="axis-line" x1={scale.range[0]} x2={scale.range[1]} />
      {ticks.map((tick) => (
        <g key={tick} transform={`translate(${scale(tick)} 0)`}>
          <line className="axis-line" y2={tickSize} />
          <text className="axis-label" y={tickSize + 12} textAnchor="middle">
            {format(tick)}
          </text>
        </g>
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Hover layer
// ---------------------------------------------------------------------------

export interface HoverState {
  x: number;
  y: number;
  index: number;
}

/**
 * A transparent capture rectangle that reports the nearest data index.
 * Hit targets are the whole plot height, never the mark itself — chasing a
 * three-pixel line with a mouse is not an interaction.
 */
export function HoverLayer({
  x,
  y,
  width,
  height,
  count,
  onHover,
  onLeave,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  count: number;
  onHover: (state: HoverState) => void;
  onLeave: () => void;
}) {
  const ref = useRef<SVGRectElement>(null);

  const handle = useCallback(
    (event: React.PointerEvent) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect || count < 1) return;
      const px = event.clientX - rect.left;
      const fraction = rect.width > 0 ? px / rect.width : 0;
      const index = Math.max(0, Math.min(count - 1, Math.round(fraction * (count - 1))));
      onHover({ x: event.clientX - rect.left + x, y: event.clientY - rect.top + y, index });
    },
    [count, onHover, x, y],
  );

  return (
    <rect
      ref={ref}
      x={x}
      y={y}
      width={Math.max(0, width)}
      height={Math.max(0, height)}
      fill="transparent"
      style={{ cursor: 'crosshair' }}
      onPointerMove={handle}
      onPointerEnter={handle}
      onPointerLeave={onLeave}
    />
  );
}

export function Tooltip({
  x,
  y,
  containerWidth,
  children,
}: {
  x: number;
  y: number;
  containerWidth: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(180);

  useEffect(() => {
    if (ref.current) setWidth(ref.current.offsetWidth);
  }, [children]);

  // Flip to the other side of the cursor rather than running off the edge.
  const flip = x + width + 24 > containerWidth;
  const left = flip ? x - width - 14 : x + 14;

  return (
    <div ref={ref} className="chart-tooltip" style={{ left: Math.max(4, left), top: y }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

export interface LegendItem {
  label: string;
  colour: string;
  /** Optional secondary text, e.g. the value at the hovered point. */
  value?: string;
  muted?: boolean;
}

export function Legend({ items, onSelect }: { items: LegendItem[]; onSelect?: (index: number) => void }) {
  return (
    <div className="chart-legend">
      {items.map((item, i) => (
        <button
          key={item.label}
          className={`chart-legend__item${item.muted ? ' is-muted' : ''}`}
          onClick={onSelect ? () => onSelect(i) : undefined}
          style={{ cursor: onSelect ? 'pointer' : 'default' }}
        >
          <span className="chart-legend__swatch" style={{ background: item.colour }} />
          <span className="chart-legend__label">{item.label}</span>
          {item.value && <span className="chart-legend__value num">{item.value}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Figure shell — title, description, chart, and the table alternative
// ---------------------------------------------------------------------------

export function Figure({
  title,
  caption,
  legend,
  children,
  table,
  actions,
  height = 320,
}: {
  title: string;
  caption?: ReactNode;
  legend?: LegendItem[];
  children: ReactNode;
  /** The same data as a table. Identity is never colour-only. */
  table?: ReactNode;
  actions?: ReactNode;
  height?: number;
}) {
  const [showTable, setShowTable] = useState(false);

  return (
    <figure className="figure">
      <div className="figure__head">
        <div>
          <figcaption className="figure__title">{title}</figcaption>
          {caption && <p className="figure__caption">{caption}</p>}
        </div>
        <div className="figure__actions">
          {actions}
          {table && (
            <button className="figure__toggle" onClick={() => setShowTable((v) => !v)}>
              {showTable ? 'Chart' : 'Table'}
            </button>
          )}
        </div>
      </div>

      {legend && legend.length > 1 && <Legend items={legend} />}

      {showTable && table ? (
        <div className="figure__table">{table}</div>
      ) : (
        <div className="figure__plot" style={{ height }}>
          {children}
        </div>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** A line through points, with no smoothing — these are yearly observations. */
export function linePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
}

/** A closed band between an upper and lower series. */
export function areaPath(upper: { x: number; y: number }[], lower: { x: number; y: number }[]): string {
  if (upper.length === 0) return '';
  const top = upper.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const bottom = [...lower]
    .reverse()
    .map((p) => `L${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(' ');
  return `${top} ${bottom} Z`;
}

/** The validated categorical order. Assign by index; never cycle past eight. */
export const SERIES = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
  'var(--series-6)',
  'var(--series-7)',
  'var(--series-8)',
];

/**
 * Branch colours.
 *
 * The baseline — "carry on as you are" — always takes orange, and alternatives
 * take blue, then aqua, then the rest. The reader learns one mapping and it
 * holds across every chart and every question in the app.
 *
 * Orange, blue and aqua are specifically the three slots that clear the
 * all-pairs colour-vision gates rather than only the adjacent-pair ones, which
 * matters here because branches genuinely can all touch: overlapping fans,
 * ribbons landing side by side, swatches in a legend.
 */
const ALT_SERIES = [
  'var(--series-1)', // blue
  'var(--series-3)', // aqua
  'var(--series-4)', // yellow
  'var(--series-5)', // magenta
  'var(--series-7)', // violet
  'var(--series-8)', // red
];

export type BranchPalette = Record<string, string>;

/**
 * Build the whole mapping at once from the ordered branch list. Assigning by
 * position within the full array does not work — the baseline occupies a slot
 * without consuming one, so an alternative sitting after it would collide with
 * the baseline's own colour.
 */
export function branchPalette(branchIds: string[], baselineId: string): BranchPalette {
  const palette: BranchPalette = {};
  let alt = 0;
  for (const id of branchIds) {
    palette[id] = id === baselineId ? 'var(--series-2)' : ALT_SERIES[alt++ % ALT_SERIES.length];
  }
  return palette;
}

export const TONE_COLOURS: Record<string, string> = {
  great: 'var(--tone-great)',
  good: 'var(--tone-good)',
  mixed: 'var(--tone-mixed)',
  bad: 'var(--tone-bad)',
};
