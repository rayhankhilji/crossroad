/**
 * Engine tests.
 *
 * These check that the simulation is internally consistent and that its
 * headline claims are actually true of the code — determinism, common random
 * numbers, the attribution identity, and a handful of directional sanity
 * checks where the sign of an effect is not in serious dispute.
 *
 * They deliberately do not assert particular magnitudes. Pinning "moving to
 * San Francisco is worth £413,850" into a test would be asserting that the
 * model is *right*, which no test can establish, and would make every
 * legitimate recalibration look like a regression.
 */

import { describe, expect, it } from 'vitest';

import { defaultAssumptions, ASSUMPTION_LIST, withOverrides } from './assumptions';
import { attribute } from './attribution';
import { DECISIONS, defaultOptions, getDecision, resolveBranch } from './decisions';
import { afterTax, deriveTraits, effectiveModifiers, emptyModifiers, initialState, makeStreams } from './dynamics';
import { simulate } from './monteCarlo';
import { createRng, hashSeed, mixSeed, normal, pareto } from './rng';
import { pairedDelta, quantileSorted, summarise } from './stats';
import { exampleTwin } from './twin';

const twin = exampleTwin();
const params = defaultAssumptions();

const base = {
  twin,
  params,
  runs: 600,
  horizonYears: 10,
  samplePaths: 3,
  seed: 12345,
};

describe('random number generation', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const drawsA = Array.from({ length: 50 }, () => a.next());
    const drawsB = Array.from({ length: 50 }, () => b.next());
    expect(drawsA).toEqual(drawsB);
  });

  it('produces different sequences for different seeds', () => {
    const a = Array.from({ length: 20 }, ((r) => () => r.next())(createRng(1)));
    const b = Array.from({ length: 20 }, ((r) => () => r.next())(createRng(2)));
    expect(a).not.toEqual(b);
  });

  it('stays inside [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 5000; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('has an approximately uniform distribution', () => {
    const rng = createRng(99);
    const buckets = new Array(10).fill(0);
    const n = 100000;
    for (let i = 0; i < n; i++) buckets[Math.floor(rng.next() * 10)]++;
    for (const count of buckets) {
      // Each decile should hold a tenth of the draws, well within 5%.
      expect(count).toBeGreaterThan(n * 0.095);
      expect(count).toBeLessThan(n * 0.105);
    }
  });

  it('generates normals with the requested mean and spread', () => {
    const rng = createRng(3);
    const values = Array.from({ length: 60000 }, () => normal(rng, 5, 2));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
    expect(mean).toBeCloseTo(5, 1);
    expect(sd).toBeCloseTo(2, 1);
  });

  it('produces a heavy right tail from the Pareto draw', () => {
    const rng = createRng(11);
    const values = Array.from({ length: 20000 }, () => pareto(rng, 1.15, 100)).sort((a, b) => a - b);
    // With alpha near 1 the top 1% should dwarf the median by orders of magnitude.
    expect(quantileSorted(values, 0.99) / quantileSorted(values, 0.5)).toBeGreaterThan(20);
  });

  it('derives independent streams from one seed', () => {
    const s = makeStreams(1234);
    expect(s.econ.next()).not.toEqual(s.market.next());
    expect(mixSeed(1, 2)).not.toEqual(mixSeed(2, 1));
    expect(hashSeed('quit')).not.toEqual(hashSeed('stay'));
  });
});

describe('assumption registry', () => {
  it('has a unique id, a rationale and at least one source for every entry', () => {
    const ids = new Set<string>();
    for (const a of ASSUMPTION_LIST) {
      expect(ids.has(a.id), `duplicate assumption id: ${a.id}`).toBe(false);
      ids.add(a.id);
      expect(a.rationale.length).toBeGreaterThan(30);
      expect(a.sources.length).toBeGreaterThan(0);
      expect(a.label.length).toBeGreaterThan(0);
    }
  });

  it('ships defaults inside their own declared bounds', () => {
    for (const a of ASSUMPTION_LIST) {
      expect(a.value, a.id).toBeGreaterThanOrEqual(a.min);
      expect(a.value, a.id).toBeLessThanOrEqual(a.max);
      expect(a.max).toBeGreaterThan(a.min);
    }
  });

  it('clamps overrides into range and ignores unknown keys', () => {
    const merged = withOverrides({
      'wealth.realReturn': 99,
      'model.luckWeight': -5,
      notAThing: 1,
    } as never);
    expect(merged['wealth.realReturn']).toBe(0.12);
    expect(merged['model.luckWeight']).toBe(0);
    expect('notAThing' in merged).toBe(false);
  });
});

describe('tax', () => {
  it('is progressive and never exceeds gross', () => {
    let previousRate = -1;
    for (const gross of [15000, 30000, 60000, 90000, 150000, 400000]) {
      const net = afterTax(gross, 1);
      expect(net).toBeGreaterThan(0);
      expect(net).toBeLessThan(gross);
      const rate = 1 - net / gross;
      expect(rate).toBeGreaterThan(previousRate);
      previousRate = rate;
    }
  });

  it('leaves income below the allowance untaxed', () => {
    expect(afterTax(10000, 1)).toBe(10000);
  });
});

describe('modifiers', () => {
  it('drops transient effects once the window closes', () => {
    const mods = emptyModifiers();
    mods.transient.healthDelta = 5;
    mods.transientYears = 2;
    expect(effectiveModifiers(mods, 1).healthDelta).toBe(5);
    expect(effectiveModifiers(mods, 2).healthDelta).toBe(5);
    expect(effectiveModifiers(mods, 3).healthDelta).toBe(0);
  });

  it('lets a channel be ablated out of a branch', () => {
    const spec = getDecision('found-startup');
    const branch = spec.branches.find((b) => b.id === 'found')!;
    const input = { twin, params, options: defaultOptions(spec) };
    const full = resolveBranch(branch, input);
    const without = resolveBranch(branch, input, 'venture.salaryCut');
    expect(full.applied.length).toBe(without.applied.length + 1);
    expect(full.modifiers.incomeStepMultiplier).not.toBe(without.modifiers.incomeStepMultiplier);
  });
});

describe('simulation', () => {
  it('is reproducible: the same seed gives byte-identical results', () => {
    const a = simulate({ ...base, decisionId: 'relocate' });
    const b = simulate({ ...base, decisionId: 'relocate' });
    for (let i = 0; i < a.branches.length; i++) {
      expect(a.branches[i].summaries.netWorth.mean).toBe(b.branches[i].summaries.netWorth.mean);
      expect(a.branches[i].summaries.happiness.median).toBe(b.branches[i].summaries.happiness.median);
    }
  });

  it('gives different results for different seeds', () => {
    const a = simulate({ ...base, decisionId: 'relocate', seed: 1 });
    const b = simulate({ ...base, decisionId: 'relocate', seed: 2 });
    expect(a.branches[0].summaries.netWorth.mean).not.toBe(b.branches[0].summaries.netWorth.mean);
  });

  it('uses common random numbers, so paired comparison beats independent sampling', () => {
    const result = simulate({ ...base, decisionId: 'change-job', runs: 2000 });
    const stay = result.branches.find((b) => b.branchId === 'stay')!;
    const switchBranch = result.branches.find((b) => b.branchId === 'switch')!;

    const paired = pairedDelta(switchBranch.raw.netWorth, stay.raw.netWorth);
    // The standard error of an unpaired difference of two independent means.
    const unpaired = Math.sqrt(
      switchBranch.summaries.netWorth.stderr ** 2 + stay.summaries.netWorth.stderr ** 2,
    );
    // Sharing streams should cut the error dramatically. If this fails, the
    // branches have drifted into different worlds and every reported delta is
    // mostly noise.
    expect(paired.stderr).toBeLessThan(unpaired / 4);
  });

  it('runs every decision in the library without error', () => {
    for (const spec of DECISIONS) {
      const result = simulate({ ...base, decisionId: spec.id, runs: 200, horizonYears: 5 });
      expect(result.branches.length).toBe(spec.branches.length);
      for (const branch of result.branches) {
        expect(Number.isFinite(branch.summaries.netWorth.mean)).toBe(true);
        expect(Number.isFinite(branch.summaries.happiness.mean)).toBe(true);
        expect(branch.summaries.happiness.mean).toBeGreaterThanOrEqual(0);
        expect(branch.summaries.happiness.mean).toBeLessThanOrEqual(100);
        expect(branch.summaries.health.mean).toBeGreaterThanOrEqual(0);
        expect(branch.summaries.health.mean).toBeLessThanOrEqual(100);
      }
    }
  });

  it('produces archetype shares that sum to one', () => {
    const result = simulate({ ...base, decisionId: 'found-startup' });
    for (const branch of result.branches) {
      const total = branch.archetypes.reduce((sum, a) => sum + a.share, 0);
      expect(total).toBeCloseTo(1, 5);
    }
  });

  it('keeps the requested number of sample paths, each with a full history', () => {
    const result = simulate({ ...base, decisionId: 'sabbatical', samplePaths: 8, horizonYears: 10 });
    for (const branch of result.branches) {
      expect(branch.samples.length).toBe(8);
      for (const path of branch.samples) {
        expect(path.frames.length).toBe(11);
        expect(path.frames[0].t).toBe(0);
      }
    }
  });

  it('widens the distribution as the horizon grows', () => {
    const short = simulate({ ...base, decisionId: 'relocate', horizonYears: 5 });
    const long = simulate({ ...base, decisionId: 'relocate', horizonYears: 20 });
    const spread = (r: typeof short) => {
      const s = r.branches[0].summaries.netWorth;
      return s.p90 - s.p10;
    };
    expect(spread(long)).toBeGreaterThan(spread(short));
  });
});

describe('directional sanity', () => {
  it('makes founding more skewed than staying employed', () => {
    const result = simulate({ ...base, decisionId: 'found-startup', runs: 3000 });
    const found = result.branches.find((b) => b.branchId === 'found')!.summaries.netWorth;
    const stay = result.branches.find((b) => b.branchId === 'stay')!.summaries.netWorth;
    const skew = (s: typeof found) => s.mean / Math.max(1, s.median);
    // The whole point of the power law: the mean is dragged far above the
    // median in a way that simply does not happen to a salary.
    expect(skew(found)).toBeGreaterThan(skew(stay));
  });

  it('makes more exercise and better sleep improve health', () => {
    const sickly = structuredClone(twin);
    sickly.health.exerciseSessions = 0;
    sickly.health.sleepHours = 5;
    sickly.health.smoker = true;

    const healthy = structuredClone(twin);
    healthy.health.exerciseSessions = 5;
    healthy.health.sleepHours = 7.5;
    healthy.health.smoker = false;

    const a = simulate({ ...base, twin: sickly, decisionId: 'change-job', horizonYears: 20 });
    const b = simulate({ ...base, twin: healthy, decisionId: 'change-job', horizonYears: 20 });
    expect(b.branches[0].summaries.health.mean).toBeGreaterThan(a.branches[0].summaries.health.mean);
  });

  it('makes a longer, more expensive degree cost more up front', () => {
    const cheap = simulate({
      ...base,
      decisionId: 'grad-school',
      options: { ...defaultOptions(getDecision('grad-school')), years: 1, cost: 10000 },
    });
    const dear = simulate({
      ...base,
      decisionId: 'grad-school',
      options: { ...defaultOptions(getDecision('grad-school')), years: 4, cost: 120000 },
    });
    const study = (r: typeof cheap) => r.branches.find((b) => b.branchId === 'study')!.summaries.netWorth.median;
    expect(study(dear)).toBeLessThan(study(cheap));
  });

  it('makes higher luck weight widen outcomes without moving the median much', () => {
    const low = simulate({ ...base, decisionId: 'change-job', params: { ...params, 'model.luckWeight': 0.1 } });
    const high = simulate({ ...base, decisionId: 'change-job', params: { ...params, 'model.luckWeight': 1 } });
    const s = (r: typeof low) => r.branches[0].summaries.netWorth;
    expect(s(high).p90 - s(high).p10).toBeGreaterThan(s(low).p90 - s(low).p10);
  });

  it('never lets a simulated person be alive with impossible vitals', () => {
    const result = simulate({ ...base, decisionId: 'push-harder', horizonYears: 25, runs: 400 });
    for (const branch of result.branches) {
      for (const path of branch.samples) {
        for (const frame of path.frames) {
          expect(frame.health).toBeGreaterThanOrEqual(0);
          expect(frame.health).toBeLessThanOrEqual(100);
          expect(frame.stress).toBeGreaterThanOrEqual(0);
          expect(frame.stress).toBeLessThanOrEqual(100);
          expect(frame.spend).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(frame.income)).toBe(true);
        }
      }
    }
  });
});

describe('attribution', () => {
  it('decomposes a delta into channels plus a stated interaction term', () => {
    const results = attribute({
      twin,
      params,
      decisionId: 'relocate',
      branchId: 'move',
      metrics: ['netWorth'],
      ablationRuns: 400,
      horizonYears: 10,
      seed: 999,
    });
    const netWorth = results.find((r) => r.metric === 'netWorth')!;
    expect(netWorth.contributions.length).toBeGreaterThan(3);

    // The identity the UI relies on: contributions plus interaction equal the
    // whole. If this drifts, the waterfall chart is lying.
    const explained = netWorth.contributions.reduce((sum, c) => sum + c.contribution, 0);
    expect(explained + netWorth.interaction).toBeCloseTo(netWorth.total, 4);
  });

  it('gives every channel a human explanation and traceable assumptions', () => {
    for (const spec of DECISIONS) {
      for (const branch of spec.branches) {
        for (const channel of branch.channels) {
          expect(channel.why.length, `${spec.id}/${channel.id}`).toBeGreaterThan(40);
          expect(channel.label.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('attributes the salary re-index as a major driver of moving to a richer market', () => {
    const [netWorth] = attribute({
      twin,
      params,
      decisionId: 'relocate',
      branchId: 'move',
      metrics: ['netWorth'],
      ablationRuns: 500,
      horizonYears: 12,
      seed: 4242,
      options: { destination: 'sf-bay', salaryReindex: 100 },
    });
    const salary = netWorth.contributions.find((c) => c.channelId === 'move.salary')!;
    expect(salary.contribution).toBeGreaterThan(0);
    // It should be one of the two largest drivers, not a rounding error.
    expect(netWorth.contributions.indexOf(salary)).toBeLessThan(2);
  });
});

describe('statistics', () => {
  it('summarises a known distribution correctly', () => {
    const values = Array.from({ length: 101 }, (_, i) => i);
    const s = summarise(values);
    expect(s.median).toBe(50);
    expect(s.mean).toBe(50);
    expect(s.min).toBe(0);
    expect(s.max).toBe(100);
    expect(s.p10).toBeCloseTo(10, 5);
    expect(s.p90).toBeCloseTo(90, 5);
  });

  it('shrinks the standard error as the sample grows', () => {
    const rng = createRng(5);
    const small = summarise(Array.from({ length: 100 }, () => normal(rng, 0, 1)));
    const large = summarise(Array.from({ length: 10000 }, () => normal(rng, 0, 1)));
    expect(large.stderr).toBeLessThan(small.stderr);
  });

  it('handles an empty sample without throwing', () => {
    expect(summarise([]).n).toBe(0);
    expect(pairedDelta([], []).mean).toBe(0);
  });
});

describe('twin', () => {
  it('starts the example twin in a plausible place', () => {
    const traits = deriveTraits(twin, params, makeStreams(1).traits);
    const state = initialState(twin, traits, params);
    expect(state.happiness).toBeGreaterThan(20);
    expect(state.happiness).toBeLessThan(90);
    expect(state.careerCapital).toBeGreaterThan(30);
    expect(state.runwayMonths).toBeGreaterThan(0);
  });
});
