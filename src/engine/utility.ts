/**
 * Expected utility.
 *
 * This is the only place in Crossroad where the app comes close to scoring one
 * future against another, and it does so strictly against weights the user set
 * themselves. The app never supplies its own opinion about what a good life is.
 *
 * Two properties matter:
 *
 *  - Utility in money is **logarithmic**, not linear. Doubling your wealth is
 *    worth a fixed amount regardless of where you start, which is both the
 *    standard treatment and the reason a strategy with a spectacular mean can
 *    still be a bad idea. Under a linear score the founder branch wins almost
 *    every comparison; under a log score it usually does not.
 *
 *  - The score is computed **per run and then averaged**, never computed on the
 *    averages. Utility of the mean and mean of the utility are very different
 *    numbers when a distribution is skewed, and only the second one answers
 *    the question the user is asking.
 */

import type { OutcomeMetric, RunOutcome, ValueId } from './types';
import { quantileSorted } from './stats';

/**
 * How each stated value maps onto measurable outcomes. Weights within a value
 * sum to one, so raising a value's importance never inflates the total scale.
 */
const VALUE_TO_METRICS: Record<ValueId, Partial<Record<OutcomeMetric | 'lifetimeWellbeing' | 'security', number>>> = {
  wealth: { netWorth: 0.75, income: 0.25 },
  freedom: { optionality: 0.45, freedom: 0.4, stress: 0.15 },
  security: { security: 0.55, freedom: 0.25, stress: 0.2 },
  status: { income: 0.6, careerCapital: 0.4 },
  impact: { careerCapital: 0.7, income: 0.3 },
  creativity: { careerCapital: 0.6, lifetimeWellbeing: 0.4 },
  family: { relationshipQuality: 0.75, lifetimeWellbeing: 0.25 },
  health: { health: 0.8, stress: 0.2 },
  adventure: { optionality: 0.5, lifetimeWellbeing: 0.5 },
  mastery: { careerCapital: 0.8, lifetimeWellbeing: 0.2 },
  community: { relationshipQuality: 0.5, lifetimeWellbeing: 0.5 },
  tranquillity: { stress: 0.6, lifetimeWellbeing: 0.4 },
};

/** Reference points, so every metric is scored as "relative to standing still". */
export interface UtilityReference {
  netWorth: number;
  income: number;
  happiness: number;
  health: number;
  stress: number;
  careerCapital: number;
  relationshipQuality: number;
  freedom: number;
  optionality: number;
  lifetimeWellbeing: number;
  /** Scale for the log-wealth term; roughly a year of spending. */
  wealthScale: number;
}

/** Signed, roughly standardised score for one metric on one run. */
function metricScore(outcome: RunOutcome, metric: string, ref: UtilityReference): number {
  switch (metric) {
    case 'netWorth': {
      // Log utility on wealth, floored so that ruin is very bad but finite.
      const floor = ref.wealthScale * 0.5;
      const a = Math.log(Math.max(floor, outcome.netWorth + ref.wealthScale * 2));
      const b = Math.log(Math.max(floor, ref.netWorth + ref.wealthScale * 2));
      return (a - b) * 8;
    }
    case 'income':
      return (Math.log(Math.max(1000, outcome.income)) - Math.log(Math.max(1000, ref.income))) * 8;
    case 'security':
      // Penalises the depth of the worst moment, not just where you ended up.
      return -Math.max(0, -outcome.worstDrawdown) / Math.max(1, ref.wealthScale) - (outcome.ranOutOfMoney ? 6 : 0);
    case 'health':
      return (outcome.health - ref.health) * 0.22;
    case 'stress':
      return -(outcome.stress - ref.stress) * 0.18;
    case 'careerCapital':
      return (outcome.careerCapital - ref.careerCapital) * 0.16;
    case 'relationshipQuality':
      return (outcome.relationshipQuality - ref.relationshipQuality) * 0.14;
    case 'freedom':
      return (outcome.freedom - ref.freedom) * 0.1;
    case 'optionality':
      return (outcome.optionality - ref.optionality) * 0.14;
    case 'lifetimeWellbeing':
      return (outcome.lifetimeWellbeing - ref.lifetimeWellbeing) * 0.02;
    case 'happiness':
      return (outcome.happiness - ref.happiness) * 0.25;
    default:
      return 0;
  }
}

/** Normalise the user's 0–100 value sliders into weights summing to one. */
export function normaliseValues(values: Record<ValueId, number>): Record<ValueId, number> {
  const entries = Object.entries(values) as [ValueId, number][];
  const total = entries.reduce((sum, [, v]) => sum + Math.max(0, v), 0);
  if (total <= 0) {
    const flat = 1 / entries.length;
    return Object.fromEntries(entries.map(([k]) => [k, flat])) as Record<ValueId, number>;
  }
  return Object.fromEntries(entries.map(([k, v]) => [k, Math.max(0, v) / total])) as Record<ValueId, number>;
}

export function utilityOf(outcome: RunOutcome, weights: Record<ValueId, number>, ref: UtilityReference): number {
  let total = 0;
  for (const [valueId, weight] of Object.entries(weights) as [ValueId, number][]) {
    if (weight <= 0) continue;
    const mapping = VALUE_TO_METRICS[valueId];
    if (!mapping) continue;
    let score = 0;
    for (const [metric, share] of Object.entries(mapping)) {
      score += (share as number) * metricScore(outcome, metric, ref);
    }
    total += weight * score;
  }
  return total;
}

export interface UtilityResult {
  /** Mean utility across runs — the expected utility. */
  expected: number;
  /** Median utility: what a typical run scores. */
  median: number;
  /** The 10th percentile — how bad the bad cases are on your own terms. */
  downside: number;
  p90: number;
  /**
   * Certainty equivalent: the guaranteed outcome you would accept instead of
   * this gamble, expressed back on the utility scale after a risk-aversion
   * penalty proportional to the spread.
   */
  certaintyEquivalent: number;
  /** Share of runs scoring above the reference point. */
  betterThanNow: number;
}

export function scoreBranch(
  outcomes: RunOutcome[],
  weights: Record<ValueId, number>,
  ref: UtilityReference,
  /** 0 = risk neutral, 1 = strongly risk averse. Derived from the twin. */
  riskAversion: number,
): UtilityResult {
  const n = outcomes.length;
  if (n === 0) {
    return { expected: 0, median: 0, downside: 0, p90: 0, certaintyEquivalent: 0, betterThanNow: 0 };
  }
  const scores = new Float64Array(n);
  let sum = 0;
  let better = 0;
  for (let i = 0; i < n; i++) {
    scores[i] = utilityOf(outcomes[i], weights, ref);
    sum += scores[i];
    if (scores[i] > 0) better++;
  }
  const expected = sum / n;
  let variance = 0;
  for (let i = 0; i < n; i++) {
    const d = scores[i] - expected;
    variance += d * d;
  }
  const sd = Math.sqrt(variance / Math.max(1, n - 1));
  const sorted = Float64Array.from(scores).sort();

  // Mean–variance certainty equivalent. Crude next to a full utility
  // transformation, but transparent, and the risk-aversion term is the user's
  // own stated risk tolerance rather than something the app invented.
  const certaintyEquivalent = expected - 0.5 * riskAversion * (sd * sd) / Math.max(1, Math.abs(expected) + sd);

  return {
    expected,
    median: quantileSorted(sorted, 0.5),
    downside: quantileSorted(sorted, 0.1),
    p90: quantileSorted(sorted, 0.9),
    certaintyEquivalent,
    betterThanNow: better / n,
  };
}
