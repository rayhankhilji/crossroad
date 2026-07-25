/**
 * Archetypes: turning ten thousand numbers back into stories.
 *
 * A distribution is honest but hard to feel. What people actually want to know
 * is "what are the ways this goes?" — so every run is sorted into one of a
 * small set of recognisable futures, and the decision tree draws each as a
 * branch whose thickness is its probability.
 *
 * The classifier is deliberately rule-based rather than a clustering
 * algorithm. k-means on the outcome vector produces clusters that are
 * statistically tidy and impossible to name, and an unnameable branch on a
 * decision tree is worse than no branch at all. These rules produce futures
 * you can point at.
 */

import type { RunOutcome } from './types';

export interface ArchetypeSpec {
  id: string;
  label: string;
  description: string;
  /** Rough valence, used only for ordering and for the diverging colour ramp. */
  tone: 'bad' | 'mixed' | 'good' | 'great';
}

export const ARCHETYPES: ArchetypeSpec[] = [
  {
    id: 'breakout',
    label: 'Breakout',
    description: 'The tail outcome. Financially transformative and rare enough that planning around it is a mistake.',
    tone: 'great',
  },
  {
    id: 'compounding',
    label: 'Quiet compounding',
    description: 'Nothing dramatic happens. Income grows, savings compound, health holds. The most underrated future in the set.',
    tone: 'good',
  },
  {
    id: 'thriving',
    label: 'Rich and well',
    description: 'Both axes go right: the money works out and so does everything the money was supposed to be for.',
    tone: 'great',
  },
  {
    id: 'gilded',
    label: 'Well paid, worn down',
    description: 'The financial case worked and the human one did not. Stress high, health drifting, wellbeing below where it started.',
    tone: 'mixed',
  },
  {
    id: 'poorer-happier',
    label: 'Less money, better life',
    description: 'Measurably worse off financially and measurably better off in every other column.',
    tone: 'mixed',
  },
  {
    id: 'setback',
    label: 'Knocked off course',
    description: 'A layoff, a long search, or a business that did not work. Recovered, but years behind where the other branch would have been.',
    tone: 'bad',
  },
  {
    id: 'health-shock',
    label: 'Health intervened',
    description: 'A serious health event reshaped the decade. Nothing on the financial axis mattered nearly as much.',
    tone: 'bad',
  },
  {
    id: 'rupture',
    label: 'The relationship ended',
    description: 'A separation dominated the period, financially and otherwise. Common enough that leaving it out of the model would be dishonest.',
    tone: 'bad',
  },
  {
    id: 'broke',
    label: 'Ran out of road',
    description: 'Savings hit zero and debt took over. The tail this whole exercise exists to let you see before you walk into it.',
    tone: 'bad',
  },
  {
    id: 'drift',
    label: 'Drift',
    description: 'Neither better nor worse in any direction that shows up in the numbers. More futures land here than anyone expects.',
    tone: 'mixed',
  },
];

export const ARCHETYPE_MAP: Record<string, ArchetypeSpec> = Object.fromEntries(
  ARCHETYPES.map((a) => [a.id, a]),
);

export interface ClassifyReference {
  /** Median terminal net worth of the baseline branch — the yardstick. */
  netWorthReference: number;
  /** Wellbeing at t=0. */
  happinessReference: number;
}

/**
 * Order matters: the first matching rule wins, and the rules are sorted so
 * that a life-defining event outranks a financial classification. Someone who
 * had a heart attack and also happened to end up wealthy is not filed under
 * "rich and well".
 */
export function classify(outcome: RunOutcome, ref: ClassifyReference): string {
  const { flags } = outcome;

  if (flags.venture === 'breakout') return 'breakout';
  if (outcome.ranOutOfMoney && outcome.netWorth < 0) return 'broke';
  if (flags.healthShock && outcome.health < 55) return 'health-shock';
  if (flags.separated && !flags.endedPartnered) return 'rupture';
  if (flags.venture === 'failed' || flags.unemployedYears >= 2) return 'setback';

  const wealthRatio = outcome.netWorth / Math.max(1, Math.abs(ref.netWorthReference) || 1);
  const richer = outcome.netWorth > ref.netWorthReference * 1.25;
  const poorer = outcome.netWorth < ref.netWorthReference * 0.75;
  const happier = outcome.happiness > ref.happinessReference + 4;
  const sadder = outcome.happiness < ref.happinessReference - 4;

  if (richer && happier) return 'thriving';
  if (richer && sadder) return 'gilded';
  if (poorer && happier) return 'poorer-happier';
  if (poorer && sadder) return 'setback';
  if (wealthRatio > 1.6 && !sadder) return 'compounding';
  if (richer || (!poorer && !sadder && outcome.stress < 55)) return 'compounding';
  return 'drift';
}

export interface ArchetypeShare {
  id: string;
  label: string;
  description: string;
  tone: ArchetypeSpec['tone'];
  count: number;
  /** 0–1. */
  share: number;
  /** Median terminal net worth within this archetype. */
  medianNetWorth: number;
  medianHappiness: number;
  medianHealth: number;
}

export function summariseArchetypes(outcomes: RunOutcome[], ref: ClassifyReference): ArchetypeShare[] {
  const buckets = new Map<string, RunOutcome[]>();
  for (const o of outcomes) {
    const id = classify(o, ref);
    o.archetype = id;
    const list = buckets.get(id);
    if (list) list.push(o);
    else buckets.set(id, [o]);
  }

  const median = (list: RunOutcome[], pick: (o: RunOutcome) => number) => {
    const values = list.map(pick).sort((a, b) => a - b);
    const mid = Math.floor(values.length / 2);
    return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
  };

  const order = new Map(ARCHETYPES.map((a, i) => [a.id, i]));
  return [...buckets.entries()]
    .map(([id, list]) => {
      const spec = ARCHETYPE_MAP[id];
      return {
        id,
        label: spec.label,
        description: spec.description,
        tone: spec.tone,
        count: list.length,
        share: list.length / Math.max(1, outcomes.length),
        medianNetWorth: median(list, (o) => o.netWorth),
        medianHappiness: median(list, (o) => o.happiness),
        medianHealth: median(list, (o) => o.health),
      };
    })
    .sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
}
