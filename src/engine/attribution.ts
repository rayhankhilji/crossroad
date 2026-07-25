/**
 * Attribution: turning a number into an explanation.
 *
 * The headline of a result is a difference — "+£4.1m", "−12% on relationship
 * quality". This module decomposes that difference into the channels that
 * produced it, by the most direct method available: switch a channel off,
 * re-run the whole simulation, and see how much of the difference disappears.
 *
 * That is a **leave-one-out** decomposition, and it is worth being precise
 * about what it does and does not give you:
 *
 *   - It measures each channel's *marginal* contribution given that all the
 *     others are present. That is the right question when you are asking
 *     "where did this number come from?".
 *   - The contributions do not add up to the total, because the channels
 *     interact — a salary uplift and a cost-of-living increase are not
 *     independent once compounding is involved. The gap is reported openly as
 *     an interaction term rather than smeared across the channels to make the
 *     arithmetic look tidy.
 *   - A full Shapley decomposition would allocate the interactions fairly, but
 *     it costs 2^n simulations. With ten channels that is a thousand runs of
 *     ten thousand lives. Leave-one-out costs n+1 and answers the question
 *     people actually ask.
 *
 * Ablation runs use the same seed as the headline run, so they inherit common
 * random numbers and the differences they measure are signal rather than noise.
 */

import { ASSUMPTIONS, type AssumptionId } from './assumptions';
import { simulate, type SimRequest, type SimResult } from './monteCarlo';
import { getDecision } from './decisions';
import { pairedDelta } from './stats';
import type { OutcomeMetric } from './types';

export type AttributionMetric = OutcomeMetric | 'lifetimeWellbeing';

export interface ChannelContribution {
  channelId: string;
  label: string;
  why: string;
  assumptions: string[];
  /** How much of the total delta this channel is responsible for. */
  contribution: number;
  /** Share of the absolute total, 0–1, for the waterfall widths. */
  share: number;
  /** Monte Carlo standard error on the contribution. */
  stderr: number;
}

export interface Attribution {
  branchId: string;
  metric: AttributionMetric;
  /** The full paired difference against the baseline. */
  total: number;
  contributions: ChannelContribution[];
  /**
   * What the channels do not explain on their own: the compounding and
   * feedback between them. A large interaction term is informative, not
   * embarrassing — it means the channels are not separable and the decision
   * has to be judged whole.
   */
  interaction: number;
  /** How many runs each ablation used. */
  runsPerAblation: number;
}

export interface AttributionRequest extends SimRequest {
  branchId: string;
  metrics?: AttributionMetric[];
  /** Ablations are cheaper than the headline run; this is how much cheaper. */
  ablationRuns?: number;
  onProgress?: (done: number, total: number, label: string) => void;
}

/**
 * Compute leave-one-out attribution for one branch across several metrics.
 *
 * Cost is one simulation per channel plus one reference simulation, all at
 * `ablationRuns`. With eight channels and 2,500 runs that is 22,500 simulated
 * lives, which takes a couple of seconds in a worker.
 */
export function attribute(req: AttributionRequest): Attribution[] {
  const spec = getDecision(req.decisionId);
  const branch = spec.branches.find((b) => b.id === req.branchId);
  if (!branch) throw new Error(`Unknown branch: ${req.branchId}`);

  const metrics: AttributionMetric[] = req.metrics ?? ['netWorth', 'happiness', 'health', 'stress', 'careerCapital'];
  const runs = req.ablationRuns ?? Math.min(3000, Math.round((req.runs ?? req.params['model.runs']) / 3));

  const baseRequest: SimRequest = { ...req, runs, samplePaths: 0, lean: true };

  // The reference: every channel present, at the ablation run count.
  const total = simulate(baseRequest);
  const totals = new Map<AttributionMetric, { delta: number; stderr: number }>();
  for (const metric of metrics) {
    const d = deltaFor(total, req.branchId, metric);
    totals.set(metric, d);
  }

  const channels = branch.channels;
  const perChannel = new Map<string, Map<AttributionMetric, { delta: number; stderr: number }>>();

  channels.forEach((channel, index) => {
    req.onProgress?.(index, channels.length, channel.label);
    const ablated = simulate({ ...baseRequest, skipChannel: channel.id });
    const map = new Map<AttributionMetric, { delta: number; stderr: number }>();
    for (const metric of metrics) map.set(metric, deltaFor(ablated, req.branchId, metric));
    perChannel.set(channel.id, map);
  });

  return metrics.map((metric) => {
    const full = totals.get(metric)!;
    const contributions: ChannelContribution[] = channels.map((channel) => {
      const without = perChannel.get(channel.id)!.get(metric)!;
      const contribution = full.delta - without.delta;
      return {
        channelId: channel.id,
        label: channel.label,
        why: channel.why,
        assumptions: [...channel.assumptions],
        contribution,
        share: 0,
        // Two independent-ish estimates subtracted: errors add in quadrature.
        stderr: Math.sqrt(full.stderr * full.stderr + without.stderr * without.stderr),
      };
    });

    const absTotal = contributions.reduce((sum, c) => sum + Math.abs(c.contribution), 0);
    for (const c of contributions) c.share = absTotal > 0 ? Math.abs(c.contribution) / absTotal : 0;
    contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

    const explained = contributions.reduce((sum, c) => sum + c.contribution, 0);

    return {
      branchId: req.branchId,
      metric,
      total: full.delta,
      contributions,
      interaction: full.delta - explained,
      runsPerAblation: runs,
    };
  });
}

/** The paired difference between a branch and the baseline for one metric. */
function deltaFor(result: SimResult, branchId: string, metric: AttributionMetric): { delta: number; stderr: number } {
  const branch = result.branches.find((b) => b.branchId === branchId);
  const baseline = result.branches.find((b) => b.branchId === result.baselineId);
  if (!branch || !baseline || branch === baseline) return { delta: 0, stderr: 0 };
  const { mean, stderr } = pairedDelta(branch.raw[metric], baseline.raw[metric]);
  return { delta: mean, stderr };
}

/**
 * Sensitivity: how much a single assumption moves the headline.
 *
 * Complements attribution. Attribution answers "which mechanism produced this
 * number?"; sensitivity answers "how much should I trust it, given that the
 * number underneath is itself a guess?". A result that flips sign when a
 * low-confidence assumption is nudged within its plausible range is a result
 * that should be presented as a coin toss, and this is how the app knows to
 * say so.
 */
export interface SensitivityPoint {
  assumptionId: string;
  label: string;
  /** The delta when the assumption is at the low end of its plausible range. */
  low: number;
  /** …and at the high end. */
  high: number;
  atDefault: number;
  /** True when the sign of the headline flips across the range. */
  flipsSign: boolean;
}

export interface SensitivityRequest extends SimRequest {
  branchId: string;
  metric: AttributionMetric;
  assumptionIds: string[];
  /** How far to perturb, as a fraction of the assumption's full range. */
  spread?: number;
  runs?: number;
}

export function sensitivity(req: SensitivityRequest): SensitivityPoint[] {
  const runs = req.runs ?? 1500;
  const base = simulate({ ...req, runs, samplePaths: 0, lean: true });
  const atDefault = deltaFor(base, req.branchId, req.metric).delta;

  return req.assumptionIds.map((rawId) => {
    const id = rawId as AssumptionId;
    const spec = ASSUMPTIONS[id];
    const current = req.params[id] ?? spec?.value ?? 0;
    const span = spec ? (spec.max - spec.min) * (req.spread ?? 0.15) : Math.abs(current) * 0.25;
    const lowValue = spec ? Math.max(spec.min, current - span) : current - span;
    const highValue = spec ? Math.min(spec.max, current + span) : current + span;

    const low = deltaFor(
      simulate({ ...req, runs, samplePaths: 0, lean: true, params: { ...req.params, [id]: lowValue } }),
      req.branchId,
      req.metric,
    ).delta;
    const high = deltaFor(
      simulate({ ...req, runs, samplePaths: 0, lean: true, params: { ...req.params, [id]: highValue } }),
      req.branchId,
      req.metric,
    ).delta;

    return {
      assumptionId: id,
      label: spec?.label ?? id,
      low,
      high,
      atDefault,
      flipsSign: Math.sign(low) !== Math.sign(high) && low !== 0 && high !== 0,
    };
  });
}
