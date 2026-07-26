/**
 * The twin.
 *
 * The important thing this screen does is distinguish, visibly, between what
 * you told the model and what the model assumed. A portrait that presents
 * inferred defaults with the same confidence as your own answers would be
 * quietly lying about how much it knows.
 */

import { motion } from 'framer-motion';

import { TRAIT_INFO } from '../../engine/bigfive';
import { deriveTraits, financialFreedom, initialState, makeStreams, netWorth, optionality } from '../../engine/dynamics';
import { getLocation } from '../../engine/locations';
import { completeness, VALUE_IDS, VALUE_LABELS } from '../../engine/twin';
import type { BigFiveTrait } from '../../engine/types';
import { currentAssumptions, useApp } from '../../state/store';
import { money, percent } from '../format';
import { Button, Panel, Stat, Tag, Why } from '../primitives';
import './twin.css';

const CHAPTER_LABELS: Record<string, string> = {
  identity: 'You',
  career: 'Work',
  finance: 'Money',
  education: 'Education',
  personality: 'Personality',
  disposition: 'Disposition',
  values: 'Values',
  relationship: 'Relationship',
  health: 'Health',
  network: 'Network',
  habits: 'Habits',
};

export function TwinView() {
  const twin = useApp((s) => s.twin);
  const go = useApp((s) => s.go);
  const resetTwin = useApp((s) => s.resetTwin);

  const params = currentAssumptions();
  const traits = deriveTraits(twin, params, makeStreams(1).traits);
  const state = initialState(twin, traits, params);
  const location = getLocation(twin.identity.locationId);
  const filled = completeness(twin);

  const missing = Object.keys(CHAPTER_LABELS).filter((c) => !twin.completed.includes(c));

  const valueTotal = VALUE_IDS.reduce((sum, id) => sum + (twin.values[id] ?? 0), 0);
  const rankedValues = [...VALUE_IDS]
    .sort((a, b) => (twin.values[b] ?? 0) - (twin.values[a] ?? 0))
    .slice(0, 5);

  return (
    <div className="twin">
      <header className="twin__header">
        <div>
          <div className="eyebrow">Your digital twin</div>
          <h1 className="display twin__title">
            {twin.identity.displayName || 'Unnamed'}, {twin.identity.age}
          </h1>
          <p className="twin__subtitle">
            {twin.career.title || 'No job title set'} · {location.city}
          </p>
        </div>
        <div className="twin__header-actions">
          <Button variant="ghost" onClick={resetTwin}>
            Start over
          </Button>
          <Button onClick={() => go('onboarding')}>Edit</Button>
          <Button variant="primary" onClick={() => go('ask')}>
            Ask a question
          </Button>
        </div>
      </header>

      {missing.length > 0 && (
        <div className="twin__gaps">
          <div className="twin__gaps-head">
            <strong>{Math.round(filled * 100)}% of the portrait is you.</strong> The rest is the population average,
            which means results are partly about a generic person.
          </div>
          <div className="twin__gaps-list">
            {missing.map((chapter) => (
              <button key={chapter} onClick={() => go('onboarding')}>
                {CHAPTER_LABELS[chapter]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* -- Derived position ------------------------------------------------ */}
      <Panel eyebrow="Where the simulation starts" title="Your position today, as the model sees it">
        <div className="twin__derived">
          <Stat
            label="Net worth"
            value={money(netWorth(state), twin.finance.currency)}
            sub="savings and investments minus debts"
          />
          <Stat
            label="Runway"
            value={`${Math.round(state.runwayMonths)} mo`}
            tone={state.runwayMonths < 6 ? 'bad' : state.runwayMonths > 18 ? 'good' : 'neutral'}
            sub="months of spending covered by cash"
            why={
              <Why title="Runway">
                <p>
                  Liquid savings divided by annual spending. It is the variable that most determines whether a bad
                  year is an inconvenience or a catastrophe, and it is why two people on identical salaries can face
                  completely different distributions of outcomes.
                </p>
                <p>
                  Below the threshold set in the assumptions, the model ramps financial stress sharply and starts
                  constraining choices — you take the safe job rather than the right one.
                </p>
              </Why>
            }
          />
          <Stat
            label="Career capital"
            value={state.careerCapital.toFixed(0)}
            sub="skill, reputation, track record"
            why={
              <Why title="Career capital">
                <p>
                  A 0–100 composite of experience (saturating — the twentieth year adds much less than the third),
                  seniority, self-assessed skill and a small cognitive term.
                </p>
                <p>
                  It is what the market prices when you need a new job, so it is the thing that determines how bad
                  the bad branches get. Someone with high career capital and no savings often has more real
                  optionality than someone with the reverse.
                </p>
              </Why>
            }
          />
          <Stat
            label="Optionality"
            value={optionality(state, traits).toFixed(0)}
            sub="how many viable next moves you have"
            why={
              <Why title="Optionality">
                <p>
                  The closest thing the model has to a measure of freedom that is not simply money. Career capital, a
                  strong network, runway and health all buy it; debt and dependants spend it.
                </p>
              </Why>
            }
          />
          <Stat
            label="Financial freedom"
            value={`${financialFreedom(state, params).toFixed(0)}%`}
            sub="share of spending your assets could cover forever"
          />
          <Stat
            label="Wellbeing"
            value={state.happiness.toFixed(0)}
            sub={`set point ${traits.setPoint.toFixed(0)}`}
            why={
              <Why title="Wellbeing and set point">
                <p>
                  Wellbeing is modelled as a set point plus circumstance. The set point comes from disposition —
                  chiefly low neuroticism and high extraversion, the two Big Five dimensions that most reliably track
                  subjective wellbeing.
                </p>
                <p>
                  Circumstantial changes largely fade back toward it, which is what makes the hedonic treadmill so
                  stubborn. The exceptions the model honours are the ones the panel evidence supports: involuntary
                  unemployment, health and relationship quality do not fully adapt away.
                </p>
              </Why>
            }
          />
        </div>
      </Panel>

      <div className="twin__columns">
        {/* -- Personality -------------------------------------------------- */}
        <Panel eyebrow="Disposition" title="Personality">
          <div className="twin__traits">
            {(Object.keys(TRAIT_INFO) as BigFiveTrait[]).map((trait) => {
              const value = twin.traits.bigFive[trait];
              const info = TRAIT_INFO[trait];
              return (
                <div key={trait} className="twin__trait">
                  <div className="twin__trait-head">
                    <span>{info.label}</span>
                    <span className="num">{value}</span>
                  </div>
                  <div className="twin__trait-track">
                    <motion.div
                      className="twin__trait-fill"
                      initial={{ width: 0 }}
                      animate={{ width: `${value}%` }}
                      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    />
                    <span className="twin__trait-mid" />
                  </div>
                  <div className="twin__trait-poles">
                    <span>{info.low}</span>
                    <span>{info.high}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="twin__dials">
            {[
              ['Risk tolerance', twin.traits.riskTolerance],
              ['Ambition', twin.traits.ambition],
              ['Discipline', twin.traits.discipline],
              ['Ambiguity tolerance', twin.traits.ambiguityTolerance],
            ].map(([label, value]) => (
              <div key={label as string} className="twin__dial">
                <span>{label}</span>
                <span className="num">{value}</span>
              </div>
            ))}
          </div>

          {twin.traits.cognition.method !== 'unset' && (
            <div className="twin__cognition">
              <Tag tone="info">
                cognitive estimate {twin.traits.cognition.estimate} ± {twin.traits.cognition.standardError}
              </Tag>
              <p>
                Treated as a noisy measurement rather than a fact: the engine draws a value around this on every run,
                so the uncertainty propagates into the spread of outcomes instead of being silently discarded. The
                effect size attached to it is deliberately conservative.
              </p>
            </div>
          )}
        </Panel>

        {/* -- Values ------------------------------------------------------- */}
        <Panel eyebrow="What better means" title="Your values, ranked">
          <p className="twin__values-note">
            The only place the app has an opinion about which future is good — and the opinion is yours. These weights
            are what turn ten thousand outcomes into a score.
          </p>
          <ol className="twin__values">
            {rankedValues.map((id, i) => {
              const weight = valueTotal > 0 ? (twin.values[id] ?? 0) / valueTotal : 0;
              return (
                <li key={id}>
                  <span className="twin__value-rank num">{i + 1}</span>
                  <span className="twin__value-label">{VALUE_LABELS[id].label}</span>
                  <span className="twin__value-bar">
                    <motion.span
                      initial={{ width: 0 }}
                      animate={{ width: `${(weight / (rankedValues.length ? 0.2 : 1)) * 100}%` }}
                      transition={{ duration: 0.5, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </span>
                  <span className="twin__value-weight num">{percent(weight, 1)}</span>
                </li>
              );
            })}
          </ol>
        </Panel>
      </div>

      {/* -- Facts ---------------------------------------------------------- */}
      <div className="twin__columns">
        <Panel eyebrow="Money" title="Financial position">
          <FactList
            items={[
              ['Gross salary', money(twin.finance.grossIncome, twin.finance.currency)],
              ['Bonus and equity', money(twin.finance.variableComp, twin.finance.currency)],
              ['Partner income', money(twin.relationship.partnerIncome, twin.finance.currency)],
              ['Annual spending', money(twin.finance.livingCosts, twin.finance.currency)],
              ['Cash', money(twin.finance.cashSavings, twin.finance.currency)],
              ['Invested', money(twin.finance.invested, twin.finance.currency)],
              [
                'Debts',
                twin.finance.debts.length
                  ? money(
                      twin.finance.debts.reduce((sum, d) => sum + d.balance, 0),
                      twin.finance.currency,
                    )
                  : 'none',
              ],
              ['Pension rate', percent(twin.finance.pensionRate)],
            ]}
          />
        </Panel>

        <Panel eyebrow="Work" title="Career">
          <FactList
            items={[
              ['Field', twin.career.field],
              ['Level', twin.career.seniority],
              ['Employer', twin.career.employerStage],
              ['Experience', `${twin.career.yearsExperience} years`],
              ['Hours a week', `${twin.career.hoursPerWeek}`],
              ['Remote', percent(twin.career.remoteShare)],
              ['Satisfaction', `${twin.career.satisfaction}/100`],
            ]}
          />
        </Panel>

        <Panel eyebrow="Body" title="Health and habits">
          <FactList
            items={[
              ['Self-rated health', `${twin.health.selfRated}/100`],
              ['Sleep', `${twin.health.sleepHours}h`],
              ['Exercise', `${twin.health.exerciseSessions}/week`],
              ['Alcohol', `${twin.health.alcoholUnits} units/week`],
              ['Smoker', twin.health.smoker ? 'yes' : 'no'],
              ['Savings rate', percent(twin.habits.savingsRate)],
              ['Deliberate practice', `${twin.habits.deliberatePractice}h/week`],
            ]}
          />
        </Panel>

        <Panel eyebrow="People" title="Relationship and network">
          <FactList
            items={[
              ['Status', twin.relationship.status],
              ...(twin.relationship.status !== 'single'
                ? ([
                    ['Quality', `${twin.relationship.satisfaction}/100`],
                    ['Years together', `${twin.relationship.yearsTogether}`],
                    ['Partner mobility', `${twin.relationship.partnerMobility}/100`],
                  ] as [string, string][])
                : []),
              ['Children', `${twin.relationship.children}`],
              ['Wants children', twin.relationship.wantsChildren ? 'yes' : 'no'],
              ['Professional contacts', `${twin.network.professionalContacts}`],
              ['Close friends', `${twin.network.closeFriends}`],
              ['Network reach', `${twin.network.reach}/100`],
            ]}
          />
        </Panel>
      </div>

      {twin.skills.length > 0 && (
        <Panel eyebrow="Capability" title="Skills">
          <div className="twin__skills">
            {twin.skills.map((skill) => (
              <div key={skill.id} className="twin__skill">
                <div className="twin__skill-head">
                  <span>{skill.label}</span>
                  <span className="num">{skill.level}</span>
                </div>
                <div className="twin__skill-track">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${skill.level}%` }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
                <span className="twin__skill-market">market value {skill.marketValue}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <footer className="twin__footer">
        <p className="prose">
          This is the whole model. There is nothing else — no hidden profile, no inferred segment, no scoring you
          cannot see. It lives in this browser's local storage and has never been transmitted anywhere.
        </p>
        <Button variant="ghost" onClick={() => go('imports')}>
          Import more
        </Button>
      </footer>
    </div>
  );
}

function FactList({ items }: { items: [string, string][] }) {
  return (
    <dl className="twin__facts">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd className="num">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
