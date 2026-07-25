/**
 * Deterministic random number generation.
 *
 * Every simulation in Crossroad is reproducible: the same twin, the same
 * question and the same seed always produce the same 10,000 futures. That is
 * not a nicety — it is what makes the counterfactual honest. When we compare
 * "stay" against "quit" we replay the *same* world (same market returns, same
 * illness draws, same luck) and change only the decision. This technique is
 * called common random numbers, and it removes almost all of the Monte Carlo
 * noise from a difference of two averages.
 *
 * Implementation is a 128-bit xoshiro128** generator seeded through SplitMix32.
 * It is small, fast, has a period of 2^128-1 and passes TestU01 BigCrush —
 * far better than the `sin`-based hacks usually found in browser simulations.
 */

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** A fresh independent stream, deterministically derived from this one. */
  fork(streamId: number): Rng;
  /** The seed this generator was constructed from. */
  readonly seed: number;
}

/** SplitMix32 — used only to expand a single seed into the 4 words of state. */
function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

export function createRng(seed: number): Rng {
  const seeder = splitmix32(seed);
  let s0 = seeder();
  let s1 = seeder();
  let s2 = seeder();
  let s3 = seeder();

  // Guard against the all-zero state, which is absorbing.
  if ((s0 | s1 | s2 | s3) === 0) s0 = 0x9e3779b9;

  const rotl = (x: number, k: number) => ((x << k) | (x >>> (32 - k))) >>> 0;

  const next = (): number => {
    const result = (Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0) / 4294967296;
    const t = (s1 << 9) >>> 0;
    s2 = (s2 ^ s0) >>> 0;
    s3 = (s3 ^ s1) >>> 0;
    s1 = (s1 ^ s2) >>> 0;
    s0 = (s0 ^ s3) >>> 0;
    s2 = (s2 ^ t) >>> 0;
    s3 = rotl(s3, 11);
    return result;
  };

  return {
    seed,
    next,
    fork: (streamId: number) => createRng(mixSeed(seed, streamId)),
  };
}

/** Deterministically combine a base seed with a stream id. */
export function mixSeed(seed: number, streamId: number): number {
  let h = (seed ^ Math.imul(streamId + 1, 0x27d4eb2f)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Hash a string to a 32-bit seed, so questions and twins can seed themselves. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Distributions
// ---------------------------------------------------------------------------

/** Standard normal via Box–Muller. */
export function normal(rng: Rng, mean = 0, sd = 1): number {
  // u must be strictly positive for the log.
  const u = 1 - rng.next();
  const v = rng.next();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Normal truncated to [lo, hi] by rejection, with a bounded number of retries
 * so a badly-specified range can never hang the worker.
 */
export function truncatedNormal(rng: Rng, mean: number, sd: number, lo: number, hi: number): number {
  for (let i = 0; i < 24; i++) {
    const x = normal(rng, mean, sd);
    if (x >= lo && x <= hi) return x;
  }
  return clamp(mean, lo, hi);
}

/** Log-normal with the given *median* and log-space sd. */
export function logNormal(rng: Rng, median: number, sigma: number): number {
  return median * Math.exp(normal(rng, 0, sigma));
}

export function bernoulli(rng: Rng, p: number): boolean {
  return rng.next() < p;
}

export function uniform(rng: Rng, lo: number, hi: number): number {
  return lo + (hi - lo) * rng.next();
}

/** Exponential with the given rate (1/mean). */
export function exponential(rng: Rng, rate: number): number {
  return -Math.log(1 - rng.next()) / rate;
}

/**
 * Pareto (power-law) draw with shape alpha and scale xm — the standard model
 * for startup exits, where the mean is dominated by the tail.
 */
export function pareto(rng: Rng, alpha: number, xm: number): number {
  return xm / Math.pow(1 - rng.next(), 1 / alpha);
}

/** Pick an index from a weight vector. Weights need not be normalised. */
export function categorical(rng: Rng, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) total += Math.max(0, w);
  if (total <= 0) return 0;
  let r = rng.next() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= Math.max(0, weights[i]);
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

/**
 * Two correlated standard normals with correlation rho. Used where shocks
 * genuinely co-move — e.g. equity returns and layoff risk in a recession.
 */
export function correlatedNormals(rng: Rng, rho: number): [number, number] {
  const z1 = normal(rng);
  const z2 = normal(rng);
  return [z1, rho * z1 + Math.sqrt(Math.max(0, 1 - rho * rho)) * z2];
}

// ---------------------------------------------------------------------------
// Small numeric helpers used across the engine
// ---------------------------------------------------------------------------

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function clamp01(x: number): number {
  return clamp(x, 0, 1);
}

/** Logistic squash, used to turn unbounded scores into probabilities. */
export function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Inverse logistic. */
export function logit(p: number): number {
  const q = clamp(p, 1e-6, 1 - 1e-6);
  return Math.log(q / (1 - q));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Map a value from one range to another, clamped. */
export function remap(x: number, inLo: number, inHi: number, outLo: number, outHi: number): number {
  if (inHi === inLo) return outLo;
  return clamp(outLo + ((x - inLo) / (inHi - inLo)) * (outHi - outLo), Math.min(outLo, outHi), Math.max(outLo, outHi));
}
