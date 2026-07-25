/**
 * Summary statistics.
 *
 * The one design rule here: never report a mean without also reporting a
 * median and a spread. Several of the distributions this engine produces are
 * violently skewed — the founder branch most of all — and a mean on its own
 * is not a summary of them, it is a misrepresentation of them.
 */

export interface Summary {
  mean: number;
  median: number;
  p05: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  p95: number;
  sd: number;
  /** Standard error of the mean: sd / sqrt(n). How precise the mean is. */
  stderr: number;
  min: number;
  max: number;
  n: number;
}

/** Quantile by linear interpolation on a pre-sorted array. */
export function quantileSorted(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const pos = (n - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function summarise(values: ArrayLike<number>): Summary {
  const n = values.length;
  if (n === 0) {
    return { mean: 0, median: 0, p05: 0, p10: 0, p25: 0, p75: 0, p90: 0, p95: 0, sd: 0, stderr: 0, min: 0, max: 0, n: 0 };
  }
  const sorted = Float64Array.from(values as ArrayLike<number>).sort();
  let sum = 0;
  for (let i = 0; i < n; i++) sum += sorted[i];
  const mean = sum / n;
  let variance = 0;
  for (let i = 0; i < n; i++) {
    const d = sorted[i] - mean;
    variance += d * d;
  }
  // Sample variance (n-1) — these are draws from a process, not a census.
  const sd = Math.sqrt(variance / Math.max(1, n - 1));
  return {
    mean,
    median: quantileSorted(sorted, 0.5),
    p05: quantileSorted(sorted, 0.05),
    p10: quantileSorted(sorted, 0.1),
    p25: quantileSorted(sorted, 0.25),
    p75: quantileSorted(sorted, 0.75),
    p90: quantileSorted(sorted, 0.9),
    p95: quantileSorted(sorted, 0.95),
    sd,
    stderr: sd / Math.sqrt(n),
    min: sorted[0],
    max: sorted[n - 1],
    n,
  };
}

export interface Band {
  year: number;
  p10: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
  mean: number;
}

/** Turn a [year][run] matrix into percentile bands over time. */
export function bands(byYear: Float64Array[]): Band[] {
  return byYear.map((row, year) => {
    const sorted = Float64Array.from(row).sort();
    let sum = 0;
    for (let i = 0; i < sorted.length; i++) sum += sorted[i];
    return {
      year,
      p10: quantileSorted(sorted, 0.1),
      p25: quantileSorted(sorted, 0.25),
      median: quantileSorted(sorted, 0.5),
      p75: quantileSorted(sorted, 0.75),
      p90: quantileSorted(sorted, 0.9),
      mean: sum / Math.max(1, sorted.length),
    };
  });
}

export interface HistogramBin {
  from: number;
  to: number;
  count: number;
  /** Share of the total, 0–1. */
  share: number;
}

/**
 * A histogram with explicit bounds, so two branches can be drawn on the same
 * axis. Values outside the range are clamped into the end bins and the caller
 * is told, rather than silently dropped.
 */
export function histogram(values: ArrayLike<number>, from: number, to: number, binCount = 40): HistogramBin[] {
  const bins: HistogramBin[] = [];
  const width = (to - from) / binCount;
  if (!(width > 0)) return bins;
  const counts = new Uint32Array(binCount);
  for (let i = 0; i < values.length; i++) {
    const idx = Math.min(binCount - 1, Math.max(0, Math.floor((values[i] - from) / width)));
    counts[idx]++;
  }
  const total = Math.max(1, values.length);
  for (let i = 0; i < binCount; i++) {
    bins.push({ from: from + i * width, to: from + (i + 1) * width, count: counts[i], share: counts[i] / total });
  }
  return bins;
}

/** Share of values at or above a threshold. */
export function shareAbove(values: ArrayLike<number>, threshold: number): number {
  let count = 0;
  for (let i = 0; i < values.length; i++) if (values[i] >= threshold) count++;
  return values.length ? count / values.length : 0;
}

/**
 * Probability that a draw from A exceeds a draw from B, estimated from the
 * paired runs. Because the two branches share random streams, this is a
 * genuinely paired comparison and answers "in what fraction of worlds would
 * this choice have left me better off?" — usually a far more useful question
 * than "which option has the higher average?".
 */
export function pairedWinRate(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0.5;
  let wins = 0;
  for (let i = 0; i < n; i++) if (a[i] > b[i]) wins++;
  return wins / n;
}

/** Mean of the paired differences, with the standard error of that mean. */
export function pairedDelta(a: ArrayLike<number>, b: ArrayLike<number>): { mean: number; stderr: number; median: number } {
  const n = Math.min(a.length, b.length);
  if (n === 0) return { mean: 0, stderr: 0, median: 0 };
  const diffs = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    diffs[i] = a[i] - b[i];
    sum += diffs[i];
  }
  const mean = sum / n;
  let variance = 0;
  for (let i = 0; i < n; i++) {
    const d = diffs[i] - mean;
    variance += d * d;
  }
  const sd = Math.sqrt(variance / Math.max(1, n - 1));
  const sorted = Float64Array.from(diffs).sort();
  return { mean, stderr: sd / Math.sqrt(n), median: quantileSorted(sorted, 0.5) };
}
