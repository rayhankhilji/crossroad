/**
 * A short Big Five instrument.
 *
 * Twenty items, four per domain, balanced between positively and negatively
 * keyed statements so that agreeing with everything does not produce an
 * extreme profile. The items are written in the style of the International
 * Personality Item Pool, which is in the public domain.
 *
 * What this is: a rough self-report, useful for putting someone roughly in the
 * right part of the distribution.
 *
 * What it is not: a validated clinical measure. A twenty-item scale has real
 * measurement error, self-report on personality is subject to how you feel
 * today, and the effect sizes the engine attaches to these traits are modest
 * on purpose. The interface says so at the point of asking, rather than
 * collecting the answers and quietly treating them as facts.
 */

import type { BigFive, BigFiveTrait } from './types';

export interface BigFiveItem {
  id: string;
  text: string;
  trait: BigFiveTrait;
  /** False when agreeing with the item indicates *less* of the trait. */
  positive: boolean;
}

export const BIG_FIVE_ITEMS: BigFiveItem[] = [
  // Openness
  { id: 'o1', text: 'I have a vivid imagination and a lot of ideas.', trait: 'openness', positive: true },
  { id: 'o2', text: 'I enjoy thinking about abstract or theoretical things.', trait: 'openness', positive: true },
  { id: 'o3', text: 'I prefer things to stay familiar rather than change.', trait: 'openness', positive: false },
  { id: 'o4', text: 'Art, music or poetry rarely moves me much.', trait: 'openness', positive: false },

  // Conscientiousness
  { id: 'c1', text: 'I finish what I start, even when it stops being interesting.', trait: 'conscientiousness', positive: true },
  { id: 'c2', text: 'I like to have a plan and stick to it.', trait: 'conscientiousness', positive: true },
  { id: 'c3', text: 'I often leave things until the last possible moment.', trait: 'conscientiousness', positive: false },
  { id: 'c4', text: 'My things tend to end up in a mess.', trait: 'conscientiousness', positive: false },

  // Extraversion
  { id: 'e1', text: 'I feel energised after spending time around other people.', trait: 'extraversion', positive: true },
  { id: 'e2', text: 'I find it easy to start conversations with strangers.', trait: 'extraversion', positive: true },
  { id: 'e3', text: 'I need a lot of time alone to recharge.', trait: 'extraversion', positive: false },
  { id: 'e4', text: 'I tend to stay in the background in a group.', trait: 'extraversion', positive: false },

  // Agreeableness
  { id: 'a1', text: 'I go out of my way to make other people comfortable.', trait: 'agreeableness', positive: true },
  { id: 'a2', text: 'I assume most people mean well.', trait: 'agreeableness', positive: true },
  { id: 'a3', text: 'I am blunt, even when it stings.', trait: 'agreeableness', positive: false },
  { id: 'a4', text: 'I look out for my own interests before anyone else’s.', trait: 'agreeableness', positive: false },

  // Neuroticism
  { id: 'n1', text: 'I worry about things more than most people do.', trait: 'neuroticism', positive: true },
  { id: 'n2', text: 'My mood can shift quickly and without much cause.', trait: 'neuroticism', positive: true },
  { id: 'n3', text: 'I stay calm under pressure.', trait: 'neuroticism', positive: false },
  { id: 'n4', text: 'I rarely feel anxious or tense.', trait: 'neuroticism', positive: false },
];

export const LIKERT: { value: number; label: string; short: string }[] = [
  { value: 1, label: 'Strongly disagree', short: 'No' },
  { value: 2, label: 'Disagree', short: '–' },
  { value: 3, label: 'Neither', short: '·' },
  { value: 4, label: 'Agree', short: '+' },
  { value: 5, label: 'Strongly agree', short: 'Yes' },
];

export type BigFiveResponses = Record<string, number>;

/**
 * Score responses onto a 0–100 scale per domain.
 *
 * Reverse-keyed items are flipped, then each domain is the mean of its items
 * rescaled from the 1–5 response range. Unanswered items are treated as
 * neutral rather than dropped, so a partly completed instrument degrades
 * toward the population average instead of toward an extreme.
 */
export function scoreBigFive(responses: BigFiveResponses): BigFive {
  const totals: Record<BigFiveTrait, { sum: number; count: number }> = {
    openness: { sum: 0, count: 0 },
    conscientiousness: { sum: 0, count: 0 },
    extraversion: { sum: 0, count: 0 },
    agreeableness: { sum: 0, count: 0 },
    neuroticism: { sum: 0, count: 0 },
  };

  for (const item of BIG_FIVE_ITEMS) {
    const raw = responses[item.id] ?? 3;
    const scored = item.positive ? raw : 6 - raw;
    totals[item.trait].sum += scored;
    totals[item.trait].count += 1;
  }

  const toScale = (trait: BigFiveTrait) => {
    const { sum, count } = totals[trait];
    const mean = count > 0 ? sum / count : 3;
    return Math.round(((mean - 1) / 4) * 100);
  };

  return {
    openness: toScale('openness'),
    conscientiousness: toScale('conscientiousness'),
    extraversion: toScale('extraversion'),
    agreeableness: toScale('agreeableness'),
    neuroticism: toScale('neuroticism'),
  };
}

export const TRAIT_INFO: Record<BigFiveTrait, { label: string; high: string; low: string; matters: string }> = {
  openness: {
    label: 'Openness',
    high: 'curious, drawn to novelty and ideas',
    low: 'practical, prefers the tried and tested',
    matters: 'Feeds how readily you take on unfamiliar work, which drives the pace of skill growth in the model.',
  },
  conscientiousness: {
    label: 'Conscientiousness',
    high: 'organised, follows through',
    low: 'flexible, works in bursts',
    matters:
      'The Big Five trait that most consistently predicts job performance across occupations. The effect on earnings here is real but deliberately modest — the meta-analytic validity is around 0.2, not 0.8.',
  },
  extraversion: {
    label: 'Extraversion',
    high: 'energised by people, outward-facing',
    low: 'reflective, recharges alone',
    matters:
      'Drives how quickly a network rebuilds after a move and how often opportunities arrive through weak ties. Also one of the two traits most associated with wellbeing.',
  },
  agreeableness: {
    label: 'Agreeableness',
    high: 'cooperative, accommodating',
    low: 'direct, competitive',
    matters: 'Affects relationship repair in the model, and shows up in negotiation outcomes.',
  },
  neuroticism: {
    label: 'Neuroticism',
    high: 'reacts strongly, feels things sharply',
    low: 'even-keeled, hard to rattle',
    matters:
      'The strongest single trait predictor of subjective wellbeing, and the main input to your wellbeing set point — the level the model pulls you back toward after any shock.',
  },
};

/** Percentage of the instrument answered. */
export function bigFiveProgress(responses: BigFiveResponses): number {
  const answered = BIG_FIVE_ITEMS.filter((item) => responses[item.id] !== undefined).length;
  return answered / BIG_FIVE_ITEMS.length;
}
