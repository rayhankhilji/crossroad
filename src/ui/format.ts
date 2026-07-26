/**
 * Formatting.
 *
 * Two rules run through all of this. Numbers are rounded to the precision the
 * model can actually support — quoting a simulated net worth to the pound
 * would imply an accuracy that does not exist. And a sign is always shown on a
 * difference, because the entire interface is built around comparisons and a
 * bare number in that context is ambiguous.
 */

import type { Currency } from '../engine/types';

const SYMBOLS: Record<Currency, string> = { GBP: '£', USD: '$', EUR: '€' };

export function symbolFor(currency: Currency | string): string {
  return SYMBOLS[currency as Currency] ?? '£';
}

/**
 * Money, abbreviated to a sensible number of significant figures.
 * £4,127,309 becomes £4.13m, because the third decimal place is noise.
 */
export function money(value: number, currency: Currency | string = 'GBP', options?: { sign?: boolean }): string {
  const symbol = symbolFor(currency);
  const sign = value < 0 ? '−' : options?.sign ? '+' : '';
  const abs = Math.abs(value);

  let body: string;
  if (abs >= 1_000_000_000) body = `${trim(abs / 1_000_000_000)}bn`;
  else if (abs >= 1_000_000) body = `${trim(abs / 1_000_000)}m`;
  else if (abs >= 10_000) body = `${Math.round(abs / 1000)}k`;
  else if (abs >= 1000) body = `${trim(abs / 1000)}k`;
  else body = Math.round(abs).toLocaleString('en-GB');

  return `${sign}${symbol}${body}`;
}

/** Money at full precision, for tables and tooltips where space allows. */
export function moneyExact(value: number, currency: Currency | string = 'GBP'): string {
  const sign = value < 0 ? '−' : '';
  return `${sign}${symbolFor(currency)}${Math.round(Math.abs(value)).toLocaleString('en-GB')}`;
}

function trim(value: number): string {
  const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return value.toFixed(decimals).replace(/\.?0+$/, '');
}

/** A fraction 0–1 as a percentage. */
export function percent(value: number, decimals = 0): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/** A signed percentage-point difference. */
export function points(value: number, decimals = 1): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(decimals)}`;
}

export function signed(value: number, decimals = 1): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(decimals)}`;
}

/** Compact integer, e.g. 10,000 → "10,000". */
export function count(value: number): string {
  return Math.round(value).toLocaleString('en-GB');
}

export function years(value: number): string {
  if (value < 1) {
    const months = Math.round(value * 12);
    return `${months} month${months === 1 ? '' : 's'}`;
  }
  const rounded = Math.round(value * 10) / 10;
  return `${rounded} year${rounded === 1 ? '' : 's'}`;
}

/**
 * Format a metric in its own units. Used everywhere a metric is chosen
 * dynamically, so the axis and the tooltip cannot drift apart.
 */
export function metricValue(metric: string, value: number, currency: Currency | string = 'GBP'): string {
  switch (metric) {
    case 'netWorth':
    case 'income':
      return money(value, currency);
    case 'lifetimeWellbeing':
      return Math.round(value).toLocaleString('en-GB');
    case 'freedom':
      return `${Math.round(value)}%`;
    default:
      return value.toFixed(1);
  }
}

export function metricDelta(metric: string, value: number, currency: Currency | string = 'GBP'): string {
  switch (metric) {
    case 'netWorth':
    case 'income':
      return money(value, currency, { sign: true });
    case 'freedom':
      return `${signed(value, 0)}%`;
    case 'lifetimeWellbeing':
      return signed(value, 0);
    default:
      return `${signed(value, 1)} pts`;
  }
}

export const METRIC_LABELS: Record<string, string> = {
  netWorth: 'Net worth',
  income: 'Household income',
  happiness: 'Wellbeing',
  health: 'Health',
  stress: 'Stress',
  careerCapital: 'Career capital',
  relationshipQuality: 'Relationship',
  freedom: 'Financial freedom',
  optionality: 'Optionality',
  lifetimeWellbeing: 'Wellbeing over the whole period',
};

export const METRIC_BLURBS: Record<string, string> = {
  netWorth: 'Everything you own minus everything you owe, in today’s money.',
  income: 'Gross household earnings, including a partner’s.',
  happiness: 'Experienced wellbeing on a 0–100 scale, at the end of the period.',
  health: 'A 0–100 health index combining age, habits, stress and any events.',
  stress: 'Chronic stress, 0–100. The variable that quietly moves everything else.',
  careerCapital: 'Skill, reputation and track record — what you could get paid for next.',
  relationshipQuality: 'Quality of a partnership, 0–100. Zero when single.',
  freedom: 'The share of your annual spending your assets could cover indefinitely.',
  optionality: 'How many viable next moves you have. Money, skills, network, health.',
  lifetimeWellbeing: 'Wellbeing summed across every year, discounted — the journey, not the destination.',
};

/** Metrics where a higher number is worse. Used to pick the diverging colour. */
export const INVERTED_METRICS = new Set(['stress']);

export function isGood(metric: string, delta: number): boolean {
  return INVERTED_METRICS.has(metric) ? delta < 0 : delta > 0;
}

/**
 * The engine reports win rate as "fraction of paired worlds where this branch
 * scored higher". For stress, higher is worse — so the share of worlds where
 * you are *better off* is the complement. Without this, a branch that raises
 * stress in 94% of futures reads as "better in 94% of worlds".
 */
export function betterRate(metric: string, winRate: number): number {
  return INVERTED_METRICS.has(metric) ? 1 - winRate : winRate;
}
