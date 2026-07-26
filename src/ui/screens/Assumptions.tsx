/**
 * The assumptions screen.
 *
 * Most tools of this kind hide their parameters. This one leads with them,
 * because a forecast you cannot argue with is not a forecast — it is a
 * horoscope with better typography.
 *
 * Every entry shows its default, its rationale, its confidence rating, what is
 * wrong with it, and where it came from. Every one has a slider. Changing any
 * of them invalidates the current answer, which is the correct behaviour and
 * also a useful thing to feel.
 */

import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';

import {
  ASSUMPTION_GROUPS,
  assumptionsByGroup,
  formatAssumption,
  type Assumption,
  type AssumptionGroup,
  type AssumptionId,
} from '../../engine/assumptions';
import { useApp } from '../../state/store';
import { Button, Slider, Tag } from '../primitives';
import './assumptions.css';

export function Assumptions() {
  const overrides = useApp((s) => s.assumptionOverrides);
  const setAssumption = useApp((s) => s.setAssumption);
  const resetAssumption = useApp((s) => s.resetAssumption);
  const resetAll = useApp((s) => s.resetAllAssumptions);
  const go = useApp((s) => s.go);

  const [group, setGroup] = useState<AssumptionGroup>('wellbeing');
  const [confidenceFilter, setConfidenceFilter] = useState<'all' | 'low'>('all');

  const changedCount = Object.keys(overrides).length;

  const items = useMemo(() => {
    const list = assumptionsByGroup(group);
    return confidenceFilter === 'low' ? list.filter((a) => a.confidence === 'low') : list;
  }, [group, confidenceFilter]);

  const groupMeta = ASSUMPTION_GROUPS.find((g) => g.id === group)!;

  return (
    <div className="assumptions">
      <header className="assumptions__header">
        <div>
          <div className="eyebrow">Nothing is hidden</div>
          <h1 className="display assumptions__title">Every number the model uses</h1>
          <p className="assumptions__lede prose">
            These are the coefficients underneath every result the app produces. Each one carries a rationale, a
            confidence rating, an honest note about what is wrong with it, and a source. If you disagree with one,
            drag it and watch the answer move — that is the point.
          </p>
        </div>
        <div className="assumptions__header-actions">
          {changedCount > 0 && (
            <Tag tone="info">
              {changedCount} changed from default{changedCount === 1 ? '' : 's'}
            </Tag>
          )}
          <Button variant="ghost" onClick={resetAll} disabled={changedCount === 0}>
            Reset all
          </Button>
          <Button onClick={() => go('ask')}>Back to the question</Button>
        </div>
      </header>

      <div className="assumptions__body">
        <nav className="assumptions__nav">
          {ASSUMPTION_GROUPS.map((g) => {
            const changed = assumptionsByGroup(g.id).filter((a) => a.id in overrides).length;
            return (
              <button
                key={g.id}
                className={`assumptions__nav-item${g.id === group ? ' is-active' : ''}`}
                onClick={() => setGroup(g.id)}
              >
                <span className="assumptions__nav-label">{g.label}</span>
                {changed > 0 && <span className="assumptions__nav-badge num">{changed}</span>}
              </button>
            );
          })}
          <div className="assumptions__filter">
            <button
              className={`assumptions__filter-btn${confidenceFilter === 'low' ? ' is-active' : ''}`}
              onClick={() => setConfidenceFilter((v) => (v === 'low' ? 'all' : 'low'))}
            >
              Show only the guesses
            </button>
            <p className="assumptions__filter-note">
              The ones rated low confidence are structural choices rather than measurements. They deserve the most
              scrutiny, and they are where the model is most likely to be wrong.
            </p>
          </div>
        </nav>

        <div className="assumptions__list">
          <div className="assumptions__group-head">
            <h2 className="assumptions__group-title">{groupMeta.label}</h2>
            <p className="assumptions__group-blurb">{groupMeta.blurb}</p>
          </div>

          {items.length === 0 && (
            <p className="assumptions__empty">
              Nothing in this group is rated low confidence. That is a good sign for this part of the model.
            </p>
          )}

          {items.map((spec, i) => (
            <AssumptionRow
              key={spec.id}
              spec={spec}
              value={overrides[spec.id as AssumptionId] ?? spec.value}
              changed={spec.id in overrides}
              index={i}
              onChange={(v) => setAssumption(spec.id as AssumptionId, v)}
              onReset={() => resetAssumption(spec.id as AssumptionId)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function AssumptionRow({
  spec,
  value,
  changed,
  index,
  onChange,
  onReset,
}: {
  spec: Assumption;
  value: number;
  changed: boolean;
  index: number;
  onChange: (value: number) => void;
  onReset: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.article
      className={`assumption${changed ? ' is-changed' : ''}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(0.3, index * 0.03), ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="assumption__top">
        <div className="assumption__identity">
          <button className="assumption__label" onClick={() => setExpanded((v) => !v)}>
            {spec.label}
          </button>
          <span className={`assumption__confidence assumption__confidence--${spec.confidence}`}>
            {spec.confidence}
          </span>
          {changed && (
            <button className="assumption__reset" onClick={onReset}>
              reset to {formatAssumption(spec, spec.value)}
            </button>
          )}
        </div>
        <div className="assumption__control">
          <Slider
            value={value}
            min={spec.min}
            max={spec.max}
            step={spec.step}
            onChange={onChange}
            format={(v) => formatAssumption(spec, v)}
            accent={changed ? 'var(--series-4)' : 'var(--brand-bright)'}
          />
        </div>
      </div>

      <p className="assumption__rationale">{spec.rationale}</p>

      {expanded && (
        <motion.div
          className="assumption__detail"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          {spec.caveat && (
            <div className="assumption__caveat">
              <span className="assumption__caveat-tag">What is wrong with it</span>
              {spec.caveat}
            </div>
          )}
          <div className="assumption__sources">
            <span className="assumption__sources-tag">Sources</span>
            <ul>
              {spec.sources.map((source) => (
                <li key={source.label}>
                  {source.url ? (
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.label}
                    </a>
                  ) : (
                    source.label
                  )}
                  <span className="assumption__source-kind">{source.kind.replace('-', ' ')}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="assumption__id mono">{spec.id}</div>
        </motion.div>
      )}

      {!expanded && (spec.caveat || spec.sources.length > 0) && (
        <button className="assumption__more" onClick={() => setExpanded(true)}>
          {spec.caveat ? 'What’s wrong with this number, and where it came from' : 'Sources'}
        </button>
      )}
    </motion.article>
  );
}
