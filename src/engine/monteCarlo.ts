/**
 * The Monte Carlo runner.
 *
 * Given a twin, a question and a set of assumptions, this simulates every
 * branch of the decision N times and reduces the result down to something a
 * screen can show: bands over time, terminal distributions, archetype shares,
 * paired comparisons and a handful of full life histories for the timeline.
 *
 * The two things that make the numbers trustworthy rather than merely
 * plausible:
 *
 *   - **Common random numbers.** Run i of every branch draws from identically
 *     seeded streams, so branches are compared inside the same world.
 *   - **Paired statistics.** Differences between branches are computed run by
 *     run and then averaged, not by subtracting two independent averages. The
 *     standard error falls by roughly an order of magnitude, which is what
 *     makes it legitimate to report a difference of a few percent at all.
 */

import type { AssumptionValues } from './assumptions';
import { summariseArchetypes, type ArchetypeShare, type ClassifyReference } from './archetypes';
import {
  applyImmediate,
  createContext,
  deriveTraits,
  financialFreedom,
  initialState,
  makeStreams,
  netWorth,
  step,
  type TraitVector,
} from './dynamics';
import { defaultOptions, getDecision, resolveBranch, type Branch, type OptionValues } from './decisions';
import { mixSeed } from './rng';
import { bands, histogram, pairedDelta, pairedWinRate, summarise, type Band, type HistogramBin, type Summary } from './stats';
import type { DigitalTwin, OutcomeMetric, RunOutcome, SimEvent, SimPath, SimState, ValueId } from './types';
import { normaliseValues, scoreBranch, type UtilityReference, type UtilityResult } from './utility';

export interface SimRequest {
  twin: DigitalTwin;
  params: AssumptionValues;
  decisionId: string;
  options?: OptionValues;
  /** Overrides `model.horizonYears` when present. */
  horizonYears?: number;
  /** Overrides `model.runs` when present. */
  runs?: number;
  seed?: number;
  /** How many complete life histories to keep for the timeline. */
  samplePaths?: number;
  /** Ablate one channel — used by the attribution pass. */
  skipChannel?: string;
  /** Skip the expensive extras when running an ablation. */
  lean?: boolean;
}

/** The metrics reported as bands over time. */
export const BAND_METRICS = ['netWorth', 'income', 'happiness', 'health', 'stress', 'optionality'] as const;
export type BandMetric = (typeof BAND_METRICS)[number];

export interface BranchResult {
  branchId: string;
  label: string;
  tagline: string;
  /** Channels that actually contributed, for the why panel. */
  channels: { id: string; label: string; why: string; assumptions: string[] }[];
  summaries: Record<OutcomeMetric | 'lifetimeWellbeing', Summary>;
  bands: Record<BandMetric, Band[]>;
  archetypes: ArchetypeShare[];
  utility: UtilityResult;
  /** Share of runs that ran out of liquid assets at some point. */
  ruinRate: number;
  /** Share of runs where the person was laid off at least once. */
  layoffRate: number;
  /** Terminal net worth distribution, for the histogram. */
  netWorthHistogram: HistogramBin[];
  happinessHistogram: HistogramBin[];
  /** Complete histories for the animated timeline. */
  samples: SimPath[];
  /** Raw terminal values, retained so paired comparisons can be recomputed. */
  raw: Record<OutcomeMetric | 'lifetimeWellbeing', Float64Array>;
}

export interface Comparison {
  /** Which branch is being compared against which. */
  branchId: string;
  baselineId: string;
  metric: OutcomeMetric | 'lifetimeWellbeing';
  /** Mean of the paired differences. */
  delta: number;
  /** Median of the paired differences — usually the more honest number. */
  medianDelta: number;
  /** Standard error of the mean difference. */
  stderr: number;
  /** Fraction of paired worlds in which this branch came out ahead. */
  winRate: number;
  /** Delta as a share of the baseline mean, where that is meaningful. */
  relative: number;
}

export interface SimResult {
  decisionId: string;
  question: string;
  horizonYears: number;
  runs: number;
  seed: number;
  branches: BranchResult[];
  /** Every non-baseline branch compared against the baseline, per metric. */
  comparisons: Comparison[];
  baselineId: string;
  /** Wall-clock milliseconds spent simulating. */
  elapsedMs: number;
  /** Snapshot of the twin's starting position, for reference lines. */
  origin: {
    netWorth: number;
    income: number;
    happiness: number;
    health: number;
    stress: number;
    age: number;
  };
}

const OUTCOME_KEYS = [
  'netWorth',
  'income',
  'happiness',
  'health',
  'stress',
  'careerCapital',
  'relationshipQuality',
  'freedom',
  'optionality',
  'lifetimeWellbeing',
] as const;

type OutcomeKey = (typeof OUTCOME_KEYS)[number];

function emptyFlags(): RunOutcome['flags'] {
  return {
    venture: 'none',
    laidOff: false,
    healthShock: false,
    separated: false,
    metSomeone: false,
    endedPartnered: false,
    children: 0,
    unemployedYears: 0,
  };
}

function readFlags(events: SimEvent[], final: SimState): RunOutcome['flags'] {
  const flags = emptyFlags();
  for (const e of events) {
    switch (e.kind) {
      case 'startup-failed':
        flags.venture = 'failed';
        break;
      case 'startup-acquired':
        flags.venture = 'acquired';
        break;
      case 'startup-breakout':
        flags.venture = 'breakout';
        break;
      case 'layoff':
        flags.laidOff = true;
        break;
      case 'health-shock':
        flags.healthShock = true;
        break;
      case 'relationship-ended':
        flags.separated = true;
        break;
      case 'relationship-formed':
        flags.metSomeone = true;
        break;
    }
  }
  flags.endedPartnered = final.partnered;
  flags.children = final.children;
  return flags;
}

/**
 * Run one branch. Returns the per-run outcomes plus the per-year matrices the
 * band charts need.
 */
function runBranch(
  branch: Branch,
  req: SimRequest,
  traitsSeedBase: number,
  horizon: number,
  runs: number,
): {
  outcomes: RunOutcome[];
  byYear: Record<BandMetric, Float64Array[]>;
  samples: SimPath[];
  channels: BranchResult['channels'];
} {
  const options = req.options ?? defaultOptions(getDecision(req.decisionId));
  const { modifiers, applied } = resolveBranch(
    branch,
    { twin: req.twin, params: req.params, options },
    req.skipChannel,
  );

  const sampleCount = req.lean ? 0 : Math.min(req.samplePaths ?? 40, runs);
  // Sample paths are spread across the run index rather than taken from the
  // front, so the timeline shows a fair cross-section rather than the first
  // forty seeds.
  const sampleStride = sampleCount > 0 ? Math.max(1, Math.floor(runs / sampleCount)) : Infinity;

  const outcomes: RunOutcome[] = new Array(runs);
  const byYear = {} as Record<BandMetric, Float64Array[]>;
  for (const m of BAND_METRICS) {
    byYear[m] = Array.from({ length: horizon + 1 }, () => new Float64Array(runs));
  }
  const samples: SimPath[] = [];

  for (let i = 0; i < runs; i++) {
    // The critical line: the run seed depends on the run index and the shared
    // base seed, never on the branch. Every branch replays the same worlds.
    const runSeed = mixSeed(traitsSeedBase, i);
    const streams = makeStreams(runSeed);

    const traits = deriveTraits(req.twin, req.params, streams.traits);
    const state = initialState(req.twin, traits, req.params);
    const ctx = createContext(traits, req.params, modifiers, streams);

    const keepPath = sampleCount > 0 && i % sampleStride === 0 && samples.length < sampleCount;
    const events: SimEvent[] = [];
    ctx.record = events;
    const frames: SimState[] = keepPath ? [{ ...state }] : [];

    applyImmediate(state, ctx);
    if (Object.keys(branch.channels).length > 0 && branch.channels.length > 0) {
      events.push({ t: 0, kind: 'decision', label: branch.label });
    }

    recordYear(byYear, 0, i, state, req.params);

    let unemployedYears = 0;
    for (let year = 1; year <= horizon; year++) {
      step(state, ctx);
      if (state.mode === 'unemployed' && ctx.involuntary) unemployedYears++;
      recordYear(byYear, year, i, state, req.params);
      if (keepPath) frames.push({ ...state });
      if (!state.alive) {
        // Carry the final values forward so the bands stay well-defined.
        for (let fill = year + 1; fill <= horizon; fill++) {
          recordYear(byYear, fill, i, state, req.params);
          if (keepPath) frames.push({ ...state });
        }
        break;
      }
    }

    const flags = readFlags(events, state);
    flags.unemployedYears = unemployedYears;

    outcomes[i] = {
      flags,
      netWorth: netWorth(state),
      income: state.income + state.partnerIncome,
      happiness: state.happiness,
      health: state.health,
      stress: state.stress,
      careerCapital: state.careerCapital,
      relationshipQuality: state.relationshipQuality,
      freedom: financialFreedom(state, req.params),
      optionality: state.optionality,
      lifetimeWellbeing: ctx.wellbeingIntegral,
      worstDrawdown: ctx.worstNetWorth === Infinity ? 0 : ctx.worstNetWorth,
      ranOutOfMoney: ctx.ranOutOfMoney,
      archetype: 'drift',
    };

    if (keepPath) samples.push({ index: i, frames, events });
  }

  return {
    outcomes,
    byYear,
    samples,
    channels: applied.map((c) => ({ id: c.id, label: c.label, why: c.why, assumptions: [...c.assumptions] })),
  };
}

function recordYear(
  byYear: Record<BandMetric, Float64Array[]>,
  year: number,
  run: number,
  s: SimState,
  params: AssumptionValues,
): void {
  byYear.netWorth[year][run] = netWorth(s);
  byYear.income[year][run] = s.income + s.partnerIncome;
  byYear.happiness[year][run] = s.happiness;
  byYear.health[year][run] = s.health;
  byYear.stress[year][run] = s.stress;
  byYear.optionality[year][run] = s.optionality;
  void params;
}

function extract(outcomes: RunOutcome[], key: OutcomeKey): Float64Array {
  const out = new Float64Array(outcomes.length);
  for (let i = 0; i < outcomes.length; i++) out[i] = outcomes[i][key];
  return out;
}

export type ProgressCallback = (done: number, total: number, label: string) => void;

export function simulate(req: SimRequest, onProgress?: ProgressCallback): SimResult {
  const started = Date.now();
  const spec = getDecision(req.decisionId);
  const options = req.options ?? defaultOptions(spec);
  const horizon = Math.max(1, Math.round(req.horizonYears ?? req.params['model.horizonYears']));
  const runs = Math.max(50, Math.round(req.runs ?? req.params['model.runs']));
  const seed = req.seed ?? 20260725;

  const fullReq: SimRequest = { ...req, options, horizonYears: horizon, runs };

  const rawBranches = spec.branches.map((branch, index) => {
    onProgress?.(index, spec.branches.length, branch.label);
    return { branch, ...runBranch(branch, fullReq, seed, horizon, runs) };
  });

  // The baseline is the branch representing "carry on as you are" where one
  // exists; otherwise the first branch. Everything else is measured against it.
  const baseline = rawBranches.find((b) => b.branch.id === 'stay') ?? rawBranches[0];

  const originTraits = deriveTraits(req.twin, req.params, makeStreams(seed).traits);
  const origin = originState(req.twin, originTraits, req.params);

  const classifyRef: ClassifyReference = {
    netWorthReference: median(extract(baseline.outcomes, 'netWorth')),
    happinessReference: origin.happiness,
  };

  const utilityRef: UtilityReference = {
    netWorth: classifyRef.netWorthReference,
    income: origin.income,
    happiness: origin.happiness,
    health: origin.health,
    stress: origin.stress,
    careerCapital: origin.careerCapital,
    relationshipQuality: origin.relationshipQuality,
    freedom: financialFreedom(origin, req.params),
    optionality: origin.optionality,
    lifetimeWellbeing: mean(extract(baseline.outcomes, 'lifetimeWellbeing')),
    wealthScale: Math.max(10000, origin.spend),
  };

  const weights = normaliseValues(req.twin.values);
  // Risk aversion runs opposite to stated risk tolerance, on a 0–1.4 scale.
  const riskAversion = Math.max(0, 1.4 * (1 - req.twin.traits.riskTolerance / 70));

  const branches: BranchResult[] = rawBranches.map(({ branch, outcomes, byYear, samples, channels }) => {
    const raw = {} as Record<OutcomeKey, Float64Array>;
    const summaries = {} as Record<OutcomeKey, Summary>;
    for (const key of OUTCOME_KEYS) {
      raw[key] = extract(outcomes, key);
      summaries[key] = summarise(raw[key]);
    }

    const bandOut = {} as Record<BandMetric, Band[]>;
    for (const m of BAND_METRICS) bandOut[m] = bands(byYear[m]);

    return {
      branchId: branch.id,
      label: branch.label,
      tagline: branch.tagline,
      channels,
      summaries,
      bands: bandOut,
      archetypes: summariseArchetypes(outcomes, classifyRef),
      utility: scoreBranch(outcomes, weights, utilityRef, riskAversion),
      ruinRate: outcomes.reduce((n, o) => n + (o.ranOutOfMoney ? 1 : 0), 0) / Math.max(1, outcomes.length),
      layoffRate: outcomes.reduce((n, o) => n + (o.flags.laidOff ? 1 : 0), 0) / Math.max(1, outcomes.length),
      netWorthHistogram: histogramFor(raw.netWorth, rawBranches.flatMap((b) => [...extract(b.outcomes, 'netWorth')])),
      happinessHistogram: histogram(raw.happiness, 0, 100, 30),
      samples,
      raw,
    };
  });

  const comparisons: Comparison[] = [];
  const baselineResult = branches.find((b) => b.branchId === baseline.branch.id)!;
  for (const branch of branches) {
    if (branch.branchId === baselineResult.branchId) continue;
    for (const key of OUTCOME_KEYS) {
      const { mean: delta, stderr, median: medianDelta } = pairedDelta(branch.raw[key], baselineResult.raw[key]);
      const baseMean = baselineResult.summaries[key].mean;
      comparisons.push({
        branchId: branch.branchId,
        baselineId: baselineResult.branchId,
        metric: key,
        delta,
        medianDelta,
        stderr,
        winRate: pairedWinRate(branch.raw[key], baselineResult.raw[key]),
        relative: Math.abs(baseMean) > 1e-6 ? delta / Math.abs(baseMean) : 0,
      });
    }
  }

  return {
    decisionId: spec.id,
    question: spec.question,
    horizonYears: horizon,
    runs,
    seed,
    branches,
    comparisons,
    baselineId: baselineResult.branchId,
    elapsedMs: Date.now() - started,
    origin: {
      netWorth: netWorth(origin),
      income: origin.income + origin.partnerIncome,
      happiness: origin.happiness,
      health: origin.health,
      stress: origin.stress,
      age: origin.age,
    },
  };
}

function originState(twin: DigitalTwin, traits: TraitVector, params: AssumptionValues): SimState {
  return initialState(twin, traits, params);
}

/** Shared histogram bounds so branches can be overlaid on one axis. */
function histogramFor(values: Float64Array, all: number[]): HistogramBin[] {
  const sorted = Float64Array.from(all).sort();
  // Trim the extreme tail so a single breakout outcome does not compress the
  // entire chart into one bin. The tail is reported in the summary instead.
  const lo = sorted.length ? sorted[Math.floor(sorted.length * 0.005)] : 0;
  const hi = sorted.length ? sorted[Math.floor(sorted.length * 0.98)] : 1;
  const pad = Math.max(1, (hi - lo) * 0.05);
  return histogram(values, lo - pad, hi + pad, 36);
}

function mean(values: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return values.length ? sum / values.length : 0;
}

function median(values: Float64Array): number {
  const sorted = Float64Array.from(values).sort();
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export type { ValueId };
