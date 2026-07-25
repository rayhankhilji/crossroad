/**
 * The decision library.
 *
 * A decision is not a switch that sets outcomes. It is a bundle of *channels*,
 * each of which nudges one specific mechanism in the dynamics, and each of
 * which carries the reason it exists and the assumptions it leans on.
 *
 * That structure is what makes the results explainable. "Moving to San
 * Francisco raises expected wealth by £4.1m" is a useless sentence on its own.
 * "…of which £2.6m comes from the salary re-index, £1.9m from faster career
 * capital accumulation in a denser labour market, and −£0.4m from the higher
 * cost base" is a sentence you can argue with. The engine can produce the
 * second sentence because it can switch each channel off and re-run.
 *
 * Every branch of every decision is simulated. There is no "recommended"
 * branch and the app never picks one, because which future you want is not
 * something a simulation can tell you.
 */

import type { AssumptionId, AssumptionValues } from './assumptions';
import { getLocation, LOCATIONS } from './locations';
import type { ModifierPatch, Modifiers } from './dynamics';
import { emptyModifiers, fieldProfile, mergeModifiers } from './dynamics';
import type { CareerField, DigitalTwin } from './types';

export type OptionValue = string | number | boolean;
export type OptionValues = Record<string, OptionValue>;

export interface OptionSpec {
  id: string;
  label: string;
  help?: string;
  kind: 'location' | 'field' | 'number' | 'choice' | 'toggle';
  default: OptionValue;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  choices?: { value: string; label: string }[];
}

export interface ChannelInput {
  twin: DigitalTwin;
  params: AssumptionValues;
  options: OptionValues;
}

/**
 * One mechanism through which a choice reaches the model. Channels are the
 * unit of attribution: the results screen decomposes every delta into these.
 */
export interface Channel {
  id: string;
  label: string;
  /** Shown verbatim in the "why" panel next to the number it produced. */
  why: string;
  /** Which registry assumptions this channel reads. Links to the sources. */
  assumptions: AssumptionId[];
  patch: (input: ChannelInput) => ModifierPatch;
}

export interface Branch {
  id: string;
  label: string;
  tagline: string;
  channels: Channel[];
}

export interface DecisionSpec {
  id: string;
  question: string;
  /** Short form used in headers and the tree. */
  short: string;
  blurb: string;
  category: 'work' | 'place' | 'money' | 'life' | 'learning';
  options: OptionSpec[];
  branches: Branch[];
}

const num = (o: OptionValues, k: string, fallback: number): number =>
  typeof o[k] === 'number' ? (o[k] as number) : fallback;
const str = (o: OptionValues, k: string, fallback: string): string =>
  typeof o[k] === 'string' ? (o[k] as string) : fallback;

/** The do-nothing branch. Present in every decision, and never empty of meaning:
 *  staying is a choice with its own trajectory, not the absence of one. */
const STAY = (label: string, tagline: string): Branch => ({
  id: 'stay',
  label,
  tagline,
  channels: [],
});

const CITY_CHOICES = LOCATIONS.map((l) => ({ value: l.id, label: l.city }));

/**
 * Typical gross rental yield, used to infer what a given property would rent
 * for. Around 4% is a reasonable long-run average across UK and comparable
 * markets; it is lower in the most expensive cities and higher in the cheapest,
 * which is precisely the asymmetry that makes buying a better deal in some
 * places than others.
 */
const ANNUAL_GROSS_YIELD = 0.04;

const FIELD_CHOICES: { value: CareerField; label: string }[] = [
  { value: 'software', label: 'Software engineering' },
  { value: 'data-ai', label: 'Data & AI' },
  { value: 'finance', label: 'Finance' },
  { value: 'medicine', label: 'Medicine' },
  { value: 'law', label: 'Law' },
  { value: 'academia', label: 'Academia' },
  { value: 'design', label: 'Design' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'sales', label: 'Sales' },
  { value: 'operations', label: 'Operations' },
  { value: 'engineering', label: 'Engineering' },
  { value: 'education', label: 'Education' },
  { value: 'public-sector', label: 'Public sector' },
  { value: 'trades', label: 'Skilled trades' },
  { value: 'creative', label: 'Creative' },
  { value: 'entrepreneurship', label: 'Entrepreneurship' },
  { value: 'other', label: 'Something else' },
];

// ---------------------------------------------------------------------------
// Found a company
// ---------------------------------------------------------------------------

const foundStartup: DecisionSpec = {
  id: 'found-startup',
  question: 'Should I quit my job to start a company?',
  short: 'Start a company',
  category: 'work',
  blurb:
    'The decision where the mean and the median disagree most violently. Venture outcomes follow a power law, so the average founder outcome is excellent and the typical one is not. Crossroad shows you both, side by side, on purpose.',
  options: [
    {
      id: 'runwayMonths',
      label: 'Runway you would give it',
      help: 'How many months of your own savings you are prepared to burn before stopping.',
      kind: 'number',
      default: 18,
      min: 3,
      max: 60,
      step: 3,
      unit: 'months',
    },
    {
      id: 'cofounder',
      label: 'Co-founder alongside you',
      kind: 'toggle',
      default: true,
      help: 'Solo founding shows up in the data as meaningfully harder, mostly through slower resolution and thinner networks.',
    },
  ],
  branches: [
    STAY('Stay employed', 'Keep the salary, keep the ceiling.'),
    {
      id: 'found',
      label: 'Quit and found',
      tagline: 'Trade a certain income for an uncertain one.',
      channels: [
        {
          id: 'venture.path',
          label: 'Venture outcome distribution',
          why: 'Puts you on the founder path, where income is resolved by a power-law exit distribution rather than a salary curve. Most runs end with nothing; a very small number end enormously. This single channel is why the average and the median of this branch are so far apart.',
          assumptions: [
            'startup.failureRate',
            'startup.acquisitionRate',
            'startup.breakoutRate',
            'startup.breakoutParetoAlpha',
          ],
          patch: () => ({ mode: 'founder', venture: true }),
        },
        {
          id: 'venture.salaryCut',
          label: 'The pay cut you actually take',
          why: 'Founder pay is well below market for the same person. This is the certain, immediate cost paid every month against an uncertain payoff years away — and it is the part people consistently underweight when they imagine this branch.',
          assumptions: ['startup.founderSalaryRatio'],
          patch: ({ params }) => ({ incomeStepMultiplier: params['startup.founderSalaryRatio'] }),
        },
        {
          id: 'venture.careerCapital',
          label: 'Accelerated career capital',
          why: 'Founding compresses a lot of learning and visibility into a short window. Even in the runs where the company fails, this channel usually leaves you more employable than the stay branch — which is why the downside is less catastrophic than it feels.',
          assumptions: ['startup.careerCapitalBonus', 'career.capitalGrowthRate'],
          patch: ({ params, twin }) => ({
            careerCapitalDelta: params['startup.careerCapitalBonus'] * fieldProfile(twin.career.field).foundability,
            networkDelta: 1.6,
            opportunityMultiplier: 1.25,
          }),
        },
        {
          id: 'venture.hours',
          label: 'Hours and strain',
          why: 'The extra hours are converted into stress, and stress feeds health, relationship quality and wellbeing. This is the channel that most often turns a financially positive branch into a wellbeing-negative one.',
          assumptions: ['startup.hoursPremium', 'career.burnoutThreshold', 'health.stressHealthCost'],
          patch: ({ params }) => ({
            hoursDelta: params['startup.hoursPremium'],
            stressDelta: 6,
            separationDelta: 0.015,
          }),
        },
        {
          id: 'venture.runway',
          label: 'Runway you committed',
          why: 'Sets how long you can go without income before the simulation forces you back to work, and how deep the financial-stress channel bites while you are out. Longer runway raises the chance of reaching a resolution and lowers the chance of stopping for the wrong reason.',
          assumptions: ['wealth.runwayStressPoint'],
          patch: ({ options }) => ({ modeDurationYears: num(options, 'runwayMonths', 18) / 12 }),
        },
        {
          id: 'venture.solo',
          label: 'Founding alone',
          why: 'Solo founders resolve more slowly and carry more of the load, which shows up here as extra stress and a thinner opportunity flow. Switch the co-founder option on to remove this channel entirely.',
          assumptions: ['startup.failureRate'],
          patch: ({ options }) =>
            options.cofounder === false
              ? { stressDelta: 5, opportunityMultiplier: 0.85, careerCapitalDelta: -0.6 }
              : {},
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Move city
// ---------------------------------------------------------------------------

const relocate: DecisionSpec = {
  id: 'relocate',
  question: 'Should I move somewhere else?',
  short: 'Move city',
  category: 'place',
  blurb:
    'Moving re-prices your salary and your rent at the same time, and those two rarely move by the same amount. Underneath the money there is a slower story: the network you leave behind takes years to rebuild, and that shows up in both wellbeing and opportunity flow.',
  options: [
    { id: 'destination', label: 'Where to', kind: 'location', default: 'sf-bay', choices: CITY_CHOICES },
    {
      id: 'salaryReindex',
      label: 'How much of the local market rate you would get',
      help: 'A full local package is 100%. A remote arrangement on your old salary is closer to 0%.',
      kind: 'number',
      default: 100,
      min: 0,
      max: 130,
      step: 5,
      unit: '%',
    },
  ],
  branches: [
    STAY('Stay put', 'Keep the network you already have.'),
    {
      id: 'move',
      label: 'Move',
      tagline: 'New market, new costs, new everything.',
      channels: [
        {
          id: 'move.salary',
          label: 'Salary re-index',
          why: 'Your pay re-prices toward the destination market. This is usually the single largest and most immediate line in the whole comparison, and it is also the easiest one to be wrong about — the salary index here is a coarse average across roles, not an offer.',
          assumptions: ['income.jobChangePremium'],
          patch: ({ twin, options }) => {
            const from = getLocation(twin.identity.locationId);
            const to = getLocation(str(options, 'destination', 'sf-bay'));
            const share = num(options, 'salaryReindex', 100) / 100;
            const full = to.salaryIndex / from.salaryIndex;
            return { incomeStepMultiplier: 1 + (full - 1) * share };
          },
        },
        {
          id: 'move.costs',
          label: 'Cost of living re-index',
          why: 'Rent, childcare, transport and everything else re-price too. A 60% raise into a market that is 55% more expensive is close to a lateral move in real terms, and this channel is what surfaces that.',
          assumptions: ['wealth.lifestyleInflation'],
          patch: ({ twin, options }) => {
            const from = getLocation(twin.identity.locationId);
            const to = getLocation(str(options, 'destination', 'sf-bay'));
            return { spendMultiplier: to.costIndex / from.costIndex, locationId: to.id };
          },
        },
        {
          id: 'move.agglomeration',
          label: 'Opportunity density',
          why: 'Denser labour markets produce more good matches and faster learning. The boost is scaled by the career capital you already have rather than granted flat, because the agglomeration literature is badly confounded by who chooses to move.',
          assumptions: ['geography.moveCareerBoost', 'career.networkOpportunityRate'],
          patch: ({ twin, params, options }) => {
            const from = getLocation(twin.identity.locationId);
            const to = getLocation(str(options, 'destination', 'sf-bay'));
            const gap = (to.opportunityIndex - from.opportunityIndex) / 40;
            return {
              careerCapitalDelta: params['geography.moveCareerBoost'] * gap,
              opportunityMultiplier: Math.max(0.4, 1 + gap * 0.45),
            };
          },
        },
        {
          id: 'move.socialReset',
          label: 'Social network reset',
          why: 'You arrive knowing almost nobody. Close ties rebuild at roughly one a year and the ones you left decay, so the network dips for several years before recovering. This channel is why moves that look great financially often look flat on wellbeing.',
          assumptions: ['wellbeing.socialFormationRate', 'health.socialConnectionBenefit', 'geography.moveAdjustmentYears'],
          patch: ({ params, twin, options }) => {
            const to = getLocation(str(options, 'destination', 'sf-bay'));
            const extraversion = (twin.traits.bigFive.extraversion - 50) / 20;
            const rebuild = params['wellbeing.socialFormationRate'] * (1 + 0.35 * extraversion) * (to.socialFormationIndex / 65);
            return { networkDelta: rebuild * 2.2 - 4.5, wellbeingShock: -4 };
          },
        },
        {
          id: 'move.relationshipStrain',
          label: 'Strain on the partnership',
          why: 'Relocating for one person’s career is a documented stress on a partnership. Scaled by how mobile your partner is — if you recorded them as fully willing to move, this channel goes to nearly zero.',
          assumptions: ['relationship.relocationStrain'],
          patch: ({ twin, params }) =>
            twin.relationship.status === 'single'
              ? {}
              : {
                  separationDelta:
                    params['relationship.relocationStrain'] * (1 - twin.relationship.partnerMobility / 100),
                },
        },
        {
          id: 'move.commute',
          label: 'Commute and daily friction',
          why: 'A change in typical commute is a direct, non-adapting wellbeing effect — people do not get used to it the way they get used to a bigger flat.',
          assumptions: ['wellbeing.commutePenalty'],
          patch: ({ twin, params, options }) => {
            const from = getLocation(twin.identity.locationId);
            const to = getLocation(str(options, 'destination', 'sf-bay'));
            const delta = ((to.commuteMinutes - from.commuteMinutes) * 2) / 60;
            return { wellbeingPersistent: -params['wellbeing.commutePenalty'] * delta * (1 - twin.career.remoteShare) };
          },
        },
        {
          id: 'move.upfront',
          label: 'Cost of moving',
          why: 'Deposits, flights, shipping, double rent, the month of no productivity. Small against a lifetime but it comes straight out of runway, which matters most in exactly the runs where things go wrong early.',
          assumptions: ['wealth.runwayStressPoint'],
          patch: ({ twin, options }) => {
            const to = getLocation(str(options, 'destination', 'sf-bay'));
            const international = to.country !== getLocation(twin.identity.locationId).country;
            return { upfrontCost: (international ? 9000 : 3500) * to.costIndex };
          },
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Change employer
// ---------------------------------------------------------------------------

const changeJob: DecisionSpec = {
  id: 'change-job',
  question: 'Should I change jobs?',
  short: 'Change jobs',
  category: 'work',
  blurb:
    'The most reversible decision in the library, and the one with the clearest evidence base. Switchers out-earn stayers consistently. The interesting question is not whether the raise is real but what the reset in tenure, trust and accumulated context costs you.',
  options: [
    {
      id: 'raise',
      label: 'Rise you expect to negotiate',
      kind: 'number',
      default: 15,
      min: -20,
      max: 100,
      step: 5,
      unit: '%',
    },
    {
      id: 'stage',
      label: 'What kind of employer',
      kind: 'choice',
      default: 'similar',
      choices: [
        { value: 'safer', label: 'Larger, more stable' },
        { value: 'similar', label: 'Similar to now' },
        { value: 'riskier', label: 'Earlier stage, riskier' },
      ],
    },
  ],
  branches: [
    STAY('Stay', 'Bank the tenure and the context.'),
    {
      id: 'switch',
      label: 'Take the new job',
      tagline: 'Reset the clock, take the rise.',
      channels: [
        {
          id: 'job.raise',
          label: 'The rise itself',
          why: 'Applied immediately and compounding for the rest of the horizon. Matched payroll data has shown job switchers beating stayers on wage growth almost continuously, and the gap widens when the labour market is tight.',
          assumptions: ['income.jobChangePremium'],
          patch: ({ options }) => ({ incomeStepMultiplier: 1 + num(options, 'raise', 15) / 100 }),
        },
        {
          id: 'job.tenureReset',
          label: 'Tenure reset',
          why: 'You give up accumulated trust, context and the queue position for the next promotion. The model charges a small first-year drag on career capital growth and a slightly raised layoff exposure — last in, first out is a real pattern.',
          assumptions: ['career.layoffBaseRate', 'career.capitalGrowthRate'],
          patch: () => ({ careerCapitalDelta: -0.5, layoffMultiplier: 1.15, stressDelta: 3 }),
        },
        {
          id: 'job.risk',
          label: 'Employer risk profile',
          why: 'Early-stage employers carry several times the involuntary-separation risk of an established one, and that risk correlates with the economy — the year you most want a job is the year the risky employer is most likely to cut.',
          assumptions: ['career.layoffBaseRate'],
          patch: ({ options }) => {
            const stage = str(options, 'stage', 'similar');
            if (stage === 'riskier') return { layoffMultiplier: 1.9, incomeGrowthDelta: 0.008, stressDelta: 4 };
            if (stage === 'safer') return { layoffMultiplier: 0.6, incomeGrowthDelta: -0.005, stressDelta: -3 };
            return {};
          },
        },
        {
          id: 'job.freshNetwork',
          label: 'New network surface',
          why: 'A new employer is a new set of weak ties, and weak ties are where most future opportunities come from. This compounds quietly over the whole horizon.',
          assumptions: ['career.networkOpportunityRate'],
          patch: () => ({ networkDelta: 1.4, opportunityMultiplier: 1.1 }),
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Go back to school
// ---------------------------------------------------------------------------

const gradSchool: DecisionSpec = {
  id: 'grad-school',
  question: 'Should I go back and study?',
  short: 'Go back to study',
  category: 'learning',
  blurb:
    'Two or three years of forgone earnings against a lifetime of a steeper curve. The classic Mincerian return is around 8–10% a year of schooling, but the variance across fields is enormous and part of the return is signalling rather than skill.',
  options: [
    { id: 'years', label: 'How long', kind: 'number', default: 2, min: 1, max: 7, step: 1, unit: 'years' },
    { id: 'cost', label: 'Tuition and fees, total', kind: 'number', default: 30000, min: 0, max: 250000, step: 2500, unit: '' },
    {
      id: 'switching',
      label: 'Using it to switch field',
      kind: 'toggle',
      default: false,
      help: 'A degree used to pivot pays differently from one that deepens what you already do.',
    },
  ],
  branches: [
    STAY('Keep working', 'Compound what you already have.'),
    {
      id: 'study',
      label: 'Go and study',
      tagline: 'Spend years to buy a steeper curve.',
      channels: [
        {
          id: 'study.forgone',
          label: 'Forgone earnings',
          why: 'The real cost of a degree is almost never the tuition — it is the salary you did not earn and did not invest, compounding for the rest of the horizon. This channel is usually several times larger than the fees channel.',
          assumptions: ['wealth.realReturn'],
          patch: ({ options }) => ({
            mode: 'student',
            modeDurationYears: num(options, 'years', 2),
          }),
        },
        {
          id: 'study.fees',
          label: 'Tuition',
          why: 'Paid up front out of savings, or added to debt if savings will not cover it. Straightforward, and much smaller than people expect relative to the forgone-earnings channel.',
          assumptions: [],
          patch: ({ options }) => ({ upfrontCost: num(options, 'cost', 30000) }),
        },
        {
          id: 'study.return',
          label: 'Return to schooling',
          why: 'The Mincerian return, applied as a permanent uplift to the level of earnings — roughly 8–10% per year of schooling, compounded over the years studied. It is a level effect, not a growth effect: a degree raises the curve you are on, it does not make it steeper forever. It is one of the best-replicated findings in labour economics and also one of the most misleading averages in it, because the spread across fields is far wider than the mean.',
          assumptions: ['income.educationReturn'],
          patch: ({ params, options }) => ({
            salaryLevelMultiplier: Math.pow(1 + params['income.educationReturn'], num(options, 'years', 2)),
          }),
        },
        {
          id: 'study.capital',
          label: 'Skill and credential',
          why: 'Study accumulates career capital faster than an average working year and resets skill obsolescence, which matters more the faster your field turns over.',
          assumptions: ['career.capitalGrowthRate', 'career.capitalDecayRate'],
          patch: ({ options }) => ({
            transient: { careerCapitalDelta: 1.4, networkDelta: 1.2 },
            transientYears: num(options, 'years', 2),
          }),
        },
        {
          id: 'study.switchPenalty',
          label: 'Cost of switching field',
          why: 'Pivoting discards field-specific capital. The credential helps, but you re-enter closer to the bottom of a new ladder than the top of the old one.',
          assumptions: ['career.capitalDecayRate'],
          patch: ({ options }) =>
            options.switching === true ? { incomeStepMultiplier: 0.82, careerCapitalDelta: -1.1 } : {},
        },
        {
          id: 'study.reliefAndStrain',
          label: 'Wellbeing while studying',
          why: 'Studying usually lowers stress relative to a demanding job and raises it relative to a comfortable one, while the drop in income bites through the financial-strain channel. Applies only while you are enrolled. The net here is small and genuinely uncertain.',
          assumptions: ['wellbeing.unemploymentPenalty', 'wealth.runwayStressPoint'],
          patch: ({ options }) => ({
            transient: { stressDelta: -4, hoursDelta: -6 },
            transientYears: num(options, 'years', 2),
          }),
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Switch career
// ---------------------------------------------------------------------------

const switchCareer: DecisionSpec = {
  id: 'switch-career',
  question: 'Should I switch to a different field?',
  short: 'Switch field',
  category: 'work',
  blurb:
    'The decision where accumulated advantage works against you. Everything you have built is field-specific, and a switch marks most of it down. The question is whether the new field’s ceiling is high enough, and far enough away, to pay that back.',
  options: [
    { id: 'target', label: 'Into what', kind: 'field', default: 'software', choices: FIELD_CHOICES },
    {
      id: 'retrainMonths',
      label: 'Time spent retraining first',
      kind: 'number',
      default: 6,
      min: 0,
      max: 48,
      step: 3,
      unit: 'months',
    },
  ],
  branches: [
    STAY('Stay in your field', 'Keep compounding what you have.'),
    {
      id: 'switch',
      label: 'Switch field',
      tagline: 'Mark down the old capital, buy a new curve.',
      channels: [
        {
          id: 'switch.reset',
          label: 'Capital written down',
          why: 'Most of what makes you valuable is specific to your field. The model writes down a large share of your career capital and re-prices your salary against the new field’s curve at your reduced level.',
          assumptions: ['career.capitalDecayRate'],
          patch: ({ twin, options }) => {
            const from = fieldProfile(twin.career.field);
            const to = fieldProfile(str(options, 'target', 'software') as CareerField);
            const transferable = 0.45 + 0.25 * (1 - Math.abs(from.complexity - to.complexity));
            return {
              incomeStepMultiplier: (to.payLevel / from.payLevel) * transferable,
              careerCapitalDelta: -2.2,
            };
          },
        },
        {
          id: 'switch.newSlope',
          label: 'The new field’s slope',
          why: 'Fields differ in how steeply pay rises with capability. A switch into a steeper field takes years to pay back the write-down, and then keeps paying; a switch into a flatter one may never pay back at all.',
          assumptions: ['income.experienceReturn'],
          patch: ({ twin, options }) => {
            const from = fieldProfile(twin.career.field);
            const to = fieldProfile(str(options, 'target', 'software') as CareerField);
            return { incomeGrowthDelta: 0.012 * (to.paySlope - from.paySlope) };
          },
        },
        {
          id: 'switch.retraining',
          label: 'Retraining period',
          why: 'A stretch of reduced or no income while you become employable in the new field. Comes straight out of runway and raises financial strain for the whole period.',
          assumptions: ['wealth.runwayStressPoint'],
          patch: ({ options }) => {
            const months = num(options, 'retrainMonths', 6);
            return months > 0 ? { mode: 'student', modeDurationYears: months / 12 } : {};
          },
        },
        {
          id: 'switch.volatility',
          label: 'New risk profile',
          why: 'You inherit the new field’s exposure to layoffs and its rate of skill obsolescence, which can be very different from what you are used to.',
          assumptions: ['career.layoffBaseRate', 'career.capitalDecayRate'],
          patch: ({ twin, options }) => {
            const from = fieldProfile(twin.career.field);
            const to = fieldProfile(str(options, 'target', 'software') as CareerField);
            return { layoffMultiplier: to.volatility / from.volatility };
          },
        },
        {
          id: 'switch.fit',
          label: 'Fit and motivation',
          why: 'People who switch usually do so because the current field does not fit. The model credits a modest persistent wellbeing gain and slightly faster capital growth from working on something you actually want to do — modest, because this is the least measurable channel in the library.',
          assumptions: ['wellbeing.setPointWeight'],
          patch: () => ({ wellbeingPersistent: 2.5, careerCapitalDelta: 0.5, stressDelta: -2 }),
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Sabbatical
// ---------------------------------------------------------------------------

const sabbatical: DecisionSpec = {
  id: 'sabbatical',
  question: 'Should I take a long break?',
  short: 'Take a sabbatical',
  category: 'life',
  blurb:
    'A deliberate break is a fundamentally different event from unemployment, and the engine treats it that way: no scarring penalty, no involuntary-unemployment wellbeing hit. What it does cost is compounding — of savings, of salary, and of skills in a fast-moving field.',
  options: [
    { id: 'months', label: 'How long', kind: 'number', default: 9, min: 1, max: 36, step: 1, unit: 'months' },
    { id: 'spendRate', label: 'Spending while away, vs now', kind: 'number', default: 75, min: 20, max: 150, step: 5, unit: '%' },
  ],
  branches: [
    STAY('Keep working', 'Stay on the treadmill.'),
    {
      id: 'break',
      label: 'Take the break',
      tagline: 'Buy time with money.',
      channels: [
        {
          id: 'sab.income',
          label: 'Income stops',
          why: 'No salary for the duration, and the savings that would have been invested are not invested. On a long horizon the compounding loss usually exceeds the raw forgone salary.',
          assumptions: ['wealth.realReturn'],
          patch: ({ options }) => ({ mode: 'sabbatical', modeDurationYears: num(options, 'months', 9) / 12 }),
        },
        {
          id: 'sab.spend',
          label: 'Spending while away',
          why: 'Most people spend less on a break than they expect to, and some spend a great deal more. Set it honestly — this channel and the length option together determine whether the break eats your buffer or your buffer absorbs it.',
          assumptions: ['wealth.runwayStressPoint'],
          patch: ({ options }) => ({ spendMultiplier: num(options, 'spendRate', 75) / 100 }),
        },
        {
          id: 'sab.skillDecay',
          label: 'Skills going stale',
          why: 'Career capital decays while you are out, at a rate set by how quickly your field turns over. Nine months out of a fast-moving field costs measurably more than nine months out of a slow one. Applies only for the length of the break.',
          assumptions: ['career.capitalDecayRate'],
          patch: ({ options }) => ({
            transient: { careerCapitalDelta: -1.2, networkDelta: -1.5 },
            transientYears: Math.max(1, num(options, 'months', 9) / 12),
          }),
        },
        {
          id: 'sab.recovery',
          label: 'Recovery',
          why: 'Stress falls and health improves while you are away. The stress relief lasts only as long as the break does, but the health gained is banked — it goes into the health stock and carries forward, which is why a break can still be visible in the numbers a decade later.',
          assumptions: ['health.stressHealthCost', 'wellbeing.adaptationHalfLife'],
          patch: ({ options }) => ({
            transient: { stressDelta: -18, healthDelta: 1.6 },
            transientYears: Math.max(1, num(options, 'months', 9) / 12),
            wellbeingShock: 8,
          }),
        },
        {
          id: 'sab.reentry',
          label: 'Getting back in',
          why: 'Re-entry after a voluntary break is easier than after a layoff but not free. The engine applies a small re-entry discount and no scarring penalty, because the evidence for persistent scarring is specifically about involuntary job loss.',
          assumptions: ['career.layoffBaseRate'],
          patch: () => ({ incomeGrowthDelta: -0.004 }),
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Have a child now or later
// ---------------------------------------------------------------------------

const haveChild: DecisionSpec = {
  id: 'have-child',
  question: 'Should we have a child now, or wait?',
  short: 'Have a child',
  category: 'life',
  blurb:
    'The place where measured happiness and stated meaning diverge more sharply than anywhere else in the model. Life satisfaction typically dips for several years after a birth. Almost nobody describes that as a mistake. Crossroad reports the dip and refuses to score it as the whole story.',
  options: [
    { id: 'delayYears', label: 'If waiting, how long', kind: 'number', default: 5, min: 1, max: 12, step: 1, unit: 'years' },
    {
      id: 'careerPause',
      label: 'Career pause taken',
      kind: 'number',
      default: 12,
      min: 0,
      max: 60,
      step: 3,
      unit: 'months',
    },
  ],
  branches: [
    {
      id: 'wait',
      label: 'Wait',
      tagline: 'More runway, more career, less time.',
      channels: [
        {
          id: 'wait.compound',
          label: 'Extra years of compounding',
          why: 'Both money and career capital compound for longer before the pause. On the financial metrics this is the entire case for waiting, and it is a real one.',
          assumptions: ['wealth.realReturn', 'income.experienceReturn'],
          patch: () => ({ careerCapitalDelta: 0.4 }),
        },
        {
          id: 'wait.fertility',
          label: 'Biology',
          why: 'The model lowers the yearly probability of conception with age, which is why the wait branch has a meaningful share of runs that end with fewer children than intended — a cost that does not appear on any financial axis.',
          assumptions: ['relationship.formationRate'],
          patch: () => ({}),
        },
      ],
    },
    {
      id: 'now',
      label: 'Now',
      tagline: 'Start the clock.',
      channels: [
        {
          id: 'child.cost',
          label: 'Direct cost',
          why: 'Ongoing spending per child, which permanently raises the floor under your cost base and therefore lowers runway for the rest of the horizon.',
          assumptions: ['relationship.childAnnualCost'],
          patch: ({ params }) => ({ spendMultiplier: 1, upfrontCost: params['relationship.childAnnualCost'] * 0.4 }),
        },
        {
          id: 'child.careerPause',
          label: 'Career pause',
          why: 'The indirect cost dwarfs the direct one. A pause plus reduced hours afterwards bends the earnings curve down for years, and the effect compounds. This is the channel that produces most of the financial gap between the two branches.',
          assumptions: ['income.experienceReturn', 'career.capitalDecayRate'],
          patch: ({ options }) => {
            const months = num(options, 'careerPause', 12);
            return {
              modeDurationYears: months / 12,
              mode: months >= 3 ? 'sabbatical' : undefined,
              // The pause itself is bounded; the bent trajectory afterwards is
              // not, which is exactly the shape the earnings data show.
              transient: { careerCapitalDelta: -0.8 },
              transientYears: Math.max(1, months / 12),
              incomeGrowthDelta: -0.004,
            };
          },
        },
        {
          id: 'child.wellbeingDip',
          label: 'The measured dip',
          why: 'Life satisfaction reliably falls below baseline for a few years after a birth, driven by sleep loss, cost and time pressure, then recovers. The engine models the dip because the data are clear, and reports it separately from purpose because they move in opposite directions.',
          assumptions: ['relationship.childWellbeingDip', 'health.sleepOptimum'],
          patch: ({ params }) => ({
            wellbeingShock: -params['relationship.childWellbeingDip'],
            stressDelta: 7,
            healthDelta: -0.5,
          }),
        },
        {
          id: 'child.meaning',
          label: 'Purpose',
          why: 'Parents report lower moment-to-moment happiness and higher sense of purpose. The model carries a persistent purpose term so that this branch does not get scored as straightforwardly worse — because on the axis most parents actually care about, it is not.',
          assumptions: ['wellbeing.setPointWeight'],
          patch: () => ({ wellbeingPersistent: 3.5 }),
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Go independent
// ---------------------------------------------------------------------------

const goFreelance: DecisionSpec = {
  id: 'go-freelance',
  question: 'Should I go independent?',
  short: 'Go independent',
  category: 'work',
  blurb:
    'Higher headline rates, no floor under them. Freelancing usually raises expected income and always raises income variance, and the model treats those as two separate facts because they have very different consequences for someone with six months of savings versus six years.',
  options: [
    { id: 'rateUplift', label: 'Day rate vs salaried equivalent', kind: 'number', default: 40, min: -20, max: 200, step: 5, unit: '%' },
    { id: 'utilisation', label: 'Weeks billed per year', kind: 'number', default: 38, min: 10, max: 50, step: 1, unit: 'weeks' },
  ],
  branches: [
    STAY('Stay employed', 'A floor under the income.'),
    {
      id: 'independent',
      label: 'Go independent',
      tagline: 'Own the upside and the downside.',
      channels: [
        {
          id: 'free.rate',
          label: 'Rate uplift',
          why: 'Independent rates carry a premium over salaried equivalents, partly compensating for the benefits, holiday and security you give up. The headline number flatters — this channel is only meaningful alongside the utilisation channel below.',
          assumptions: ['income.jobChangePremium'],
          patch: ({ options }) => ({
            incomeStepMultiplier: (1 + num(options, 'rateUplift', 40) / 100) * (num(options, 'utilisation', 38) / 46),
          }),
        },
        {
          id: 'free.variance',
          label: 'Income variance',
          why: 'Year-to-year income volatility roughly doubles. You will not be made redundant, but you will have quarters with no work, and the model treats those as the same problem arriving in smaller pieces. For a high-runway household this is noise; for a low-runway one it is the mechanism by which good years get eaten by bad ones before they can compound.',
          assumptions: ['income.shockSigma', 'wealth.runwayStressPoint'],
          patch: () => ({ stressDelta: 6, layoffMultiplier: 0.35, incomeVolatilityMultiplier: 2.1 }),
        },
        {
          id: 'free.autonomy',
          label: 'Autonomy',
          why: 'Control over your own time is one of the more durable wellbeing gains available, and unlike a pay rise it adapts away slowly. The model weights it by your risk tolerance — the same autonomy is worth much less to someone who finds uncertainty draining.',
          assumptions: ['wellbeing.setPointWeight', 'wellbeing.commutePenalty'],
          patch: ({ twin }) => ({
            wellbeingPersistent: 3.2 * ((twin.traits.riskTolerance - 40) / 40),
            hoursDelta: -2,
          }),
        },
        {
          id: 'free.noBenefits',
          label: 'Benefits and pension gone',
          why: 'No employer pension contribution, no sick pay, no notice period. The pension line alone is a large compounding loss that almost never appears in a day-rate comparison.',
          assumptions: ['wealth.realReturn'],
          patch: () => ({ savingsRateDelta: -0.03, spendMultiplier: 1.04 }),
        },
        {
          id: 'free.network',
          label: 'Client network',
          why: 'Independent work is network-driven by construction: your pipeline is your contacts. Strong networks make this branch far better and weak ones make it far worse, which is why the spread here is wide.',
          assumptions: ['career.networkOpportunityRate'],
          patch: ({ twin }) => ({
            opportunityMultiplier: 1 + (twin.network.reach - 50) / 100,
            networkDelta: 0.8,
          }),
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Work harder for promotion
// ---------------------------------------------------------------------------

const pushHarder: DecisionSpec = {
  id: 'push-harder',
  question: 'Should I go all in at work for a couple of years?',
  short: 'Push hard at work',
  category: 'work',
  blurb:
    'The sprint that becomes a decade. Extra hours do buy career capital, at a declining rate, and they do buy stress, at an increasing one. The model is deliberately unromantic about where those two curves cross.',
  options: [
    { id: 'extraHours', label: 'Extra hours a week', kind: 'number', default: 12, min: 2, max: 40, step: 1, unit: 'h' },
    { id: 'years', label: 'For how long', kind: 'number', default: 2, min: 1, max: 10, step: 1, unit: 'years' },
  ],
  branches: [
    STAY('Keep your current pace', 'Protect the rest of your life.'),
    {
      id: 'push',
      label: 'Go all in',
      tagline: 'Spend health and time to buy trajectory.',
      channels: [
        {
          id: 'push.output',
          label: 'Extra output',
          why: 'More hours produce more career capital, but with sharply diminishing returns — measured output per hour falls once the week is long, so the twentieth extra hour is worth a fraction of the fifth.',
          assumptions: ['career.capitalGrowthRate', 'career.burnoutThreshold'],
          patch: ({ options }) => {
            const extra = num(options, 'extraHours', 12);
            const effective = 12 * (1 - Math.exp(-extra / 12));
            // The capital accrues only during the sprint; what it buys you is
            // permanent, because career capital is a stock.
            return {
              transient: { careerCapitalDelta: effective * 0.18, incomeGrowthDelta: effective * 0.0022 },
              transientYears: num(options, 'years', 2),
            };
          },
        },
        {
          id: 'push.stress',
          label: 'Hours and stress',
          why: 'Past the burnout threshold, hours convert into stress at an accelerating rate. Long working hours are associated with elevated cardiovascular risk, which the model routes through the health stock rather than treating as free. The hours stop when the sprint does; what they did to the health stock does not.',
          assumptions: ['career.burnoutThreshold', 'health.stressHealthCost'],
          patch: ({ options }) => ({
            transient: { hoursDelta: num(options, 'extraHours', 12) },
            transientYears: num(options, 'years', 2),
          }),
        },
        {
          id: 'push.crowdOut',
          label: 'What gets crowded out',
          why: 'Sleep, exercise and relationships are the things that lose when work expands, and all three feed the model’s slowest and most consequential stock: health. This channel is why the branch can look good for a decade and bad for a life — the sprint is temporary, the health it costs is not returned afterwards.',
          assumptions: ['health.exerciseBenefit', 'health.sleepOptimum', 'health.socialConnectionBenefit'],
          patch: ({ options }) => {
            const extra = num(options, 'extraHours', 12);
            return {
              transient: {
                healthDelta: -0.05 * extra,
                networkDelta: -0.05 * extra,
                separationDelta: 0.004 * (extra / 10),
              },
              transientYears: num(options, 'years', 2),
            };
          },
        },
        {
          id: 'push.visibility',
          label: 'Visibility and promotion odds',
          why: 'Being the person who delivers raises the rate at which internal and external opportunities find you, for as long as you are being that person. Real, and smaller than the effort suggests.',
          assumptions: ['career.networkOpportunityRate', 'income.jobChangePremium'],
          patch: ({ options }) => ({
            transient: { opportunityMultiplier: 1.3 },
            transientYears: num(options, 'years', 2),
          }),
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Buy or keep renting
// ---------------------------------------------------------------------------

const buyHome: DecisionSpec = {
  id: 'buy-home',
  question: 'Should I buy somewhere to live?',
  short: 'Buy a home',
  category: 'money',
  blurb:
    'A leveraged, undiversified, illiquid bet on one street, bundled with a housing service you were buying anyway. The model separates the two, because most arguments about whether buying "beats" renting are really arguments about leverage and about being forced to save.',
  options: [
    { id: 'price', label: 'Purchase price', kind: 'number', default: 400000, min: 50000, max: 3000000, step: 10000, unit: '' },
    { id: 'depositPct', label: 'Deposit', kind: 'number', default: 15, min: 5, max: 100, step: 1, unit: '%' },
    { id: 'rate', label: 'Mortgage rate', kind: 'number', default: 4.5, min: 0.5, max: 12, step: 0.1, unit: '%' },
  ],
  branches: [
    STAY('Keep renting', 'Liquid, mobile, unlevered.'),
    {
      id: 'buy',
      label: 'Buy',
      tagline: 'Leverage, illiquidity, and a fixed address.',
      channels: [
        {
          id: 'buy.deposit',
          label: 'Deposit',
          why: 'A large one-off transfer out of liquid savings, which collapses runway on the day you complete. The model shows what that does to the bad tails, where a job loss now arrives with no buffer behind it.',
          assumptions: ['wealth.runwayStressPoint'],
          patch: ({ options }) => ({
            upfrontCost: (num(options, 'price', 400000) * num(options, 'depositPct', 15)) / 100 + num(options, 'price', 400000) * 0.03,
          }),
        },
        {
          id: 'buy.rentReplaced',
          label: 'Rent no longer paid',
          why: 'Buying removes the rent line from your spending, which is the whole benefit and gets lost in arguments about house prices. Estimated from the purchase price at a typical gross rental yield, so it moves when you change the price.',
          assumptions: [],
          patch: ({ twin, options }) => {
            const rentAvoided = num(options, 'price', 400000) * ANNUAL_GROSS_YIELD;
            return { spendMultiplier: 1 - rentAvoided / Math.max(1, twin.finance.livingCosts) };
          },
        },
        {
          id: 'buy.interest',
          label: 'Mortgage interest',
          why: 'Interest is money gone, exactly like rent. Only the capital repayment is saving. Conflating the two is the single most common error in a rent-versus-buy comparison, and it is what makes buying look automatically better than it is.',
          assumptions: ['wealth.lifestyleInflation'],
          patch: ({ twin, options }) => {
            const loan = num(options, 'price', 400000) * (1 - num(options, 'depositPct', 15) / 100);
            const interest = loan * (num(options, 'rate', 4.5) / 100);
            return {
              spendMultiplier: 1 + interest / Math.max(1, twin.finance.livingCosts),
              stressDelta: loan > twin.finance.grossIncome * 4 ? 4 : 1,
            };
          },
        },
        {
          id: 'buy.principal',
          label: 'Forced saving through capital repayment',
          why: 'The part of the payment that pays down the loan is saving you would probably not otherwise do. For most households this commitment device, not capital appreciation, is where the wealth difference actually comes from.',
          assumptions: ['wealth.lifestyleInflation', 'wealth.realReturn'],
          patch: ({ twin, options }) => {
            const loan = num(options, 'price', 400000) * (1 - num(options, 'depositPct', 15) / 100);
            // Roughly the first-year principal share of a 25-year repayment.
            const principal = loan / 25;
            return { savingsRateDelta: Math.min(0.2, principal / Math.max(1, twin.finance.grossIncome)) };
          },
        },
        {
          id: 'buy.maintenance',
          label: 'Maintenance and the things that break',
          why: 'Ownership carries an ongoing cost renters do not pay — around one percent of value a year on average, arriving in lumps at the worst possible moments. Routinely left out of the comparison entirely.',
          assumptions: [],
          patch: ({ twin, options }) => ({
            spendMultiplier: 1 + (num(options, 'price', 400000) * 0.01) / Math.max(1, twin.finance.livingCosts),
          }),
        },
        {
          id: 'buy.immobility',
          label: 'Immobility',
          why: 'Selling is slow and expensive, so buying lowers the rate at which you take opportunities that require moving. On long horizons this optionality cost is real and almost never priced in.',
          assumptions: ['career.networkOpportunityRate'],
          patch: () => ({ opportunityMultiplier: 0.85 }),
        },
        {
          id: 'buy.security',
          label: 'Security',
          why: 'Not being subject to a landlord is a durable wellbeing gain that does not adapt away the way a nicer flat does. Modest but persistent.',
          assumptions: ['wellbeing.adaptationHalfLife'],
          patch: () => ({ wellbeingPersistent: 2.2, stressDelta: -2 }),
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const DECISIONS: DecisionSpec[] = [
  foundStartup,
  relocate,
  changeJob,
  gradSchool,
  switchCareer,
  goFreelance,
  pushHarder,
  sabbatical,
  haveChild,
  buyHome,
];

export const DECISION_MAP: Record<string, DecisionSpec> = Object.fromEntries(
  DECISIONS.map((d) => [d.id, d]),
);

export function getDecision(id: string): DecisionSpec {
  const d = DECISION_MAP[id];
  if (!d) throw new Error(`Unknown decision: ${id}`);
  return d;
}

export function defaultOptions(spec: DecisionSpec): OptionValues {
  return Object.fromEntries(spec.options.map((o) => [o.id, o.default]));
}

/** Resolve a branch's channels into a single modifier bundle.
 *  `skipChannel` is how leave-one-out attribution ablates one mechanism. */
export function resolveBranch(
  branch: Branch,
  input: ChannelInput,
  skipChannel?: string,
): { modifiers: Modifiers; applied: Channel[] } {
  const mods = emptyModifiers();
  const applied: Channel[] = [];
  for (const channel of branch.channels) {
    if (channel.id === skipChannel) continue;
    const patch = channel.patch(input);
    if (Object.keys(patch).length === 0) continue;
    mergeModifiers(mods, patch);
    applied.push(channel);
  }
  return { modifiers: mods, applied };
}

/** Every channel across every branch of a decision, for the attribution pass. */
export function allChannels(spec: DecisionSpec): Channel[] {
  return spec.branches.flatMap((b) => b.channels);
}
