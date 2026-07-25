/**
 * Calibration harness.
 *
 * Runs every decision in the library against the example twin and prints the
 * headline numbers, so a human can look at them and ask whether they are
 * plausible. Automated tests check that the engine is internally consistent;
 * this checks whether it is saying anything sane about the world, which no
 * assertion can do for you.
 *
 *   npm run calibrate
 */

import { defaultAssumptions } from '../src/engine/assumptions';
import { DECISIONS, defaultOptions } from '../src/engine/decisions';
import { simulate } from '../src/engine/monteCarlo';
import { exampleTwin } from '../src/engine/twin';

const twin = exampleTwin();
const params = defaultAssumptions();
const runs = Number(process.env.RUNS ?? 4000);
const horizon = Number(process.env.HORIZON ?? 15);

const gbp = (n: number) =>
  (n < 0 ? '-' : '') +
  '£' +
  Math.abs(n).toLocaleString('en-GB', { maximumFractionDigits: 0 });

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

console.log(`\nCrossroad calibration — ${twin.identity.displayName}, ${twin.identity.age}, ${twin.career.title}`);
console.log(`${runs.toLocaleString()} runs per branch · ${horizon}-year horizon\n`);

let totalMs = 0;

for (const spec of DECISIONS) {
  const result = simulate({
    twin,
    params,
    decisionId: spec.id,
    options: defaultOptions(spec),
    runs,
    horizonYears: horizon,
    samplePaths: 5,
  });
  totalMs += result.elapsedMs;

  console.log(`\x1b[1m${result.question}\x1b[0m  (${result.elapsedMs}ms)`);

  for (const branch of result.branches) {
    const nw = branch.summaries.netWorth;
    const hap = branch.summaries.happiness;
    console.log(
      `  ${branch.label.padEnd(22)} ` +
        `net worth med ${gbp(nw.median).padStart(11)} · mean ${gbp(nw.mean).padStart(11)} · ` +
        `p10 ${gbp(nw.p10).padStart(11)} · p90 ${gbp(nw.p90).padStart(11)}`,
    );
    console.log(
      `  ${''.padEnd(22)} ` +
        `wellbeing ${hap.median.toFixed(1)} (was ${result.origin.happiness.toFixed(1)}) · ` +
        `health ${branch.summaries.health.median.toFixed(0)} · ` +
        `ruin ${pct(branch.ruinRate)} · laid off ${pct(branch.layoffRate)}`,
    );
    const top = branch.archetypes.slice(0, 4).map((a) => `${a.label} ${pct(a.share)}`).join(' · ');
    console.log(`  ${''.padEnd(22)} ${top}`);
  }

  const headline = result.comparisons.filter((c) => c.metric === 'netWorth' || c.metric === 'happiness');
  for (const c of headline) {
    const unit = c.metric === 'netWorth' ? gbp(c.delta) : `${c.delta >= 0 ? '+' : ''}${c.delta.toFixed(1)} pts`;
    const medUnit = c.metric === 'netWorth' ? gbp(c.medianDelta) : `${c.medianDelta.toFixed(1)} pts`;
    console.log(
      `    → ${c.branchId} vs ${c.baselineId}: ${c.metric} mean ${unit} (±${
        c.metric === 'netWorth' ? gbp(1.96 * c.stderr) : (1.96 * c.stderr).toFixed(2)
      }), median ${medUnit}, better in ${pct(c.winRate)} of worlds`,
    );
  }
  console.log('');
}

console.log(`Total simulation time: ${(totalMs / 1000).toFixed(1)}s`);
