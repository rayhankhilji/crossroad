/**
 * The dynamics: how one simulated year turns into the next.
 *
 * This file is the model. Everything else in the engine either feeds it
 * (twins, assumptions, decisions) or reads what came out of it (attribution,
 * clustering, statistics).
 *
 * Three principles govern it:
 *
 *  1. Every coefficient comes from `assumptions.ts`. There are no magic numbers
 *     buried in the maths that the user cannot see and change. Where a
 *     structural shape is hard-coded — a curve, a saturation, an interaction —
 *     it is commented with the reasoning.
 *
 *  2. Luck is loud. `model.luckWeight` scales the idiosyncratic component of
 *     almost every process. Set to its default the model produces enormous
 *     spread, because life does. A simulator in which your traits neatly
 *     determine your outcomes would be more satisfying and much less true.
 *
 *  3. Nothing here is a prediction about you. These are population-average
 *     relationships applied to a made-up person who shares some of your
 *     numbers. The distance between that and a forecast is the whole reason
 *     the app shows distributions instead of answers.
 */

import type { AssumptionValues } from './assumptions';
import { getLocation } from './locations';
import {
  bernoulli,
  categorical,
  clamp,
  correlatedNormals,
  exponential,
  logNormal,
  normal,
  pareto,
  remap,
  uniform,
  type Rng,
} from './rng';
import type {
  CareerField,
  DigitalTwin,
  EmploymentMode,
  SimEvent,
  SimState,
} from './types';

// ---------------------------------------------------------------------------
// Field characteristics
// ---------------------------------------------------------------------------

interface FieldProfile {
  /** Cognitive complexity, 0–1. Scales the return to cognitive ability. */
  complexity: number;
  /** How fast skills go stale, 0–1. Scales career capital decay. */
  churn: number;
  /** Multiplier on the baseline salary curve. */
  payLevel: number;
  /** How steeply pay rises with career capital. */
  paySlope: number;
  /** Baseline layoff exposure multiplier. */
  volatility: number;
  /** How readily the field supports founding something. */
  foundability: number;
}

const FIELDS: Record<CareerField, FieldProfile> = {
  software: { complexity: 0.85, churn: 0.8, payLevel: 1.5, paySlope: 1.25, volatility: 1.1, foundability: 1.3 },
  'data-ai': { complexity: 0.9, churn: 0.95, payLevel: 1.6, paySlope: 1.35, volatility: 1.15, foundability: 1.25 },
  finance: { complexity: 0.8, churn: 0.5, payLevel: 1.7, paySlope: 1.4, volatility: 1.3, foundability: 0.9 },
  medicine: { complexity: 0.9, churn: 0.3, payLevel: 1.5, paySlope: 0.75, volatility: 0.3, foundability: 0.5 },
  law: { complexity: 0.8, churn: 0.35, payLevel: 1.45, paySlope: 1.1, volatility: 0.7, foundability: 0.6 },
  academia: { complexity: 0.9, churn: 0.4, payLevel: 0.8, paySlope: 0.5, volatility: 0.9, foundability: 0.7 },
  design: { complexity: 0.6, churn: 0.7, payLevel: 1.0, paySlope: 1.0, volatility: 1.1, foundability: 1.1 },
  marketing: { complexity: 0.55, churn: 0.75, payLevel: 1.0, paySlope: 1.0, volatility: 1.15, foundability: 1.0 },
  sales: { complexity: 0.5, churn: 0.5, payLevel: 1.15, paySlope: 1.3, volatility: 1.35, foundability: 1.1 },
  operations: { complexity: 0.55, churn: 0.45, payLevel: 0.95, paySlope: 0.9, volatility: 1.0, foundability: 0.8 },
  engineering: { complexity: 0.8, churn: 0.45, payLevel: 1.15, paySlope: 0.95, volatility: 0.85, foundability: 0.9 },
  education: { complexity: 0.6, churn: 0.3, payLevel: 0.72, paySlope: 0.45, volatility: 0.45, foundability: 0.6 },
  'public-sector': { complexity: 0.55, churn: 0.3, payLevel: 0.82, paySlope: 0.55, volatility: 0.4, foundability: 0.4 },
  trades: { complexity: 0.45, churn: 0.25, payLevel: 0.95, paySlope: 0.8, volatility: 0.9, foundability: 1.0 },
  creative: { complexity: 0.6, churn: 0.6, payLevel: 0.72, paySlope: 1.15, volatility: 1.45, foundability: 1.1 },
  entrepreneurship: { complexity: 0.75, churn: 0.7, payLevel: 1.0, paySlope: 1.5, volatility: 1.7, foundability: 1.5 },
  other: { complexity: 0.6, churn: 0.5, payLevel: 1.0, paySlope: 1.0, volatility: 1.0, foundability: 0.9 },
};

export function fieldProfile(field: CareerField): FieldProfile {
  return FIELDS[field] ?? FIELDS.other;
}

const EMPLOYER_STAGE_RISK: Record<string, number> = {
  'pre-seed': 3.4,
  seed: 2.6,
  'series-a-b': 1.8,
  'late-stage': 1.2,
  public: 0.9,
  enterprise: 0.75,
  'public-sector': 0.4,
  'self-employed': 1.5,
};

// ---------------------------------------------------------------------------
// Modifiers — the only way a decision is allowed to touch the model
// ---------------------------------------------------------------------------

/**
 * A decision never edits the state directly. It contributes to this bundle,
 * and the bundle perturbs the dynamics. That indirection is what makes
 * leave-one-out attribution possible: switch one contribution off, re-run, and
 * the difference is that contribution's effect on every downstream number.
 */
export interface Modifiers {
  /** Multiplier applied once, at the moment of the decision. */
  incomeStepMultiplier: number;
  /** Added to annual real income growth for the whole horizon. */
  incomeGrowthDelta: number;
  /** Added to annual career capital change. */
  careerCapitalDelta: number;
  /** Added to annual network change. */
  networkDelta: number;
  /** Added to the stress target. */
  stressDelta: number;
  /** Added to annual health change. */
  healthDelta: number;
  /** Added to weekly hours. */
  hoursDelta: number;
  /** Multiplier on annual living costs. */
  spendMultiplier: number;
  /** Multiplier on the layoff hazard. */
  layoffMultiplier: number;
  /** Added to the annual separation hazard. */
  separationDelta: number;
  /** One-off wellbeing shock, decays with the adaptation half-life. */
  wellbeingShock: number;
  /** Persistent wellbeing offset that does not adapt away. */
  wellbeingPersistent: number;
  /** Multiplier on the rate at which opportunities arrive. */
  opportunityMultiplier: number;
  /** One-off cash cost, paid at the decision. */
  upfrontCost: number;
  /** Fractional change in savings rate. */
  savingsRateDelta: number;
  /** Set the employment mode. */
  mode?: EmploymentMode;
  /** Relocate. */
  locationId?: string;
  /** Years the mode change lasts before reverting to employment. */
  modeDurationYears?: number;
  /** Treat as a founder path with power-law outcomes. */
  venture?: boolean;
  /** Enrol in education for this many years. */
  studyYears?: number;
}

export function emptyModifiers(): Modifiers {
  return {
    incomeStepMultiplier: 1,
    incomeGrowthDelta: 0,
    careerCapitalDelta: 0,
    networkDelta: 0,
    stressDelta: 0,
    healthDelta: 0,
    hoursDelta: 0,
    spendMultiplier: 1,
    layoffMultiplier: 1,
    separationDelta: 0,
    wellbeingShock: 0,
    wellbeingPersistent: 0,
    opportunityMultiplier: 1,
    upfrontCost: 0,
    savingsRateDelta: 0,
  };
}

export function mergeModifiers(target: Modifiers, patch: Partial<Modifiers>): Modifiers {
  target.incomeStepMultiplier *= patch.incomeStepMultiplier ?? 1;
  target.incomeGrowthDelta += patch.incomeGrowthDelta ?? 0;
  target.careerCapitalDelta += patch.careerCapitalDelta ?? 0;
  target.networkDelta += patch.networkDelta ?? 0;
  target.stressDelta += patch.stressDelta ?? 0;
  target.healthDelta += patch.healthDelta ?? 0;
  target.hoursDelta += patch.hoursDelta ?? 0;
  target.spendMultiplier *= patch.spendMultiplier ?? 1;
  target.layoffMultiplier *= patch.layoffMultiplier ?? 1;
  target.separationDelta += patch.separationDelta ?? 0;
  target.wellbeingShock += patch.wellbeingShock ?? 0;
  target.wellbeingPersistent += patch.wellbeingPersistent ?? 0;
  target.opportunityMultiplier *= patch.opportunityMultiplier ?? 1;
  target.upfrontCost += patch.upfrontCost ?? 0;
  target.savingsRateDelta += patch.savingsRateDelta ?? 0;
  if (patch.mode) target.mode = patch.mode;
  if (patch.locationId) target.locationId = patch.locationId;
  if (patch.modeDurationYears !== undefined) target.modeDurationYears = patch.modeDurationYears;
  if (patch.venture) target.venture = true;
  if (patch.studyYears !== undefined) target.studyYears = patch.studyYears;
  return target;
}

// ---------------------------------------------------------------------------
// Traits, standardised
// ---------------------------------------------------------------------------

/** Everything about the person that stays fixed across a simulated life. */
export interface TraitVector {
  /** Each in standard-deviation units, centred on the population mean. */
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
  cognitive: number;
  risk: number;
  ambition: number;
  discipline: number;
  ambiguity: number;
  /** Wellbeing set point implied by disposition. */
  setPoint: number;
  field: CareerField;
  fieldProfile: FieldProfile;
  wantsChildren: boolean;
  partnerMobility: number;
  familySafetyNet: number;
  pensionRate: number;
  baseSavingsRate: number;
  baseHours: number;
  remoteShare: number;
  employerStageRisk: number;
  currency: string;
  /** Reference income used for the log-income wellbeing term. */
  incomeReference: number;
  /** Health habits, carried through so the health process can use them. */
  exerciseSessions: number;
  sleepHours: number;
  alcoholUnits: number;
  smoker: boolean;
}

/** 0–100 self-report to standard deviations, assuming the scale is roughly centred. */
const sd = (x: number) => (clamp(x, 0, 100) - 50) / 20;

export function deriveTraits(twin: DigitalTwin, params: AssumptionValues, rng: Rng): TraitVector {
  const b = twin.traits.bigFive;
  const profile = fieldProfile(twin.career.field);
  const home = getLocation(twin.identity.locationId);

  // A self-reported IQ estimate is treated as a noisy measurement, not a fact.
  // We draw the "true" value from a posterior centred on the estimate with the
  // stated standard error, so uncertainty about you propagates into the spread
  // of outcomes rather than being silently discarded.
  const cognitiveSd =
    twin.traits.cognition.method === 'unset'
      ? normal(rng, 0, 1) * 0.35
      : (twin.traits.cognition.estimate - 100) / 15 +
        normal(rng, 0, Math.max(0.1, twin.traits.cognition.standardError / 15));

  // Disposition-driven set point. Low neuroticism and high extraversion are the
  // two Big Five dimensions that most reliably track subjective wellbeing.
  const disposition = -1.15 * sd(b.neuroticism) + 0.75 * sd(b.extraversion) + 0.2 * sd(b.agreeableness);
  const setPoint = 50 + params['wellbeing.setPointWeight'] * disposition * 22;

  return {
    openness: sd(b.openness),
    conscientiousness: sd(b.conscientiousness),
    extraversion: sd(b.extraversion),
    agreeableness: sd(b.agreeableness),
    neuroticism: sd(b.neuroticism),
    cognitive: clamp(cognitiveSd, -3.5, 3.5),
    risk: sd(twin.traits.riskTolerance),
    ambition: sd(twin.traits.ambition),
    discipline: sd(twin.traits.discipline),
    ambiguity: sd(twin.traits.ambiguityTolerance),
    setPoint: clamp(setPoint, 20, 80),
    field: twin.career.field,
    fieldProfile: profile,
    wantsChildren: twin.relationship.wantsChildren,
    partnerMobility: twin.relationship.partnerMobility / 100,
    familySafetyNet: twin.finance.familySafetyNet / 100,
    pensionRate: twin.finance.pensionRate,
    baseSavingsRate: twin.habits.savingsRate,
    baseHours: twin.career.hoursPerWeek,
    remoteShare: twin.career.remoteShare,
    employerStageRisk: EMPLOYER_STAGE_RISK[twin.career.employerStage] ?? 1,
    currency: twin.finance.currency,
    incomeReference: 32000 * home.costIndex,
    exerciseSessions: twin.health.exerciseSessions,
    sleepHours: twin.health.sleepHours,
    alcoholUnits: twin.health.alcoholUnits,
    smoker: twin.health.smoker,
  };
}

/**
 * The net annual health effect of habits, relative to a sedentary,
 * seven-and-a-half-hour-sleeping, non-smoking baseline.
 *
 * Exercise saturates hard: the evidence is that most of the mortality benefit
 * is bought by the first few sessions a week and the curve is close to flat
 * beyond about five. Sleep is a U — deviation in either direction costs, but
 * short sleep costs roughly twice what long sleep does.
 */
export function habitHealthEffect(traits: TraitVector, params: AssumptionValues): number {
  const exercise = params['health.exerciseBenefit'] * 3.2 * (1 - Math.exp(-traits.exerciseSessions / 2.4));
  const sleepGap = traits.sleepHours - params['health.sleepOptimum'];
  const sleep = -(sleepGap < 0 ? 0.85 : 0.42) * sleepGap * sleepGap;
  const alcohol = -0.035 * Math.max(0, traits.alcoholUnits - 8);
  const smoking = traits.smoker ? -3.6 : 0;
  return exercise + sleep + alcohol + smoking;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

export function initialState(twin: DigitalTwin, traits: TraitVector, params: AssumptionValues): SimState {
  const debt = twin.finance.debts.reduce((sum, d) => sum + d.balance, 0);
  const skillLevel = twin.skills.length
    ? twin.skills.reduce((s, k) => s + k.level, 0) / twin.skills.length
    : 50;

  // Career capital is a composite: what you can do, who knows it, and how long
  // you have been proving it. Experience saturates — the twentieth year adds
  // much less than the third.
  const experienceTerm = 34 * (1 - Math.exp(-twin.career.yearsExperience / 7));
  const seniorityTerm =
    { entry: 0, mid: 8, senior: 16, lead: 22, executive: 28, founder: 20 }[twin.career.seniority] ?? 8;
  const careerCapital = clamp(
    18 + experienceTerm + seniorityTerm * 0.6 + (skillLevel - 50) * 0.28 + traits.cognitive * 3,
    1,
    100,
  );

  const networkStrength = clamp(
    18 +
      22 * (1 - Math.exp(-twin.network.professionalContacts / 60)) +
      18 * (1 - Math.exp(-twin.network.closeFriends / 6)) +
      twin.network.mentors * 3.5 +
      twin.network.reach * 0.22,
    1,
    100,
  );

  const partnered = ['partnered', 'engaged', 'married', 'dating'].includes(twin.relationship.status);

  const hoursStress = Math.max(0, twin.career.hoursPerWeek - 40) * 0.9;
  const stress = clamp(
    30 + hoursStress + (100 - twin.career.satisfaction) * 0.18 + sd(twin.traits.bigFive.neuroticism) * 9,
    0,
    100,
  );

  const state: SimState = {
    t: 0,
    age: twin.identity.age,
    alive: true,
    mode: twin.career.mode,
    field: twin.career.field,
    locationId: twin.identity.locationId,
    income: twin.finance.grossIncome + twin.finance.variableComp,
    partnerIncome: partnered ? twin.relationship.partnerIncome : 0,
    spend: twin.finance.livingCosts,
    liquid: twin.finance.cashSavings,
    invested: twin.finance.invested,
    debt,
    ventureEquity: 0,
    careerCapital,
    networkStrength,
    skillLevel,
    health: twin.health.selfRated,
    stress,
    relationshipQuality: partnered ? twin.relationship.satisfaction : 0,
    partnered,
    children: twin.relationship.children,
    happiness: 0,
    setPoint: traits.setPoint,
    runwayMonths: 0,
    optionality: 0,
    yearsInMode: 0,
    disruptions: 0,
  };

  state.runwayMonths = runway(state);
  state.optionality = optionality(state, traits);
  state.happiness = wellbeingBreakdown(
    state,
    traits,
    { ...BASELINE_CONTEXT, commuteMinutes: getLocation(twin.identity.locationId).commuteMinutes },
    params,
  ).total;
  return state;
}

// ---------------------------------------------------------------------------
// Tax — deliberately simple, deliberately visible
// ---------------------------------------------------------------------------

interface TaxBand {
  upTo: number;
  rate: number;
}

/**
 * A simplified progressive schedule. It is a stylised UK-shaped system scaled
 * by the local cost index — enough to make the difference between £60k and
 * £160k feel right, nowhere near enough to do your taxes with.
 */
const TAX_BANDS: TaxBand[] = [
  { upTo: 12570, rate: 0 },
  { upTo: 50270, rate: 0.28 },
  { upTo: 125140, rate: 0.42 },
  { upTo: Infinity, rate: 0.47 },
];

export function afterTax(gross: number, costIndex: number): number {
  const scale = Math.max(0.4, costIndex);
  let remaining = gross;
  let tax = 0;
  let previous = 0;
  for (const band of TAX_BANDS) {
    const ceiling = band.upTo === Infinity ? Infinity : band.upTo * scale;
    const slice = Math.max(0, Math.min(remaining, ceiling - previous));
    tax += slice * band.rate;
    remaining -= slice;
    previous = ceiling;
    if (remaining <= 0) break;
  }
  // The personal allowance taper: a nasty marginal spike that materially
  // changes the value of a raise in the £100k–£125k region.
  if (gross > 100000 * scale) {
    tax += Math.min(12570 * scale, (gross - 100000 * scale) * 0.5) * 0.42;
  }
  return Math.max(0, gross - tax);
}

// ---------------------------------------------------------------------------
// Derived measures
// ---------------------------------------------------------------------------

export function runway(s: SimState): number {
  if (s.spend <= 0) return 120;
  return clamp((s.liquid / s.spend) * 12, 0, 240);
}

export function netWorth(s: SimState): number {
  return s.liquid + s.invested + s.ventureEquity - s.debt;
}

/**
 * Optionality: how many viable next moves you have. High career capital, a
 * strong network, savings and health all buy it; debt and dependence spend it.
 * It is the closest thing the model has to a measure of freedom that is not
 * just money.
 */
export function optionality(s: SimState, traits: TraitVector): number {
  const financial = remap(s.runwayMonths, 0, 24, 0, 34);
  const career = s.careerCapital * 0.26;
  const social = s.networkStrength * 0.18;
  const bodily = remap(s.health, 40, 95, 0, 14);
  const drag = remap(s.debt / Math.max(1, s.income), 0, 5, 0, 18) + s.children * 2.4;
  const safety = traits.familySafetyNet * 6;
  return clamp(financial + career + social + bodily + safety - drag, 0, 100);
}

/** Share of annual spending that assets could cover indefinitely. */
export function financialFreedom(s: SimState, params: AssumptionValues): number {
  if (s.spend <= 0) return 100;
  const sustainable = Math.max(0, s.invested + s.liquid - s.debt) * params['wealth.safeWithdrawalRate'];
  return clamp((sustainable / s.spend) * 100, 0, 200);
}

// ---------------------------------------------------------------------------
// Wellbeing
// ---------------------------------------------------------------------------

export interface WellbeingContext {
  commuteMinutes: number;
  involuntarilyUnemployed: boolean;
  yearsSinceMove: number;
  childYoungestAge: number;
  purposeAlignment: number;
}

/** A settled life with no recent disruption — the reference point for t=0. */
const BASELINE_CONTEXT: WellbeingContext = {
  commuteMinutes: 30,
  involuntarilyUnemployed: false,
  yearsSinceMove: 99,
  childYoungestAge: 99,
  purposeAlignment: 0,
};

/** A single named contribution to wellbeing, kept so the UI can explain it. */
export interface WellbeingBreakdown {
  setPoint: number;
  income: number;
  relationship: number;
  health: number;
  stress: number;
  commute: number;
  unemployment: number;
  transition: number;
  children: number;
  purpose: number;
  total: number;
}

export function wellbeingBreakdown(
  s: SimState,
  traits: TraitVector,
  ctx: WellbeingContext,
  params: AssumptionValues,
): WellbeingBreakdown {
  const household = afterTax(s.income, 1) + afterTax(s.partnerIncome, 1);
  const perHead = household / Math.max(1, 1 + (s.partnered ? 0.7 : 0) + s.children * 0.4);
  const ratio = Math.max(0.05, perHead / Math.max(1000, traits.incomeReference));

  const income = params['wellbeing.logIncomeSlope'] * Math.log2(ratio);

  // Being single is not itself a penalty; a bad relationship is. The engine
  // scores relationship quality against a neutral point and gives single
  // people a small connection-based term via network strength instead.
  const relationship = s.partnered
    ? params['wellbeing.relationshipWeight'] * (s.relationshipQuality - 55)
    : params['wellbeing.relationshipWeight'] * (s.networkStrength - 55) * 0.45;

  const health = 0.24 * (s.health - 72);
  const stress = -params['wellbeing.stressWeight'] * (s.stress - 42);
  const commute = -params['wellbeing.commutePenalty'] * ((ctx.commuteMinutes * 2) / 60) * (1 - traits.remoteShare);
  const unemployment = ctx.involuntarilyUnemployed ? -params['wellbeing.unemploymentPenalty'] : 0;

  // Moving is a transition cost that fades over `moveAdjustmentYears`.
  const transition =
    ctx.yearsSinceMove < params['geography.moveAdjustmentYears']
      ? -5.5 * (1 - ctx.yearsSinceMove / params['geography.moveAdjustmentYears'])
      : 0;

  // The post-birth dip, concentrated in the first few years.
  const children =
    ctx.childYoungestAge < 5 ? -params['relationship.childWellbeingDip'] * (1 - ctx.childYoungestAge / 5) : 0;

  const purpose = ctx.purposeAlignment * 6;

  const total =
    traits.setPoint + income + relationship + health + stress + commute + unemployment + transition + children + purpose;

  return {
    setPoint: traits.setPoint,
    income,
    relationship,
    health,
    stress,
    commute,
    unemployment,
    transition,
    children,
    purpose,
    total: clamp(total, 0, 100),
  };
}

// ---------------------------------------------------------------------------
// The per-year step
// ---------------------------------------------------------------------------

/** Mutable bookkeeping that lives alongside the state for one simulated life. */
export interface SimContext {
  traits: TraitVector;
  params: AssumptionValues;
  mods: Modifiers;
  /** AR(1) macroeconomic latent, roughly in [-2.5, 2.5]. */
  economy: number;
  /** Transient wellbeing shocks, decaying. */
  shockStock: number;
  /** Years since the last relocation. */
  yearsSinceMove: number;
  /** Age of the youngest child, or 99. */
  youngestChild: number;
  /** Years remaining in a temporary mode (sabbatical, study, venture). */
  modeYearsLeft: number;
  /** Years spent unemployed involuntarily and still looking. */
  jobSearchYears: number;
  involuntary: boolean;
  /** Venture state, when on a founder path. */
  venture?: VentureState;
  /** Baseline weekly hours including modifiers. */
  hours: number;
  savingsRate: number;
  /** Records events; only populated for sampled paths. */
  record?: SimEvent[];
  /** Cumulative discounted wellbeing. */
  wellbeingIntegral: number;
  worstNetWorth: number;
  ranOutOfMoney: boolean;
}

interface VentureState {
  yearsRunning: number;
  resolved: boolean;
  /** Quality draw, standard normal — persistent luck of the specific idea. */
  quality: number;
}

export function createContext(
  traits: TraitVector,
  params: AssumptionValues,
  mods: Modifiers,
  rng: Rng,
): SimContext {
  return {
    traits,
    params,
    mods,
    economy: normal(rng, 0, 1),
    shockStock: mods.wellbeingShock,
    yearsSinceMove: mods.locationId ? 0 : 99,
    youngestChild: 99,
    modeYearsLeft: mods.modeDurationYears ?? 0,
    jobSearchYears: 0,
    involuntary: false,
    venture: mods.venture ? { yearsRunning: 0, resolved: false, quality: normal(rng, 0, 1) } : undefined,
    hours: traits.baseHours + mods.hoursDelta,
    savingsRate: clamp(traits.baseSavingsRate + mods.savingsRateDelta, 0, 0.9),
    wellbeingIntegral: 0,
    worstNetWorth: Infinity,
    ranOutOfMoney: false,
  };
}

/** Apply the one-off effects of a decision at t=0. */
export function applyImmediate(s: SimState, ctx: SimContext): void {
  const m = ctx.mods;
  s.income *= m.incomeStepMultiplier;
  s.liquid -= m.upfrontCost;
  if (m.mode) {
    s.mode = m.mode;
    s.yearsInMode = 0;
    s.disruptions += 1;
  }
  if (m.locationId && m.locationId !== s.locationId) {
    const from = getLocation(s.locationId);
    const to = getLocation(m.locationId);
    // Costs re-index to the destination immediately; salary does not, because
    // a relocation package rarely re-prices you to the local market on day one.
    s.spend *= to.costIndex / from.costIndex;
    s.locationId = m.locationId;
    s.disruptions += 1;
  }
  s.spend *= m.spendMultiplier;
  s.runwayMonths = runway(s);
}

function log(ctx: SimContext, t: number, kind: SimEvent['kind'], label: string, magnitude?: number): void {
  ctx.record?.push({ t, kind, label, magnitude });
}

/**
 * Advance one year. Mutates `s` and `ctx`.
 *
 * Order matters and is chosen to avoid a state variable being read after it
 * has already been updated for the new year: economy first, then shocks, then
 * the slow stocks (career capital, health), then flows (income, wealth), then
 * wellbeing last, since it reads everything else.
 */
export function step(s: SimState, ctx: SimContext, rng: Rng): void {
  const { params, traits, mods } = ctx;
  const luck = params['model.luckWeight'];
  const loc = getLocation(s.locationId);

  s.t += 1;
  s.age += 1;
  s.yearsInMode += 1;
  ctx.yearsSinceMove += 1;
  if (ctx.youngestChild < 99) ctx.youngestChild += 1;

  // -- 1. Macroeconomy -----------------------------------------------------
  const rho = params['model.economyPersistence'];
  ctx.economy = rho * ctx.economy + Math.sqrt(Math.max(0, 1 - rho * rho)) * normal(rng, 0, 1);
  const econ = clamp(ctx.economy, -3, 3);

  // -- 2. Investment returns ----------------------------------------------
  // Returns co-move with the economy, which is what makes a downturn hit your
  // portfolio and your job security in the same year.
  const [zMarket] = correlatedNormals(rng, 0.35);
  let realReturn = params['wealth.realReturn'] + params['wealth.returnVolatility'] * (0.55 * econ * 0.4 + zMarket * 0.9);
  if (bernoulli(rng, params['wealth.crashProbability'] * (econ < -0.5 ? 1.9 : 1))) {
    const depth = uniform(rng, 0.25, 0.48);
    realReturn = -depth;
    log(ctx, s.t, 'market-crash', `Markets fell ${Math.round(depth * 100)}%`, -depth);
  } else if (realReturn > 0.3) {
    log(ctx, s.t, 'market-boom', `Strong market year, +${Math.round(realReturn * 100)}%`, realReturn);
  }

  // -- 3. Mode transitions -------------------------------------------------
  if (ctx.modeYearsLeft > 0) {
    ctx.modeYearsLeft -= 1;
    if (ctx.modeYearsLeft === 0 && s.mode !== 'employed' && !ctx.venture) {
      s.mode = 'employed';
      s.yearsInMode = 0;
      // Re-entry after a break is priced off career capital, with a scar.
      const scar = 1 - clamp(0.06 * s.t + 0.04 * s.disruptions, 0, 0.25);
      s.income = marketSalary(s, traits, loc) * scar;
      log(ctx, s.t, 'job-change', 'Returned to employment', 0);
    }
  }

  // -- 4. Venture resolution ----------------------------------------------
  if (ctx.venture && !ctx.venture.resolved) {
    ctx.venture.yearsRunning += 1;
    resolveVenture(s, ctx, rng);
  }

  // -- 5. Career capital and skill ----------------------------------------
  const practice = clamp(
    (traits.baseSavingsRate >= 0 ? 1 : 1) *
      (0.6 + 0.4 * (traits.discipline + 1)) *
      (s.mode === 'student' ? 1.6 : s.mode === 'founder' ? 1.25 : s.mode === 'employed' ? 1 : 0.45),
    0,
    2.4,
  );
  const stretch = clamp(1 + 0.35 * traits.openness - 0.02 * Math.max(0, s.yearsInMode - 5), 0.35, 1.6);
  const capitalGain = params['career.capitalGrowthRate'] * practice * stretch;
  const capitalLoss =
    params['career.capitalDecayRate'] *
    traits.fieldProfile.churn *
    (s.mode === 'employed' || s.mode === 'founder' || s.mode === 'student' ? 0.35 : 1);
  const capitalNoise = normal(rng, 0, 1.1 * luck);
  s.careerCapital = clamp(
    s.careerCapital + capitalGain - capitalLoss + mods.careerCapitalDelta + capitalNoise,
    1,
    100,
  );

  s.skillLevel = clamp(s.skillLevel + (capitalGain - capitalLoss) * 0.8 + normal(rng, 0, 0.9 * luck), 1, 100);

  // -- 6. Network ----------------------------------------------------------
  const networkGain =
    0.9 * (1 + 0.45 * traits.extraversion) * (loc.opportunityIndex / 60) * (s.mode === 'employed' || s.mode === 'founder' ? 1 : 0.6);
  const networkDecay = 1.4 + (ctx.yearsSinceMove < 3 ? 2.2 : 0);
  s.networkStrength = clamp(
    s.networkStrength + networkGain - networkDecay + mods.networkDelta + normal(rng, 0, 1.0 * luck),
    1,
    100,
  );

  // -- 7. Employment shocks ------------------------------------------------
  if (s.mode === 'employed' || s.mode === 'freelance') {
    const seniorityShield = clamp(1 - (s.careerCapital - 50) / 220, 0.55, 1.35);
    const layoffP = clamp(
      params['career.layoffBaseRate'] *
        traits.employerStageRisk *
        traits.fieldProfile.volatility *
        seniorityShield *
        Math.exp(-0.45 * econ) *
        mods.layoffMultiplier,
      0,
      0.9,
    );
    if (bernoulli(rng, layoffP)) {
      s.mode = 'unemployed';
      ctx.involuntary = true;
      ctx.jobSearchYears = 0;
      s.disruptions += 1;
      s.yearsInMode = 0;
      log(ctx, s.t, 'layoff', 'Lost the job', -1);
    }
  }

  if (s.mode === 'unemployed') {
    ctx.jobSearchYears += 1;
    // Re-employment hazard: capital and network dominate, the cycle modulates.
    const hazard = clamp(
      0.55 +
        0.3 * ((s.careerCapital - 50) / 50) +
        0.2 * ((s.networkStrength - 50) / 50) +
        0.15 * econ -
        0.12 * ctx.jobSearchYears,
      0.05,
      0.95,
    );
    s.income = Math.max(0, s.income * 0.12); // statutory support, heavily stylised
    if (bernoulli(rng, hazard)) {
      s.mode = 'employed';
      s.yearsInMode = 0;
      ctx.involuntary = false;
      // Wage scarring after involuntary loss is real and persistent.
      const scarring = clamp(0.9 - 0.06 * ctx.jobSearchYears, 0.6, 0.95);
      s.income = marketSalary(s, traits, loc) * scarring;
      log(ctx, s.t, 'job-change', 'Found a new role', 0);
      ctx.jobSearchYears = 0;
    }
  }

  // -- 8. Income growth ----------------------------------------------------
  if (s.mode === 'employed' || s.mode === 'freelance') {
    const expYears = Math.max(0, s.age - 22);
    // Concave age–earnings profile: steep early, flat late, slightly negative
    // at the very end of a career.
    const experienceReturn = params['income.experienceReturn'] * Math.exp(-expYears / 14) - (s.age > 55 ? 0.008 : 0);
    const traitReturn =
      params['income.conscientiousnessReturn'] * traits.conscientiousness * 0.5 +
      params['income.cognitiveReturn'] * traits.cognitive * traits.fieldProfile.complexity * 0.5;
    const capitalReturn = 0.012 * ((s.careerCapital - 50) / 25) * traits.fieldProfile.paySlope;
    const cyclical = 0.012 * econ;

    const deterministic =
      params['income.baseRealGrowth'] + experienceReturn + traitReturn + capitalReturn + cyclical + mods.incomeGrowthDelta;

    const shock = logNormal(rng, 1, params['income.shockSigma'] * luck) - 1;
    s.income = Math.max(0, s.income * (1 + deterministic + shock));

    // Opportunities arriving through the network.
    const opportunityRate =
      params['career.networkOpportunityRate'] *
      (s.networkStrength / 60) *
      clamp(1 + 0.25 * econ, 0.4, 1.8) *
      mods.opportunityMultiplier;
    // Time to the next opportunity is exponential; one arrives this year if
    // that waiting time is under a year.
    const opportunityArrived = exponential(rng, Math.max(0.05, opportunityRate)) < 1;
    if (opportunityArrived) {
      const premium = params['income.jobChangePremium'] * clamp(1 + 0.3 * econ, 0.3, 1.6) * (0.5 + Math.abs(normal(rng, 0, 0.6)));
      // Whether you take it depends on ambition and on how bad things are.
      const inclination = 0.3 + 0.25 * traits.ambition + (s.stress > 65 ? 0.2 : 0) - (s.yearsInMode < 2 ? 0.2 : 0);
      if (bernoulli(rng, clamp(inclination, 0.05, 0.85))) {
        s.income *= 1 + premium;
        s.yearsInMode = 0;
        s.networkStrength = clamp(s.networkStrength + 2, 1, 100);
        log(ctx, s.t, 'job-change', `Moved for a ${Math.round(premium * 100)}% rise`, premium);
      }
    }
  } else if (s.mode === 'founder' && ctx.venture && !ctx.venture.resolved) {
    s.income = marketSalary(s, traits, loc) * params['startup.founderSalaryRatio'];
  } else if (s.mode === 'student') {
    s.income = Math.max(0, s.income * 0.15);
  } else if (s.mode === 'sabbatical') {
    s.income = 0;
  }

  // Partner income tracks the economy loosely.
  if (s.partnered && s.partnerIncome > 0) {
    s.partnerIncome *= 1 + params['income.baseRealGrowth'] + normal(rng, 0, 0.08 * luck) + 0.008 * econ;
  }

  // -- 9. Hours, stress ----------------------------------------------------
  const hours =
    ctx.hours +
    (s.mode === 'founder' ? params['startup.hoursPremium'] : 0) +
    (s.mode === 'unemployed' || s.mode === 'sabbatical' ? -ctx.hours : 0);
  const overwork = Math.max(0, hours - params['career.burnoutThreshold']);
  s.runwayMonths = runway(s);
  const financialStrain = remap(s.runwayMonths, params['wealth.runwayStressPoint'], 0, 0, 28);
  const stressTarget = clamp(
    34 +
      overwork * 1.15 +
      financialStrain +
      traits.neuroticism * 8 +
      (s.mode === 'founder' ? 9 : 0) +
      (ctx.involuntary ? 14 : 0) +
      s.children * 3.2 -
      (s.partnered ? s.relationshipQuality * 0.06 : 0) -
      remap(s.health, 40, 95, 8, -4) +
      mods.stressDelta,
    0,
    100,
  );
  // Stress adjusts fast but not instantly.
  s.stress = clamp(s.stress + (stressTarget - s.stress) * 0.55 + normal(rng, 0, 3 * luck), 0, 100);

  // -- 10. Health ----------------------------------------------------------
  const ageDecline = params['health.ageDeclineRate'] * Math.exp((s.age - 40) / 26);
  // Habits are a yearly flow against that decline. They do not stop ageing;
  // on the default numbers a very good regime buys roughly a decade of the
  // curve, which is about what the epidemiology supports.
  const habitTerm = habitHealthEffect(traits, params) * 0.22;
  const stressHealth = s.stress > 70 ? params['health.stressHealthCost'] * ((s.stress - 70) / 30) : 0;
  const socialHealth = params['health.socialConnectionBenefit'] * ((s.networkStrength - 50) / 100);
  s.health = clamp(
    s.health - ageDecline + habitTerm - stressHealth + socialHealth * 0.35 + mods.healthDelta + normal(rng, 0, 1.4 * luck),
    1,
    100,
  );

  const shockP = clamp(
    params['health.shockProbability40'] * Math.exp((s.age - 40) / 12) * remap(s.health, 90, 30, 0.6, 2.4),
    0,
    0.6,
  );
  if (bernoulli(rng, shockP)) {
    const severity = uniform(rng, 8, 30);
    s.health = clamp(s.health - severity, 1, 100);
    s.disruptions += 1;
    if (severity > 20 && (s.mode === 'employed' || s.mode === 'founder')) {
      s.income *= 0.75;
    }
    log(ctx, s.t, 'health-shock', 'Serious health event', -severity);
  } else if (s.health < 70 && bernoulli(rng, 0.25)) {
    s.health = clamp(s.health + uniform(rng, 1, 5), 1, 100);
  }

  // Mortality. Rare inside a typical horizon, but the model should not pretend
  // it is impossible, because that quietly biases every long-run average up.
  const mortality = clamp(0.00035 * Math.exp((s.age - 40) / 9.5) * remap(s.health, 90, 20, 0.7, 3.2), 0, 0.9);
  if (bernoulli(rng, mortality)) {
    s.alive = false;
    return;
  }

  // -- 11. Relationships ---------------------------------------------------
  stepRelationships(s, ctx, rng);

  // -- 12. Spending and wealth --------------------------------------------
  const previousSpend = s.spend;
  const householdGross = s.income + s.partnerIncome;
  const net = afterTax(s.income * (1 - traits.pensionRate), loc.costIndex) + afterTax(s.partnerIncome, loc.costIndex);

  // Lifestyle inflation: spending chases income upward, and is far stickier
  // going down. This asymmetry is most of why high earners still feel broke.
  const targetSpend =
    previousSpend + Math.max(0, net - previousSpend) * params['wealth.lifestyleInflation'] * clamp(1 - 0.3 * traits.discipline, 0.4, 1.5);
  s.spend = Math.max(previousSpend * 0.94, targetSpend) + params['relationship.childAnnualCost'] * s.children * 0.12;
  s.spend = Math.max(s.spend, 0);

  const surplus = net - s.spend;
  const pensionFlow = s.income * traits.pensionRate;

  s.invested = Math.max(0, s.invested * (1 + realReturn) + pensionFlow);
  if (surplus >= 0) {
    const toInvest = surplus * clamp(ctx.savingsRate + 0.3, 0, 1);
    s.liquid += surplus - toInvest;
    s.invested += toInvest;
  } else {
    s.liquid += surplus;
    if (s.liquid < 0) {
      // Draw down investments, then take on debt.
      const shortfall = -s.liquid;
      const fromInvested = Math.min(s.invested, shortfall);
      s.invested -= fromInvested;
      s.liquid = 0;
      const stillShort = shortfall - fromInvested;
      if (stillShort > 0) {
        // A family safety net absorbs part of the shortfall before debt does.
        const cushion = stillShort * traits.familySafetyNet * 0.5;
        s.debt += stillShort - cushion;
        ctx.ranOutOfMoney = true;
      }
    }
  }

  // Debt services at a blended rate and amortises when there is surplus.
  if (s.debt > 0) {
    s.debt *= 1.045;
    const repayment = Math.min(s.debt, Math.max(0, surplus) * 0.4 + s.debt * 0.08);
    s.debt = Math.max(0, s.debt - repayment);
    s.liquid = Math.max(0, s.liquid - repayment * 0.4);
  }

  s.runwayMonths = runway(s);
  s.optionality = optionality(s, traits);
  const nw = netWorth(s);
  if (nw < ctx.worstNetWorth) ctx.worstNetWorth = nw;

  // -- 13. Wellbeing -------------------------------------------------------
  const ctxW: WellbeingContext = {
    commuteMinutes: loc.commuteMinutes,
    involuntarilyUnemployed: ctx.involuntary && s.mode === 'unemployed',
    yearsSinceMove: ctx.yearsSinceMove,
    childYoungestAge: ctx.youngestChild,
    purposeAlignment: purposeAlignment(s, traits),
  };
  const breakdown = wellbeingBreakdown(s, traits, ctxW, params);

  // Transient shocks decay toward zero at the adaptation half-life.
  const decay = Math.pow(0.5, 1 / Math.max(0.05, params['wellbeing.adaptationHalfLife']));
  ctx.shockStock = ctx.shockStock * decay;

  const target = clamp(breakdown.total + mods.wellbeingPersistent + ctx.shockStock, 0, 100);
  // Wellbeing itself has inertia — it does not jump to its target in one year.
  s.happiness = clamp(s.happiness + (target - s.happiness) * 0.6 + normal(rng, 0, 2.2 * luck), 0, 100);
  s.setPoint = traits.setPoint;

  const discount = Math.pow(1 + params['wellbeing.discountRate'], -s.t);
  ctx.wellbeingIntegral += s.happiness * discount;
}

/** What the market would pay someone with this profile, right now. */
export function marketSalary(s: SimState, traits: TraitVector, loc = getLocation(s.locationId)): number {
  const base = 30000 * traits.fieldProfile.payLevel * loc.salaryIndex;
  const capital = Math.pow(Math.max(0.2, s.careerCapital / 50), 1.15 * traits.fieldProfile.paySlope);
  return base * capital;
}

/**
 * How well the current life matches what the person says they care about.
 * Returns roughly -1 to +1. This is what lets the model distinguish a
 * lucrative path someone hates from a lucrative path someone wants.
 */
function purposeAlignment(s: SimState, traits: TraitVector): number {
  const autonomy = s.mode === 'founder' || s.mode === 'freelance' ? 0.5 : 0;
  const security = s.runwayMonths > 12 ? 0.3 : -0.3;
  const growth = s.careerCapital > 60 ? 0.25 : 0;
  return clamp(
    autonomy * clamp(traits.risk, -1, 1) + security * clamp(-traits.risk, -1, 1) + growth * clamp(traits.ambition, -1, 1),
    -1,
    1,
  );
}

// ---------------------------------------------------------------------------
// Sub-processes
// ---------------------------------------------------------------------------

function resolveVenture(s: SimState, ctx: SimContext, rng: Rng): void {
  const v = ctx.venture!;
  const { params, traits } = ctx;

  // Hazard of the question being settled this year. Most things resolve
  // within a few years one way or another.
  const resolveP = clamp(0.18 + 0.1 * v.yearsRunning, 0, 0.75);
  if (!bernoulli(rng, resolveP)) return;

  v.resolved = true;
  s.disruptions += 1;

  // Founder quality shifts the odds but does not remotely determine them.
  // A one-standard-deviation better founder gets a meaningfully better shot
  // and still fails most of the time, which is the honest shape of this.
  const edge =
    0.35 * v.quality +
    0.25 * traits.ambition +
    0.2 * traits.conscientiousness +
    0.2 * traits.ambiguity +
    0.3 * ((s.careerCapital - 50) / 25) +
    0.25 * ((s.networkStrength - 50) / 25) +
    0.35 * ctx.economy * 0.4;
  const tilt = Math.exp(clamp(edge, -2, 2) * 0.55);

  const wFail = params['startup.failureRate'];
  const wAcq = params['startup.acquisitionRate'] * tilt;
  const wBreak = params['startup.breakoutRate'] * tilt * tilt;
  const outcome = categorical(rng, [wFail, wAcq, wBreak]);

  const marketPay = marketSalary(s, traits);

  if (outcome === 0) {
    log(ctx, s.t, 'startup-failed', 'The company did not work out', -1);
    s.mode = 'employed';
    s.yearsInMode = 0;
    // A failed venture is not a wasted one: it accelerated career capital.
    // But a very long unsuccessful run stops being a credential.
    const drag = clamp(1 - 0.08 * Math.max(0, v.yearsRunning - 3), 0.6, 1);
    s.careerCapital = clamp(s.careerCapital + params['startup.careerCapitalBonus'] * v.yearsRunning * drag * 0.5, 1, 100);
    s.income = marketPay * clamp(0.85 + 0.03 * v.yearsRunning, 0.75, 1.05);
    ctx.shockStock -= 7;
  } else if (outcome === 1) {
    const proceeds = logNormal(rng, marketPay * 2.4, 0.85);
    s.liquid += proceeds;
    log(ctx, s.t, 'startup-acquired', 'Acquired', proceeds);
    s.mode = 'employed';
    s.yearsInMode = 0;
    s.careerCapital = clamp(s.careerCapital + 9, 1, 100);
    s.networkStrength = clamp(s.networkStrength + 8, 1, 100);
    s.income = marketPay * 1.15;
    ctx.shockStock += 9;
  } else {
    const proceeds = pareto(rng, params['startup.breakoutParetoAlpha'], marketPay * 22);
    s.liquid += proceeds * 0.35;
    s.invested += proceeds * 0.65;
    log(ctx, s.t, 'startup-breakout', 'Breakout outcome', proceeds);
    s.careerCapital = clamp(s.careerCapital + 22, 1, 100);
    s.networkStrength = clamp(s.networkStrength + 20, 1, 100);
    s.mode = 'employed';
    s.income = marketPay * 1.5;
    ctx.shockStock += 14;
  }
}

function stepRelationships(s: SimState, ctx: SimContext, rng: Rng): void {
  const { params, traits, mods } = ctx;
  const loc = getLocation(s.locationId);

  if (!s.partnered) {
    // Formation hazard: age-shaped, higher for extraverts, lower when working
    // very long hours or newly arrived somewhere.
    const ageFactor = Math.exp(-Math.pow((s.age - 30) / 18, 2));
    const p = clamp(
      params['relationship.formationRate'] *
        ageFactor *
        (1 + 0.35 * traits.extraversion) *
        (loc.socialFormationIndex / 65) *
        (ctx.yearsSinceMove < 2 ? 0.65 : 1) *
        (s.stress > 70 ? 0.7 : 1),
      0,
      0.85,
    );
    if (bernoulli(rng, p)) {
      s.partnered = true;
      s.relationshipQuality = clamp(normal(rng, 70, 12), 20, 100);
      s.partnerIncome = Math.max(0, normal(rng, marketSalary(s, traits, loc) * 0.75, marketSalary(s, traits, loc) * 0.4));
      ctx.shockStock += 6;
      log(ctx, s.t, 'relationship-formed', 'Met someone', 6);
    }
    return;
  }

  // Quality drifts: stress and long hours erode it, time together stabilises it.
  const erosion = 0.05 * Math.max(0, s.stress - 55) + 0.04 * Math.max(0, ctx.hours - 50);
  const repair = 1.1 + 0.4 * traits.agreeableness;
  s.relationshipQuality = clamp(
    s.relationshipQuality - erosion + repair + normal(rng, 0, 3.5 * params['model.luckWeight']),
    0,
    100,
  );

  // Separation hazard rises sharply as quality falls, and is front-loaded in
  // the first years of a partnership.
  const qualityHazard = remap(s.relationshipQuality, 75, 25, 0, 0.22);
  const separationP = clamp(
    params['relationship.dissolutionRate'] +
      qualityHazard +
      mods.separationDelta +
      (ctx.yearsSinceMove < 2 ? params['relationship.relocationStrain'] * (1 - traits.partnerMobility) : 0),
    0,
    0.85,
  );
  if (bernoulli(rng, separationP)) {
    s.partnered = false;
    s.relationshipQuality = 0;
    s.partnerIncome = 0;
    s.disruptions += 1;
    // Separation also splits assets, which is a real financial event and one
    // people routinely leave out when they imagine this branch.
    const split = uniform(rng, 0.35, 0.5);
    s.liquid *= 1 - split * 0.5;
    s.invested *= 1 - split * 0.5;
    ctx.shockStock -= 10;
    log(ctx, s.t, 'relationship-ended', 'The relationship ended', -10);
    return;
  }

  // Children.
  if (traits.wantsChildren && s.children < 3 && s.age >= 24 && s.age <= 45) {
    const p = clamp(
      0.16 * Math.exp(-Math.pow((s.age - 32) / 9, 2)) * (s.relationshipQuality / 70) * (s.runwayMonths > 4 ? 1 : 0.6),
      0,
      0.5,
    );
    if (bernoulli(rng, p)) {
      s.children += 1;
      ctx.youngestChild = 0;
      s.spend += params['relationship.childAnnualCost'];
      ctx.shockStock += 5;
      log(ctx, s.t, 'child-born', 'A child was born', 5);
    }
  }
}
