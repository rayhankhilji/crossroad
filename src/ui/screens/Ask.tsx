/**
 * The crossroads: choosing what to ask.
 *
 * Deliberately not a text box. A free-text question would have to be
 * interpreted, and an interpretation the user cannot see is exactly the kind
 * of hidden assumption this whole app exists to avoid. Instead the decision
 * library is explicit: pick the question, set its parameters, and see the
 * mechanisms that will be applied before anything is run.
 */

import { motion } from 'framer-motion';

import { DECISIONS, getDecision, type OptionSpec } from '../../engine/decisions';
import { LOCATIONS } from '../../engine/locations';
import { completeness } from '../../engine/twin';
import { useApp } from '../../state/store';
import { count, money } from '../format';
import { Button, Field, NumberInput, Panel, Segmented, Select, Slider, Tag, Toggle } from '../primitives';
import './ask.css';

const CATEGORY_LABELS: Record<string, string> = {
  work: 'Work',
  place: 'Place',
  money: 'Money',
  life: 'Life',
  learning: 'Learning',
};

export function Ask() {
  const decisionId = useApp((s) => s.decisionId);
  const chooseDecision = useApp((s) => s.chooseDecision);
  const options = useApp((s) => s.options);
  const setOption = useApp((s) => s.setOption);
  const horizonYears = useApp((s) => s.horizonYears);
  const setHorizon = useApp((s) => s.setHorizon);
  const runs = useApp((s) => s.runs);
  const setRuns = useApp((s) => s.setRuns);
  const run = useApp((s) => s.run);
  const running = useApp((s) => s.running);
  const twin = useApp((s) => s.twin);
  const go = useApp((s) => s.go);

  const spec = getDecision(decisionId);
  const filled = completeness(twin);

  return (
    <div className="ask">
      <header className="ask__header">
        <div className="eyebrow">The crossroads</div>
        <h1 className="display ask__title">What are you weighing?</h1>
        <p className="ask__lede prose">
          Every option gets simulated. There is no recommended branch and the app will not pick one for you — it will
          show you what each one does to the distribution and leave the choosing where it belongs.
        </p>
      </header>

      {filled < 0.5 && (
        <div className="ask__warning">
          <strong>Your twin is {Math.round(filled * 100)}% filled in.</strong> The gaps are being filled with
          population averages, which means the answer is partly about the average person rather than you.{' '}
          <button onClick={() => go('onboarding')}>Finish the portrait</button>
        </div>
      )}

      <div className="ask__grid">
        {DECISIONS.map((item, i) => (
          <motion.button
            key={item.id}
            className={`ask__card${item.id === decisionId ? ' is-selected' : ''}`}
            onClick={() => chooseDecision(item.id)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.03, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="ask__card-cat eyebrow">{CATEGORY_LABELS[item.category]}</span>
            <span className="ask__card-question">{item.question}</span>
            <span className="ask__card-branches">
              {item.branches.map((b) => b.label).join('  ·  ')}
            </span>
          </motion.button>
        ))}
      </div>

      <motion.div
        key={spec.id}
        className="ask__detail"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="ask__detail-main">
          <Panel eyebrow="The question" title={spec.question}>
            <p className="ask__blurb">{spec.blurb}</p>

            {spec.options.length > 0 && (
              <div className="ask__options">
                {spec.options.map((option) => (
                  <OptionControl
                    key={option.id}
                    spec={option}
                    value={options[option.id]}
                    currency={twin.finance.currency}
                    onChange={(value) => setOption(option.id, value)}
                  />
                ))}
              </div>
            )}
          </Panel>

          <Panel eyebrow="Before you run it" title="The mechanisms this will apply">
            <p className="ask__mechanisms-note">
              These are the only ways the choice is allowed to touch the model. After the run, each one is measured by
              switching it off and re-simulating, so you can see how much of the answer it was responsible for.
            </p>
            {spec.branches
              .filter((branch) => branch.channels.length > 0)
              .map((branch) => (
                <div key={branch.id} className="ask__branch">
                  <div className="ask__branch-head">
                    <strong>{branch.label}</strong>
                    <span>{branch.tagline}</span>
                  </div>
                  <ul className="ask__channels">
                    {branch.channels.map((channel) => (
                      <li key={channel.id}>
                        <span className="ask__channel-label">{channel.label}</span>
                        <span className="ask__channel-why">{channel.why}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </Panel>
        </div>

        <aside className="ask__side">
          <Panel eyebrow="Simulation" title="How to run it">
            <div className="ask__settings">
              <Field
                label="How far forward"
                hint={`${horizonYears} years`}
                help="Uncertainty compounds. Long horizons are useful for seeing the shape of a decision, not for reading a number off."
              >
                <Slider value={horizonYears} min={1} max={40} onChange={setHorizon} format={(v) => `${v}y`} />
              </Field>

              <Field
                label="Futures per branch"
                hint={count(runs)}
                help="More runs narrow the error on every statistic — but only about the model, never about the world."
              >
                <Segmented
                  value={String(runs)}
                  size="sm"
                  options={[
                    { value: '2000', label: '2k' },
                    { value: '5000', label: '5k' },
                    { value: '10000', label: '10k' },
                    { value: '25000', label: '25k' },
                  ]}
                  onChange={(v) => setRuns(Number(v))}
                />
              </Field>

              <div className="ask__estimate">
                <Tag>{count(runs * spec.branches.length)} lives to simulate</Tag>
              </div>

              <Button variant="primary" size="lg" full onClick={run} disabled={running}>
                {running ? 'Simulating…' : 'Run the simulation'}
              </Button>
            </div>
          </Panel>

          <Panel eyebrow="Your position today" title="Where this starts from">
            <dl className="ask__facts">
              <div>
                <dt>Age</dt>
                <dd className="num">{twin.identity.age}</dd>
              </div>
              <div>
                <dt>Household income</dt>
                <dd className="num">
                  {money(
                    twin.finance.grossIncome + twin.finance.variableComp + twin.relationship.partnerIncome,
                    twin.finance.currency,
                  )}
                </dd>
              </div>
              <div>
                <dt>Annual spending</dt>
                <dd className="num">{money(twin.finance.livingCosts, twin.finance.currency)}</dd>
              </div>
              <div>
                <dt>Net worth</dt>
                <dd className="num">
                  {money(
                    twin.finance.cashSavings +
                      twin.finance.invested -
                      twin.finance.debts.reduce((sum, d) => sum + d.balance, 0),
                    twin.finance.currency,
                  )}
                </dd>
              </div>
              <div>
                <dt>Runway</dt>
                <dd className="num">
                  {twin.finance.livingCosts > 0
                    ? `${Math.round((twin.finance.cashSavings / twin.finance.livingCosts) * 12)} months`
                    : '—'}
                </dd>
              </div>
            </dl>
            <Button variant="ghost" size="sm" full onClick={() => go('twin')}>
              View the full twin
            </Button>
          </Panel>
        </aside>
      </motion.div>
    </div>
  );
}

function OptionControl({
  spec,
  value,
  currency,
  onChange,
}: {
  spec: OptionSpec;
  value: unknown;
  currency: string;
  onChange: (value: string | number | boolean) => void;
}) {
  if (spec.kind === 'toggle') {
    return (
      <Field label={spec.label} help={spec.help}>
        <Toggle checked={value === true} onChange={onChange} label={value === true ? 'Yes' : 'No'} />
      </Field>
    );
  }

  if (spec.kind === 'location') {
    return (
      <Field label={spec.label} help={spec.help}>
        <Select
          value={String(value ?? spec.default)}
          options={LOCATIONS.map((l) => ({ value: l.id, label: `${l.city}` }))}
          onChange={onChange}
        />
      </Field>
    );
  }

  if (spec.kind === 'choice' || spec.kind === 'field') {
    return (
      <Field label={spec.label} help={spec.help}>
        <Select value={String(value ?? spec.default)} options={spec.choices ?? []} onChange={onChange} />
      </Field>
    );
  }

  const numeric = typeof value === 'number' ? value : Number(spec.default);
  const isMoney = spec.unit === '' && (spec.max ?? 0) > 10000;

  if (isMoney) {
    return (
      <Field label={spec.label} help={spec.help}>
        <NumberInput
          value={numeric}
          min={spec.min}
          max={spec.max}
          step={spec.step}
          prefix={currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£'}
          onChange={onChange}
        />
      </Field>
    );
  }

  return (
    <Field label={spec.label} help={spec.help} hint={`${numeric}${spec.unit ? ` ${spec.unit}` : ''}`}>
      <Slider
        value={numeric}
        min={spec.min ?? 0}
        max={spec.max ?? 100}
        step={spec.step ?? 1}
        onChange={onChange}
        format={(v) => `${v}${spec.unit ? ` ${spec.unit}` : ''}`}
      />
    </Field>
  );
}
