/**
 * Results.
 *
 * The order of this screen is an argument. It opens with the paired win rate —
 * "in what fraction of identical worlds did this leave you better off" — and
 * not with the mean, because the mean is the number most likely to mislead on
 * exactly the decisions people care most about.
 *
 * Then the tree, so the futures have shapes and names. Then the fan, so the
 * uncertainty is unavoidable. Then attribution, so the headline can be taken
 * apart. Then individual lives, because no real future looks like a median.
 */

import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';

import type { Attribution } from '../../engine/attribution';
import { getDecision } from '../../engine/decisions';
import type { BranchResult, SimResult } from '../../engine/monteCarlo';
import { useApp } from '../../state/store';
import { DecisionTree } from '../charts/DecisionTree';
import { DistributionChart } from '../charts/Distribution';
import { FanChart } from '../charts/FanChart';
import { branchPalette } from '../charts/kit';
import { Timeline } from '../charts/Timeline';
import { Waterfall } from '../charts/Waterfall';
import {
  betterRate,
  count,
  isGood,
  METRIC_BLURBS,
  METRIC_LABELS,
  metricDelta,
  metricValue,
  money,
  percent,
} from '../format';
import { Button, Empty, Panel, Progress, Segmented, Stat, Tag, Why } from '../primitives';
import './results.css';

const HEADLINE_METRICS = ['netWorth', 'happiness', 'health', 'stress', 'careerCapital', 'optionality'] as const;

export function Results() {
  const result = useApp((s) => s.result);
  const attribution = useApp((s) => s.attribution);
  const running = useApp((s) => s.running);
  const progress = useApp((s) => s.progress);
  const error = useApp((s) => s.error);
  const go = useApp((s) => s.go);
  const run = useApp((s) => s.run);
  const cancel = useApp((s) => s.cancel);
  const twin = useApp((s) => s.twin);
  const focusBranchId = useApp((s) => s.focusBranchId);
  const focusBranch = useApp((s) => s.focusBranch);

  const currency = twin.finance.currency;

  if (running) return <RunningState progress={progress} onCancel={cancel} />;

  if (error) {
    return (
      <div className="results">
        <Empty title="The simulation failed">
          <p>{error}</p>
          <div style={{ marginTop: 'var(--s-4)' }}>
            <Button onClick={run}>Try again</Button>
          </div>
        </Empty>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="results">
        <Empty title="Nothing simulated yet">
          <p>Pick a question and run it. Every branch gets ten thousand futures.</p>
          <div style={{ marginTop: 'var(--s-4)' }}>
            <Button variant="primary" onClick={() => go('ask')}>
              Choose a question
            </Button>
          </div>
        </Empty>
      </div>
    );
  }

  return <ResultsBody result={result} attribution={attribution} currency={currency} focusBranchId={focusBranchId} onFocus={focusBranch} />;
}

function RunningState({ progress, onCancel }: { progress: { phase: string; done: number; total: number; label: string } | null; onCancel: () => void }) {
  const fraction = progress && progress.total > 0 ? progress.done / progress.total : 0;
  return (
    <div className="results results--running">
      <div className="running">
        <div className="eyebrow">
          {progress?.phase === 'explaining' ? 'Working out why' : 'Simulating'}
        </div>
        <h2 className="display running__title">
          {progress?.phase === 'explaining'
            ? 'Switching each mechanism off to see what it was worth'
            : 'Running your life forward, ten thousand times'}
        </h2>
        <p className="running__label">{progress?.label ?? 'Starting'}</p>
        <Progress value={fraction} />
        <div className="running__note">
          {progress?.phase === 'explaining'
            ? 'Each mechanism gets its own full re-simulation with that one channel disabled. The difference is what it contributed.'
            : 'Every branch replays the same worlds — the same crashes, the same illnesses, the same luck — so only the decision differs.'}
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Stop
        </Button>
      </div>
    </div>
  );
}

function ResultsBody({
  result,
  attribution,
  currency,
  focusBranchId,
  onFocus,
}: {
  result: SimResult;
  attribution: Attribution[] | null;
  currency: string;
  focusBranchId: string | null;
  onFocus: (id: string | null) => void;
}) {
  const go = useApp((s) => s.go);
  const [fanMetric, setFanMetric] = useState<string>('netWorth');

  const spec = getDecision(result.decisionId);
  const baseline = result.branches.find((b) => b.branchId === result.baselineId)!;
  const alternatives = result.branches.filter((b) => b.branchId !== result.baselineId);
  const focus = alternatives.find((b) => b.branchId === focusBranchId) ?? alternatives[0] ?? baseline;

  const comparisonsFor = (branchId: string) =>
    Object.fromEntries(
      result.comparisons.filter((c) => c.branchId === branchId).map((c) => [c.metric, c]),
    );

  const focusComparisons = comparisonsFor(focus.branchId);
  const palette = branchPalette(result.branches.map((b) => b.branchId), result.baselineId);

  const fanFormat = useMemo(
    () => (value: number) => metricValue(fanMetric, value, currency),
    [fanMetric, currency],
  );

  return (
    <div className="results">
      <header className="results__header">
        <div className="results__header-text">
          <div className="eyebrow">{count(result.runs)} futures per branch · {result.horizonYears}-year horizon</div>
          <h1 className="display results__title">{result.question}</h1>
        </div>
        <div className="results__header-actions">
          <Button variant="ghost" onClick={() => go('assumptions')}>
            Assumptions
          </Button>
          <Button onClick={() => go('ask')}>Change the question</Button>
        </div>
      </header>

      {/* -- The honest headline ------------------------------------------- */}
      <section className="results__verdict">
        {alternatives.map((branch, i) => {
          const comparisons = comparisonsFor(branch.branchId);
          const wealth = comparisons.netWorth;
          const wellbeing = comparisons.happiness;
          if (!wealth || !wellbeing) return null;

          return (
            <motion.button
              key={branch.branchId}
              className={`verdict${branch.branchId === focus.branchId ? ' is-focus' : ''}`}
              onClick={() => onFocus(branch.branchId)}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="verdict__head">
                <span className="verdict__swatch" style={{ background: palette[branch.branchId] }} />
                <span className="verdict__label">{branch.label}</span>
                <span className="verdict__vs">vs {baseline.label}</span>
              </div>

              <div className="verdict__primary">
                <span className="display verdict__winrate num">{percent(wealth.winRate)}</span>
                <span className="verdict__winrate-caption">
                  of identical worlds left you financially better off
                </span>
              </div>

              <div className="verdict__pair">
                <div>
                  <span className="verdict__key">Typical difference in net worth</span>
                  <span className={`num verdict__val ${wealth.medianDelta >= 0 ? 'is-good' : 'is-bad'}`}>
                    {money(wealth.medianDelta, currency, { sign: true })}
                  </span>
                  <span className="verdict__note">median of the paired differences</span>
                </div>
                <div>
                  <span className="verdict__key">Average difference</span>
                  <span className="num verdict__val verdict__val--muted">
                    {money(wealth.delta, currency, { sign: true })}
                  </span>
                  <span className="verdict__note">
                    ±{money(1.96 * wealth.stderr, currency)} at 95%
                  </span>
                </div>
              </div>

              {Math.abs(wealth.delta) > Math.abs(wealth.medianDelta) * 2.5 && (
                <div className="verdict__skew">
                  The average is {Math.round(Math.abs(wealth.delta / Math.max(1, Math.abs(wealth.medianDelta))))}×
                  the typical case. A handful of enormous outcomes are carrying it — read the median.
                </div>
              )}

              <div className="verdict__wellbeing">
                <span className="verdict__key">Wellbeing</span>
                <span className={`num ${isGood('happiness', wellbeing.medianDelta) ? 'is-good' : 'is-bad'}`}>
                  {metricDelta('happiness', wellbeing.medianDelta)}
                </span>
                <span className="verdict__note">better in {percent(wellbeing.winRate)} of worlds</span>
              </div>
            </motion.button>
          );
        })}
      </section>

      {/* -- Metric strip --------------------------------------------------- */}
      <section className="results__metrics">
        {HEADLINE_METRICS.map((metric) => {
          const comparison = focusComparisons[metric];
          if (!comparison) return null;
          const good = isGood(metric, comparison.medianDelta);
          const noisy = Math.abs(comparison.delta) < 1.96 * comparison.stderr;
          return (
            <div key={metric} className="results__metric">
              <Stat
                size="sm"
                label={METRIC_LABELS[metric]}
                value={noisy ? '≈ no change' : metricDelta(metric, comparison.medianDelta, currency)}
                tone={noisy ? 'neutral' : good ? 'good' : 'bad'}
                sub={
                  noisy
                    ? 'within the noise of the simulation'
                    : `better in ${percent(betterRate(metric, comparison.winRate))} of worlds`
                }
                why={
                  <Why title={METRIC_LABELS[metric]}>
                    <p>{METRIC_BLURBS[metric]}</p>
                    <p>
                      Computed as the median of the paired differences: for each of {count(result.runs)} simulated
                      worlds, the value under <strong>{focus.label}</strong> minus the value under{' '}
                      <strong>{baseline.label}</strong>, then the middle of those differences.
                    </p>
                    <p>
                      Mean difference {metricDelta(metric, comparison.delta, currency)}, with a 95% interval of ±
                      {metricValue(metric, 1.96 * comparison.stderr, currency)}.
                      {noisy && ' That interval spans zero, so this result is indistinguishable from no effect.'}
                    </p>
                  </Why>
                }
              />
            </div>
          );
        })}
      </section>

      {/* -- The tree ------------------------------------------------------- */}
      <Panel padded={false} className="results__panel">
        <div className="results__panel-inner">
          <DecisionTree
            branches={result.branches.map((b) => ({
              branchId: b.branchId,
              label: b.label,
              tagline: b.tagline,
              archetypes: b.archetypes,
            }))}
            baselineId={result.baselineId}
            question={result.question}
            format={(v) => money(v, currency)}
            height={Math.max(420, result.branches.length * 210)}
          />
        </div>
      </Panel>

      {/* -- Fan ------------------------------------------------------------ */}
      <Panel padded={false} className="results__panel">
        <div className="results__panel-inner">
          <div className="results__toolbar">
            <Segmented
              size="sm"
              value={fanMetric}
              options={[
                { value: 'netWorth', label: 'Net worth' },
                { value: 'happiness', label: 'Wellbeing' },
                { value: 'health', label: 'Health' },
                { value: 'income', label: 'Income' },
                { value: 'stress', label: 'Stress' },
                { value: 'optionality', label: 'Optionality' },
              ]}
              onChange={setFanMetric}
            />
          </div>
          <FanChart
            series={result.branches.map((b) => ({
              branchId: b.branchId,
              label: b.label,
              bands: b.bands[fanMetric as keyof typeof b.bands],
            }))}
            baselineId={result.baselineId}
            format={fanFormat}
            scaleKind={fanMetric === 'netWorth' ? 'symlog' : 'linear'}
            originValue={
              fanMetric === 'netWorth'
                ? result.origin.netWorth
                : fanMetric === 'happiness'
                  ? result.origin.happiness
                  : fanMetric === 'health'
                    ? result.origin.health
                    : fanMetric === 'income'
                      ? result.origin.income
                      : fanMetric === 'stress'
                        ? result.origin.stress
                        : undefined
            }
            title={`${METRIC_LABELS[fanMetric]} over ${result.horizonYears} years`}
            caption="Dark band: the middle half of futures. Light band: eight in ten. The line is the median — and no individual future looks like it."
            height={360}
          />
        </div>
      </Panel>

      {/* -- Distribution --------------------------------------------------- */}
      <div className="results__pair">
        <Panel padded={false} className="results__panel">
          <div className="results__panel-inner">
            <DistributionChart
              series={result.branches.map((b) => ({
                branchId: b.branchId,
                label: b.label,
                bins: b.netWorthHistogram,
                summary: b.summaries.netWorth,
              }))}
              baselineId={result.baselineId}
              format={(v) => money(v, currency)}
              title={`Where net worth lands after ${result.horizonYears} years`}
              caption="The top 2% of outcomes are trimmed from the axis so a single breakout does not flatten everything else into one bar. They are still in the summary statistics."
            />
          </div>
        </Panel>

        <Panel padded={false} className="results__panel">
          <div className="results__panel-inner">
            <DistributionChart
              series={result.branches.map((b) => ({
                branchId: b.branchId,
                label: b.label,
                bins: b.happinessHistogram,
                summary: b.summaries.happiness,
              }))}
              baselineId={result.baselineId}
              format={(v) => v.toFixed(0)}
              title="Where wellbeing lands"
              caption="On the 0–100 scale. Note how much narrower this is than the money — wellbeing is anchored by disposition, and that anchor is strong."
            />
          </div>
        </Panel>
      </div>

      {/* -- Risk ----------------------------------------------------------- */}
      <Panel eyebrow="The downside" title="What the bad cases look like">
        <div className="results__risk">
          {result.branches.map((branch) => (
            <div key={branch.branchId} className="risk">
              <div className="risk__head">
                <span className="risk__swatch" style={{ background: palette[branch.branchId] }} />
                {branch.label}
              </div>
              <div className="risk__stats">
                <Stat
                  size="sm"
                  label="Worst tenth of futures"
                  value={money(branch.summaries.netWorth.p10, currency)}
                  sub="net worth at the 10th percentile"
                />
                <Stat
                  size="sm"
                  label="Ran out of money"
                  value={percent(branch.ruinRate, 1)}
                  tone={branch.ruinRate > 0.1 ? 'bad' : 'neutral'}
                  sub="savings hit zero at some point"
                />
                <Stat
                  size="sm"
                  label="Lost a job"
                  value={percent(branch.layoffRate, 0)}
                  sub="at least one involuntary separation"
                />
                <Stat
                  size="sm"
                  label="Scored against your values"
                  value={branch.utility.expected.toFixed(1)}
                  tone={branch.utility.expected > 0 ? 'good' : branch.utility.expected < 0 ? 'bad' : 'neutral'}
                  sub={`better than today in ${percent(branch.utility.betterThanNow)} of runs`}
                  why={
                    <Why title="Scored against your values">
                      <p>
                        This is the only place the app comes close to ranking options, and it does so strictly using
                        the value weights you set during onboarding. Change those weights and this number changes.
                      </p>
                      <p>
                        Utility in money is logarithmic, not linear — doubling wealth is worth a fixed amount wherever
                        you start. Under a linear score, high-variance options win almost every comparison; under a
                        log score they usually do not, which is the more defensible treatment.
                      </p>
                      <p>
                        The score is computed for every run and then averaged, never computed on the averages. Those
                        are very different numbers when a distribution is skewed, and only the first answers the
                        question you are asking.
                      </p>
                    </Why>
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* -- Attribution ---------------------------------------------------- */}
      {attribution && attribution.length > 0 && (
        <AttributionSection attribution={attribution} focus={focus} baseline={baseline} currency={currency} />
      )}

      {/* -- Individual lives ----------------------------------------------- */}
      <div className="results__pair">
        {result.branches.map((branch) => (
          <Panel key={branch.branchId} padded={false} className="results__panel">
            <div className="results__panel-inner">
              <Timeline
                paths={branch.samples}
                colour={palette[branch.branchId]}
                branchLabel={branch.label}
                format={(v) => money(v, currency)}
              />
            </div>
          </Panel>
        ))}
      </div>

      {/* -- Footer --------------------------------------------------------- */}
      <footer className="results__footer">
        <div>
          <div className="eyebrow">How to read this</div>
          <p className="prose">
            These are not predictions. They are the output of a model built from population averages, applied to a
            simplified version of you, with several parameters that are frankly educated guesses. The value is in the
            shape — which mechanisms dominate, how wide the spread is, where the tails sit — not in any individual
            figure.
          </p>
          <p className="prose">
            If a number here surprises you, the useful next move is not to believe it. It is to click through to the
            assumption underneath, decide whether you agree with it, and change it if you do not.
          </p>
        </div>
        <div className="results__provenance">
          <Tag>seed {result.seed}</Tag>
          <Tag>{count(result.runs * result.branches.length)} lives</Tag>
          <Tag>{(result.elapsedMs / 1000).toFixed(1)}s</Tag>
          <Tag>{spec.branches.length} branches</Tag>
        </div>
      </footer>
    </div>
  );
}

function AttributionSection({
  attribution,
  focus,
  baseline,
  currency,
}: {
  attribution: Attribution[];
  focus: BranchResult;
  baseline: BranchResult;
  currency: string;
}) {
  const [metric, setMetric] = useState(attribution[0]?.metric ?? 'netWorth');
  const current = attribution.find((a) => a.metric === metric) ?? attribution[0];
  if (!current) return null;

  return (
    <Panel
      eyebrow="Every number links to why"
      title={`What produced the difference between ${focus.label} and ${baseline.label}`}
      action={
        <Segmented
          size="sm"
          value={metric}
          options={attribution.map((a) => ({ value: a.metric, label: METRIC_LABELS[a.metric] ?? a.metric }))}
          onChange={(v) => setMetric(v as typeof metric)}
        />
      }
    >
      <Waterfall
        attribution={current}
        invertGood={metric === 'stress'}
        format={(value) => metricDelta(metric, value, currency)}
        title={`${METRIC_LABELS[current.metric]}, decomposed`}
        caption={`Each bar is measured by re-running the entire simulation with that one mechanism switched off. Horizontal whiskers are 95% intervals — a bar shorter than its whisker is not distinguishable from nothing.`}
      />
    </Panel>
  );
}
