/**
 * Constructing and maintaining a digital twin.
 *
 * The twin is the portrait onboarding builds. It is never mutated by a
 * simulation — ten thousand copies get made and pushed through time, and the
 * original sits untouched. That separation is why you can re-run any question
 * against a changed assumption and get a comparable answer.
 */

import type {
  BigFive,
  DigitalTwin,
  HabitProfile,
  HealthProfile,
  NetworkProfile,
  ValueId,
} from './types';

export const SCHEMA_VERSION = 1;

export const VALUE_IDS: ValueId[] = [
  'wealth',
  'freedom',
  'security',
  'status',
  'impact',
  'creativity',
  'family',
  'health',
  'adventure',
  'mastery',
  'community',
  'tranquillity',
];

export const VALUE_LABELS: Record<ValueId, { label: string; blurb: string }> = {
  wealth: { label: 'Wealth', blurb: 'Accumulating money and what it can buy.' },
  freedom: { label: 'Freedom', blurb: 'Control over your own time and choices.' },
  security: { label: 'Security', blurb: 'A floor under you. Knowing you will be fine.' },
  status: { label: 'Standing', blurb: 'Recognition and position among people you respect.' },
  impact: { label: 'Impact', blurb: 'Changing something outside yourself.' },
  creativity: { label: 'Creativity', blurb: 'Making things that did not exist.' },
  family: { label: 'Family', blurb: 'Partnership, children, the people closest to you.' },
  health: { label: 'Health', blurb: 'A working body, for as long as possible.' },
  adventure: { label: 'Adventure', blurb: 'Novelty, risk, and seeing more of the world.' },
  mastery: { label: 'Mastery', blurb: 'Getting genuinely good at something hard.' },
  community: { label: 'Community', blurb: 'Belonging somewhere, with people who know you.' },
  tranquillity: { label: 'Peace', blurb: 'A quiet mind and an unhurried life.' },
};

function neutralBigFive(): BigFive {
  return {
    openness: 50,
    conscientiousness: 50,
    extraversion: 50,
    agreeableness: 50,
    neuroticism: 50,
  };
}

function neutralHealth(): HealthProfile {
  return {
    selfRated: 72,
    sleepHours: 7,
    exerciseSessions: 2,
    alcoholUnits: 6,
    smoker: false,
    conditions: [],
  };
}

function neutralNetwork(): NetworkProfile {
  return { professionalContacts: 40, closeFriends: 4, mentors: 1, reach: 45 };
}

function neutralHabits(): HabitProfile {
  return {
    deliberatePractice: 3,
    discretionaryScreen: 3,
    savingsRate: 0.15,
    learningHours: 3,
    socialContact: 3,
  };
}

/** A twin with everything at its neutral default, ready for onboarding to fill in. */
export function createTwin(id: string = cryptoId()): DigitalTwin {
  const now = new Date().toISOString();
  return {
    id,
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    identity: { displayName: '', age: 30, locationId: 'london' },
    career: {
      title: '',
      field: 'other',
      seniority: 'mid',
      mode: 'employed',
      employerStage: 'enterprise',
      yearsExperience: 8,
      satisfaction: 60,
      hoursPerWeek: 42,
      remoteShare: 0.4,
      perceivedJobSecurity: 0.85,
    },
    finance: {
      currency: 'GBP',
      grossIncome: 55000,
      variableComp: 0,
      cashSavings: 12000,
      invested: 20000,
      livingCosts: 30000,
      debts: [],
      pensionRate: 0.05,
      dependents: 0,
      familySafetyNet: 40,
    },
    education: { highest: 'bachelors', fieldOfStudy: '', institutionTier: 55 },
    traits: {
      bigFive: neutralBigFive(),
      cognition: { estimate: 100, method: 'unset', standardError: 12 },
      riskTolerance: 50,
      ambition: 55,
      discipline: 55,
      ambiguityTolerance: 50,
    },
    relationship: {
      status: 'single',
      satisfaction: 0,
      yearsTogether: 0,
      partnerIncome: 0,
      partnerMobility: 50,
      children: 0,
      wantsChildren: false,
    },
    health: neutralHealth(),
    network: neutralNetwork(),
    habits: neutralHabits(),
    skills: [],
    values: Object.fromEntries(VALUE_IDS.map((v) => [v, 50])) as Record<ValueId, number>,
    goals: [],
    imports: [],
    completed: [],
  };
}

/**
 * A fully specified example twin, used for the demo mode and for tests.
 * Deliberately ordinary: a mid-career software engineer in London with some
 * savings, some debt, a partner and a decision to make.
 */
export function exampleTwin(): DigitalTwin {
  const twin = createTwin('example-twin');
  twin.identity = { displayName: 'Sam', age: 31, locationId: 'london' };
  twin.career = {
    title: 'Senior Software Engineer',
    field: 'software',
    seniority: 'senior',
    mode: 'employed',
    employerStage: 'late-stage',
    yearsExperience: 9,
    satisfaction: 55,
    hoursPerWeek: 46,
    remoteShare: 0.6,
    perceivedJobSecurity: 0.8,
  };
  twin.finance = {
    currency: 'GBP',
    grossIncome: 88000,
    variableComp: 9000,
    cashSavings: 28000,
    invested: 61000,
    livingCosts: 71000,
    debts: [
      { id: 'sl', label: 'Student loan', balance: 24000, rate: 0.072, annualPayment: 2600, kind: 'student' },
    ],
    pensionRate: 0.06,
    dependents: 0,
    familySafetyNet: 45,
  };
  twin.education = { highest: 'bachelors', fieldOfStudy: 'Computer Science', institutionTier: 72, graduationYear: 2016 };
  twin.traits = {
    bigFive: { openness: 74, conscientiousness: 63, extraversion: 44, agreeableness: 58, neuroticism: 52 },
    cognition: { estimate: 118, method: 'self-report', standardError: 14 },
    riskTolerance: 62,
    ambition: 71,
    discipline: 58,
    ambiguityTolerance: 66,
  };
  twin.relationship = {
    status: 'partnered',
    satisfaction: 76,
    yearsTogether: 4,
    partnerIncome: 46000,
    partnerMobility: 40,
    children: 0,
    wantsChildren: true,
  };
  twin.health = {
    selfRated: 76,
    sleepHours: 6.6,
    exerciseSessions: 2,
    alcoholUnits: 9,
    smoker: false,
    conditions: [],
  };
  twin.network = { professionalContacts: 180, closeFriends: 5, mentors: 2, reach: 58 };
  twin.habits = {
    deliberatePractice: 4,
    discretionaryScreen: 3.5,
    savingsRate: 0.22,
    learningHours: 4,
    socialContact: 2,
  };
  twin.skills = [
    { id: 's1', label: 'Backend engineering', level: 78, marketValue: 82, practiceHours: 25 },
    { id: 's2', label: 'Systems design', level: 66, marketValue: 85, practiceHours: 6 },
    { id: 's3', label: 'Product sense', level: 52, marketValue: 74, practiceHours: 3 },
  ];
  twin.values = {
    wealth: 55,
    freedom: 82,
    security: 48,
    status: 35,
    impact: 68,
    creativity: 71,
    family: 74,
    health: 66,
    adventure: 58,
    mastery: 79,
    community: 45,
    tranquillity: 40,
  };
  twin.goals = [
    { id: 'g1', label: 'Financial runway of two years', metric: 'freedom', target: 60, horizonYears: 5, importance: 70 },
    { id: 'g2', label: 'Lead something of my own', metric: 'careerCapital', target: 80, horizonYears: 8, importance: 85 },
  ];
  twin.completed = ['identity', 'career', 'finance', 'education', 'personality', 'values', 'relationship', 'health', 'network', 'habits'];
  return twin;
}

function cryptoId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `twin-${Math.random().toString(36).slice(2, 10)}`;
}

/** How much of the twin has actually been filled in, 0–1. */
export function completeness(twin: DigitalTwin): number {
  const chapters = ['identity', 'career', 'finance', 'education', 'personality', 'values', 'relationship', 'health', 'network', 'habits'];
  return chapters.filter((c) => twin.completed.includes(c)).length / chapters.length;
}

export function touch(twin: DigitalTwin): DigitalTwin {
  return { ...twin, updatedAt: new Date().toISOString() };
}
