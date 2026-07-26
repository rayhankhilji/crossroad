/**
 * Landing.
 *
 * One job: make the distinction between prediction and simulation land before
 * anyone touches anything. Everything the app does downstream depends on the
 * user holding that distinction, and if they arrive at the results screen
 * expecting an answer, the results screen will disappoint them for the wrong
 * reason.
 */

import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';

import { useApp } from '../../state/store';
import { Button } from '../primitives';
import './landing.css';

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const, delay },
});

export function Landing() {
  const go = useApp((s) => s.go);
  const loadExample = useApp((s) => s.loadExample);
  const twin = useApp((s) => s.twin);
  const hasTwin = twin.completed.length > 0;

  return (
    <div className="landing">
      <section className="landing__hero">
        <motion.div className="eyebrow" {...fade(0)}>
          Not prediction. Simulation.
        </motion.div>

        <motion.h1 className="display landing__headline" {...fade(0.08)}>
          Stop asking what you
          <br />
          should do.
        </motion.h1>

        <motion.p className="landing__sub" {...fade(0.18)}>
          Ask what becomes <em>more likely</em> if you choose X.
        </motion.p>

        <motion.div className="landing__lede prose" {...fade(0.28)}>
          <p>
            Crossroad builds a detailed model of your circumstances, then runs your life forward ten thousand times
            under each option you are weighing. What comes back is not an answer. It is a distribution — the shape of
            the futures each choice opens, and the shape of the ones it closes.
          </p>
        </motion.div>

        <motion.div className="landing__actions" {...fade(0.38)}>
          <Button variant="primary" size="lg" onClick={() => go(hasTwin ? 'ask' : 'onboarding')}>
            {hasTwin ? 'Ask a question' : 'Build your twin'}
          </Button>
          <Button
            size="lg"
            onClick={() => {
              loadExample();
              go('ask');
            }}
          >
            Try it with an example
          </Button>
        </motion.div>

        <motion.div className="landing__demo" {...fade(0.5)}>
          <ProbabilityDemo />
        </motion.div>
      </section>

      <section className="landing__argument">
        <motion.div
          className="landing__claim"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="display landing__claim-title">
            A single number about your future is <em>always</em> wrong.
          </h2>
          <p className="prose">
            Anything that tells you where you will be in fifteen years is making one draw from an enormous
            distribution and presenting it as the truth. The interesting information was in everything it threw away —
            how wide the spread is, how bad the bad cases get, how often the good case actually turns up.
          </p>
          <p className="prose">
            So Crossroad never gives you one number without the spread around it, never gives you a mean without the
            median beside it, and never tells you which branch to take. Which future you want is not a thing a
            simulation can know.
          </p>
        </motion.div>

        <div className="landing__pillars">
          {PILLARS.map((pillar, i) => (
            <motion.article
              key={pillar.title}
              className="landing__pillar"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="landing__pillar-index num">{String(i + 1).padStart(2, '0')}</div>
              <h3 className="landing__pillar-title">{pillar.title}</h3>
              <p className="landing__pillar-body">{pillar.body}</p>
            </motion.article>
          ))}
        </div>
      </section>

      <section className="landing__honest">
        <div className="landing__honest-inner">
          <div className="eyebrow">Read this before you trust anything it says</div>
          <h2 className="display landing__honest-title">What this cannot do</h2>
          <div className="landing__honest-grid">
            <p>
              It cannot predict your life. It applies population-average relationships to a made-up person who shares
              some of your numbers, and the distance between that and a forecast is enormous.
            </p>
            <p>
              Several of its parameters are educated guesses. Every one of them is labelled with a confidence rating,
              a source and a caveat, and every one of them is yours to change.
            </p>
            <p>
              It knows nothing about the specific thing that will actually determine how this goes — your particular
              company, your particular relationship, the thing you have not told it.
            </p>
            <p>
              More simulations buy precision about the model, never accuracy about the world. Ten million runs of a
              wrong model is still a wrong answer, delivered confidently.
            </p>
          </div>
          <p className="landing__honest-close">
            What it is good for: seeing the <em>shape</em> of a decision. Which mechanisms dominate. How much of the
            outcome is under your control and how much is weather. Where the tails are, before you walk into one.
          </p>
        </div>
      </section>

      <footer className="landing__footer">
        <span>Everything stays in your browser. There is no server to send it to.</span>
        <a href="https://github.com/rayhankhilji/crossroad" target="_blank" rel="noreferrer">
          Source on GitHub
        </a>
      </footer>
    </div>
  );
}

const PILLARS = [
  {
    title: 'A twin worth simulating',
    body: 'Twenty minutes of onboarding across fifteen chapters: finances, personality, health, network, habits, values, what you actually want. A model built from four questions produces confident nonsense.',
  },
  {
    title: 'Ten thousand futures per branch',
    body: 'Every option is simulated against the same ten thousand worlds — the same market crashes, the same illnesses, the same luck. Only the decision differs, which is what makes the comparison mean anything.',
  },
  {
    title: 'Every number links to why',
    body: 'Any figure decomposes into the mechanisms that produced it, measured by switching each one off and re-running. Underneath sits the assumption, its source, its confidence rating and a slider.',
  },
  {
    title: 'Luck is loud',
    body: 'The default settings make chance responsible for most of the variance in outcomes, because it is. A simulator where your traits neatly determine your future would be more flattering and much less true.',
  },
];

/**
 * A live illustration of the core idea: the same choice, run over and over,
 * landing in different places. Deliberately not a chart — it is the sensation
 * of a distribution accumulating, which is what the app is about.
 */
function ProbabilityDemo() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => (t + 1) % 3), 3400);
    return () => clearInterval(timer);
  }, []);

  const outcomes = useMemo(
    () => [
      { label: 'the company folds', share: 0.7, tone: 'var(--tone-bad)' },
      { label: 'a modest exit', share: 0.22, tone: 'var(--tone-mixed)' },
      { label: 'it works', share: 0.08, tone: 'var(--tone-great)' },
    ],
    [],
  );

  return (
    <div className="demo">
      <div className="demo__question">Quit the job and start something?</div>
      <div className="demo__bars">
        {outcomes.map((outcome, i) => (
          <div key={outcome.label} className="demo__bar-row">
            <motion.div
              className="demo__bar"
              style={{ background: outcome.tone }}
              initial={{ width: 0 }}
              animate={{ width: `${outcome.share * 100}%` }}
              transition={{ duration: 1.1, delay: 0.7 + i * 0.13, ease: [0.22, 1, 0.36, 1] }}
            />
            <span className="demo__share num">{Math.round(outcome.share * 100)}%</span>
            <span className="demo__label">{outcome.label}</span>
          </div>
        ))}
      </div>
      <motion.div
        key={tick}
        className="demo__caption"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {
          [
            'The average outcome is excellent. The typical one is not. Both are true at once.',
            'Eight in ten of these futures never produce a penny. That is not pessimism, it is the base rate.',
            'The question is never "will it work". It is "can I survive the versions where it does not".',
          ][tick]
        }
      </motion.div>
    </div>
  );
}
