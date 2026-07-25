/**
 * The vocabulary of the simulation.
 *
 * Two things live here and it is worth keeping them straight:
 *
 *  - `DigitalTwin` is the *portrait*. It is what onboarding and the importers
 *    fill in. It is stable, human-readable, and never mutated by a simulation.
 *  - `SimState` is the *particle*. Ten thousand copies of it are spun up from
 *    one twin and marched forward through time, each on its own random path.
 */

// ---------------------------------------------------------------------------
// Portrait: the digital twin
// ---------------------------------------------------------------------------

export type Currency = 'GBP' | 'USD' | 'EUR';

export interface BigFive {
  /** Openness to experience. */
  openness: number;
  /** Conscientiousness. */
  conscientiousness: number;
  /** Extraversion. */
  extraversion: number;
  /** Agreeableness. */
  agreeableness: number;
  /** Neuroticism (higher = more emotionally reactive). */
  neuroticism: number;
}

export type BigFiveTrait = keyof BigFive;

export type EducationLevel =
  | 'none'
  | 'secondary'
  | 'vocational'
  | 'bachelors'
  | 'masters'
  | 'doctorate';

export type CareerField =
  | 'software'
  | 'data-ai'
  | 'finance'
  | 'medicine'
  | 'law'
  | 'academia'
  | 'design'
  | 'marketing'
  | 'sales'
  | 'operations'
  | 'engineering'
  | 'education'
  | 'public-sector'
  | 'trades'
  | 'creative'
  | 'entrepreneurship'
  | 'other';

export type Seniority = 'entry' | 'mid' | 'senior' | 'lead' | 'executive' | 'founder';

export type EmploymentMode =
  | 'employed'
  | 'founder'
  | 'freelance'
  | 'student'
  | 'sabbatical'
  | 'unemployed'
  | 'retired';

export type EmployerStage =
  | 'pre-seed'
  | 'seed'
  | 'series-a-b'
  | 'late-stage'
  | 'public'
  | 'enterprise'
  | 'public-sector'
  | 'self-employed';

export type RelationshipStatus =
  | 'single'
  | 'dating'
  | 'partnered'
  | 'engaged'
  | 'married'
  | 'separated';

export type ValueId =
  | 'wealth'
  | 'freedom'
  | 'security'
  | 'status'
  | 'impact'
  | 'creativity'
  | 'family'
  | 'health'
  | 'adventure'
  | 'mastery'
  | 'community'
  | 'tranquillity';

/** Any measure the simulation can report on and the user can weight. */
export type OutcomeMetric =
  | 'netWorth'
  | 'income'
  | 'happiness'
  | 'health'
  | 'stress'
  | 'careerCapital'
  | 'relationshipQuality'
  | 'freedom'
  | 'optionality';

export interface Debt {
  id: string;
  label: string;
  balance: number;
  /** Annual nominal interest rate, e.g. 0.062 for 6.2%. */
  rate: number;
  /** Minimum annual payment. */
  annualPayment: number;
  kind: 'student' | 'mortgage' | 'credit' | 'personal' | 'business';
}

export interface Skill {
  id: string;
  label: string;
  /** 0–100 self-assessed proficiency. */
  level: number;
  /** How much the market currently pays for it, 0–100. */
  marketValue: number;
  /** Hours per week actively practised. */
  practiceHours: number;
}

export interface Goal {
  id: string;
  label: string;
  metric: OutcomeMetric;
  /** Target value in the metric's own unit. */
  target: number;
  /** Deadline in years from now. */
  horizonYears: number;
  importance: number;
}

export interface LocationProfile {
  id: string;
  city: string;
  country: string;
  currency: Currency;
  /** Multiplier on baseline UK national salary for the same role. */
  salaryIndex: number;
  /** Multiplier on baseline UK cost of living. */
  costIndex: number;
  /** Opportunity density: jobs, investors, collaborators. 0–100. */
  opportunityIndex: number;
  /** Annual rate of new close ties formed on arrival, before decay. */
  socialFormationIndex: number;
  /** Self-reported life satisfaction of residents, 0–100. */
  lifeSatisfactionIndex: number;
  /** Typical one-way commute, minutes. */
  commuteMinutes: number;
  /** Housing cost as a share of median local income. */
  housingBurden: number;
}

export interface HealthProfile {
  /** 0–100 self-rated health. */
  selfRated: number;
  sleepHours: number;
  /** Vigorous or moderate sessions per week. */
  exerciseSessions: number;
  /** UK units of alcohol per week. */
  alcoholUnits: number;
  smoker: boolean;
  /** Named chronic conditions, free text. Used qualitatively only. */
  conditions: string[];
  /** Body mass index, optional. */
  bmi?: number;
}

export interface NetworkProfile {
  /** People who would take a call from you about work. */
  professionalContacts: number;
  /** People you could call at 3am. */
  closeFriends: number;
  mentors: number;
  /** Breadth across industries/functions, 0–100. */
  reach: number;
}

export interface HabitProfile {
  /** Deliberate skill practice, hours per week. */
  deliberatePractice: number;
  /** Non-work screen time, hours per day. */
  discretionaryScreen: number;
  /** Savings rate as a fraction of net income. */
  savingsRate: number;
  /** Reading/learning hours per week. */
  learningHours: number;
  /** Social contact events per week. */
  socialContact: number;
}

export interface TwinIdentity {
  displayName: string;
  age: number;
  locationId: string;
  /** Free text. Never used for inference — only shown back to the user. */
  note?: string;
}

export interface TwinCareer {
  title: string;
  field: CareerField;
  seniority: Seniority;
  mode: EmploymentMode;
  employerStage: EmployerStage;
  yearsExperience: number;
  /** 0–100. */
  satisfaction: number;
  hoursPerWeek: number;
  /** 0 = fully onsite, 1 = fully remote. */
  remoteShare: number;
  /** Probability the user assigns to being let go in the next year, 0–1. */
  perceivedJobSecurity: number;
}

export interface TwinFinance {
  currency: Currency;
  /** Annual gross, in `currency`. */
  grossIncome: number;
  /** Equity/bonus, annualised expected value. */
  variableComp: number;
  cashSavings: number;
  invested: number;
  /** Annual, all-in. */
  livingCosts: number;
  debts: Debt[];
  /** Fraction of gross going to pension. */
  pensionRate: number;
  dependents: number;
  /** Expected inheritance/family backstop, 0–100 confidence in a safety net. */
  familySafetyNet: number;
}

export interface TwinEducation {
  highest: EducationLevel;
  fieldOfStudy: string;
  /** Institutional selectivity proxy, 0–100. Used only for signalling effects. */
  institutionTier: number;
  /** Graduation year, used for age-earnings profile alignment. */
  graduationYear?: number;
}

export interface TwinRelationship {
  status: RelationshipStatus;
  /** 0–100. */
  satisfaction: number;
  yearsTogether: number;
  partnerIncome: number;
  /** Partner's willingness to relocate, 0–100. */
  partnerMobility: number;
  children: number;
  wantsChildren: boolean;
}

export interface TwinCognition {
  /** Estimated IQ-scale score. Treated as a weak prior, never as destiny. */
  estimate: number;
  /** How the estimate was arrived at — shown wherever it is used. */
  method: 'self-report' | 'test' | 'proxy' | 'unset';
  /** Standard error the engine should attach to the estimate. */
  standardError: number;
}

export interface TwinTraits {
  bigFive: BigFive;
  cognition: TwinCognition;
  /** 0–100 on each. */
  riskTolerance: number;
  ambition: number;
  discipline: number;
  /** Tolerance for ambiguity — matters for founder and career-switch paths. */
  ambiguityTolerance: number;
}

export type ImportSourceId =
  | 'github'
  | 'apple-health'
  | 'bank-csv'
  | 'google-calendar'
  | 'linkedin'
  | 'screen-time'
  | 'spotify'
  | 'reading'
  | 'manual';

export interface ImportRecord {
  id: string;
  source: ImportSourceId;
  importedAt: string;
  /** Human summary of what was taken, shown in the audit trail. */
  summary: string;
  /** Which twin fields this import wrote to. */
  fieldsTouched: string[];
  /** Raw derived signals, kept for provenance. */
  signals: Record<string, number | string>;
}

export interface DigitalTwin {
  id: string;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  identity: TwinIdentity;
  career: TwinCareer;
  finance: TwinFinance;
  education: TwinEducation;
  traits: TwinTraits;
  relationship: TwinRelationship;
  health: HealthProfile;
  network: NetworkProfile;
  habits: HabitProfile;
  skills: Skill[];
  values: Record<ValueId, number>;
  goals: Goal[];
  imports: ImportRecord[];
  /** Which onboarding chapters the user has completed. */
  completed: string[];
}

// ---------------------------------------------------------------------------
// Particle: one simulated life
// ---------------------------------------------------------------------------

export interface SimState {
  /** Years elapsed since t0. */
  t: number;
  age: number;
  alive: boolean;

  mode: EmploymentMode;
  field: CareerField;
  locationId: string;

  /** Real annual gross, in the twin's currency, today's money. */
  income: number;
  partnerIncome: number;
  /** Annual living costs, real. */
  spend: number;

  liquid: number;
  invested: number;
  debt: number;
  /** Illiquid equity in a venture, marked at expected value. */
  ventureEquity: number;

  /** 0–100 composite of skill, reputation and track record. */
  careerCapital: number;
  /** 0–100. */
  networkStrength: number;
  /** 0–100. */
  skillLevel: number;

  health: number;
  stress: number;
  /** 0–100; 0 when single. */
  relationshipQuality: number;
  partnered: boolean;
  children: number;

  /** Current experienced wellbeing, 0–100. */
  happiness: number;
  /** The level wellbeing reverts toward — the hedonic set point. */
  setPoint: number;

  /** Months of spending covered by liquid assets. */
  runwayMonths: number;
  /** 0–100: how many viable next moves exist. */
  optionality: number;

  /** Years spent in the current mode; drives adaptation and burnout. */
  yearsInMode: number;
  /** Cumulative count of major disruptions; used for change fatigue. */
  disruptions: number;
}

export type SimEventKind =
  | 'layoff'
  | 'promotion'
  | 'job-change'
  | 'raise'
  | 'startup-failed'
  | 'startup-acquired'
  | 'startup-breakout'
  | 'funding-round'
  | 'health-shock'
  | 'recovery'
  | 'relationship-formed'
  | 'relationship-ended'
  | 'child-born'
  | 'relocation'
  | 'windfall'
  | 'market-crash'
  | 'market-boom'
  | 'graduation'
  | 'burnout'
  | 'decision';

export interface SimEvent {
  t: number;
  kind: SimEventKind;
  label: string;
  /** Signed effect on the headline metric, for the timeline. */
  magnitude?: number;
}

/** A single completed life history, kept only for a sampled subset of paths. */
export interface SimPath {
  index: number;
  /** One snapshot per simulated year, index 0 = today. */
  frames: SimState[];
  events: SimEvent[];
}

/** The compact per-run record kept for all N runs. */
export interface RunOutcome {
  netWorth: number;
  income: number;
  happiness: number;
  health: number;
  stress: number;
  careerCapital: number;
  relationshipQuality: number;
  freedom: number;
  optionality: number;
  /** Discounted sum of yearly wellbeing — the "how was the journey" measure. */
  lifetimeWellbeing: number;
  /** Lowest net worth touched along the way. */
  worstDrawdown: number;
  /** True if liquid assets hit zero at any point. */
  ranOutOfMoney: boolean;
  /** Terminal category used by the decision tree. */
  archetype: string;
}
