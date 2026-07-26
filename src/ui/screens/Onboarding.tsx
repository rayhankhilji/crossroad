/**
 * Onboarding.
 *
 * Long on purpose. The whole product rests on the twin, and a twin built from
 * four questions produces confident nonsense. Eleven chapters, roughly
 * twenty-five minutes, and every one of them explains why it is asking —
 * because a person being asked for their savings, their sleep and their
 * relationship deserves to know what each answer will actually be used for.
 *
 * Nothing is mandatory. Skipped chapters fall back to population defaults, and
 * the twin screen shows exactly which parts of the portrait are you and which
 * are the average of everyone.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState, type ReactElement } from 'react';

import { BIG_FIVE_ITEMS, LIKERT, scoreBigFive, TRAIT_INFO, type BigFiveResponses } from '../../engine/bigfive';
import { LOCATIONS } from '../../engine/locations';
import { VALUE_IDS, VALUE_LABELS } from '../../engine/twin';
import type {
  BigFive,
  BigFiveTrait,
  CareerField,
  Debt,
  EducationLevel,
  EmployerStage,
  EmploymentMode,
  RelationshipStatus,
  Seniority,
  ValueId,
} from '../../engine/types';
import { useApp } from '../../state/store';
import { money } from '../format';
import { Button, Field, NumberInput, Panel, Segmented, Select, Slider, Tag, TextInput, Toggle } from '../primitives';
import './onboarding.css';

interface Chapter {
  id: string;
  title: string;
  lede: string;
  minutes: number;
  render: () => ReactElement;
}

const FIELD_OPTIONS: { value: CareerField; label: string }[] = [
  { value: 'software', label: 'Software engineering' },
  { value: 'data-ai', label: 'Data & AI' },
  { value: 'finance', label: 'Finance' },
  { value: 'medicine', label: 'Medicine & health' },
  { value: 'law', label: 'Law' },
  { value: 'academia', label: 'Academia & research' },
  { value: 'design', label: 'Design' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'sales', label: 'Sales' },
  { value: 'operations', label: 'Operations' },
  { value: 'engineering', label: 'Engineering (non-software)' },
  { value: 'education', label: 'Education' },
  { value: 'public-sector', label: 'Public sector' },
  { value: 'trades', label: 'Skilled trades' },
  { value: 'creative', label: 'Creative & media' },
  { value: 'entrepreneurship', label: 'Running my own thing' },
  { value: 'other', label: 'Something else' },
];

export function Onboarding() {
  const twin = useApp((s) => s.twin);
  const updateTwin = useApp((s) => s.updateTwin);
  const markChapter = useApp((s) => s.markChapter);
  const go = useApp((s) => s.go);

  const [index, setIndex] = useState(0);
  const [bigFive, setBigFive] = useState<BigFiveResponses>({});

  const patch = updateTwin;

  const chapters: Chapter[] = useMemo(
    () => [
      {
        id: 'identity',
        title: 'You',
        lede: 'Age sets where you sit on every age-shaped curve in the model — earnings, health, fertility, mortality. Location re-prices your salary and your rent.',
        minutes: 1,
        render: () => (
          <div className="ob__grid">
            <Field label="What should we call you?" help="Only ever displayed back to you. Never used in the model.">
              <TextInput
                value={twin.identity.displayName}
                placeholder="Your name"
                onChange={(v) => patch((t) => void (t.identity.displayName = v))}
              />
            </Field>
            <Field label="Age">
              <Slider
                value={twin.identity.age}
                min={16}
                max={80}
                onChange={(v) => patch((t) => void (t.identity.age = v))}
                format={(v) => `${v}`}
                marks={['16', '80']}
              />
            </Field>
            <Field
              label="Where do you live?"
              help="Cost and salary indices are coarse relative estimates, normalised to the UK average. Every one of them is editable in the assumptions."
            >
              <Select
                value={twin.identity.locationId}
                options={LOCATIONS.map((l) => ({ value: l.id, label: `${l.city}${l.country !== 'Anywhere' ? `, ${l.country}` : ''}` }))}
                onChange={(v) => patch((t) => void (t.identity.locationId = v))}
              />
            </Field>
          </div>
        ),
      },

      {
        id: 'career',
        title: 'Work',
        lede: 'Your field determines how fast skills go stale, how steeply pay rises with capability, and how exposed you are to being let go. Hours feed straight into stress, and stress feeds everything else.',
        minutes: 3,
        render: () => (
          <div className="ob__grid">
            <Field label="Job title">
              <TextInput
                value={twin.career.title}
                placeholder="e.g. Senior Product Designer"
                onChange={(v) => patch((t) => void (t.career.title = v))}
              />
            </Field>
            <Field label="Field">
              <Select
                value={twin.career.field}
                options={FIELD_OPTIONS}
                onChange={(v) => patch((t) => void (t.career.field = v))}
              />
            </Field>
            <Field label="Level">
              <Select
                value={twin.career.seniority}
                options={[
                  { value: 'entry', label: 'Entry level' },
                  { value: 'mid', label: 'Mid level' },
                  { value: 'senior', label: 'Senior' },
                  { value: 'lead', label: 'Lead / principal' },
                  { value: 'executive', label: 'Executive' },
                  { value: 'founder', label: 'Founder' },
                ] as { value: Seniority; label: string }[]}
                onChange={(v) => patch((t) => void (t.career.seniority = v))}
              />
            </Field>
            <Field label="Working how?">
              <Select
                value={twin.career.mode}
                options={[
                  { value: 'employed', label: 'Employed' },
                  { value: 'freelance', label: 'Freelance / contract' },
                  { value: 'founder', label: 'Running a company' },
                  { value: 'student', label: 'Studying' },
                  { value: 'unemployed', label: 'Between things' },
                  { value: 'sabbatical', label: 'On a break' },
                  { value: 'retired', label: 'Retired' },
                ] as { value: EmploymentMode; label: string }[]}
                onChange={(v) => patch((t) => void (t.career.mode = v))}
              />
            </Field>
            <Field
              label="What kind of employer?"
              help="This is the single largest input to job-loss risk in the model: an early-stage company carries several times the exposure of an established one."
            >
              <Select
                value={twin.career.employerStage}
                options={[
                  { value: 'pre-seed', label: 'Pre-seed startup' },
                  { value: 'seed', label: 'Seed stage' },
                  { value: 'series-a-b', label: 'Series A–B' },
                  { value: 'late-stage', label: 'Late-stage private' },
                  { value: 'public', label: 'Public company' },
                  { value: 'enterprise', label: 'Large established' },
                  { value: 'public-sector', label: 'Public sector' },
                  { value: 'self-employed', label: 'Self-employed' },
                ] as { value: EmployerStage; label: string }[]}
                onChange={(v) => patch((t) => void (t.career.employerStage = v))}
              />
            </Field>
            <Field label="Years of experience">
              <Slider
                value={twin.career.yearsExperience}
                min={0}
                max={45}
                onChange={(v) => patch((t) => void (t.career.yearsExperience = v))}
                format={(v) => `${v} yr`}
              />
            </Field>
            <Field label="Hours a week, honestly">
              <Slider
                value={twin.career.hoursPerWeek}
                min={0}
                max={90}
                onChange={(v) => patch((t) => void (t.career.hoursPerWeek = v))}
                format={(v) => `${v}h`}
                marks={['0', '90']}
              />
            </Field>
            <Field label="How satisfying is the work?">
              <Slider
                value={twin.career.satisfaction}
                min={0}
                max={100}
                onChange={(v) => patch((t) => void (t.career.satisfaction = v))}
                marks={['Miserable', 'Love it']}
              />
            </Field>
            <Field label="How much of it is remote?">
              <Slider
                value={Math.round(twin.career.remoteShare * 100)}
                min={0}
                max={100}
                step={10}
                onChange={(v) => patch((t) => void (t.career.remoteShare = v / 100))}
                format={(v) => `${v}%`}
                marks={['All office', 'All remote']}
              />
            </Field>
          </div>
        ),
      },

      {
        id: 'finance',
        title: 'Money',
        lede: 'The gap between what comes in and what goes out is the engine of every long-run financial outcome here. Living costs matter more than income — they set your runway, and runway is what determines whether a bad year is an inconvenience or a catastrophe.',
        minutes: 3,
        render: () => (
          <div className="ob__grid">
            <Field label="Currency">
              <Segmented
                value={twin.finance.currency}
                options={[
                  { value: 'GBP', label: '£ GBP' },
                  { value: 'USD', label: '$ USD' },
                  { value: 'EUR', label: '€ EUR' },
                ]}
                onChange={(v) => patch((t) => void (t.finance.currency = v))}
              />
            </Field>
            <Field label="Gross salary a year">
              <NumberInput
                value={twin.finance.grossIncome}
                min={0}
                step={1000}
                prefix={currencySymbol(twin.finance.currency)}
                onChange={(v) => patch((t) => void (t.finance.grossIncome = v))}
              />
            </Field>
            <Field label="Bonus and equity, annualised" help="Your best honest guess at the expected value, not the headline number.">
              <NumberInput
                value={twin.finance.variableComp}
                min={0}
                step={500}
                prefix={currencySymbol(twin.finance.currency)}
                onChange={(v) => patch((t) => void (t.finance.variableComp = v))}
              />
            </Field>
            <Field label="What you spend a year" help="Everything: rent, food, travel, the lot. Most people underestimate this by a fifth.">
              <NumberInput
                value={twin.finance.livingCosts}
                min={0}
                step={1000}
                prefix={currencySymbol(twin.finance.currency)}
                onChange={(v) => patch((t) => void (t.finance.livingCosts = v))}
              />
            </Field>
            <Field label="Cash savings">
              <NumberInput
                value={twin.finance.cashSavings}
                min={0}
                step={1000}
                prefix={currencySymbol(twin.finance.currency)}
                onChange={(v) => patch((t) => void (t.finance.cashSavings = v))}
              />
            </Field>
            <Field label="Invested (pensions, stocks, funds)">
              <NumberInput
                value={twin.finance.invested}
                min={0}
                step={1000}
                prefix={currencySymbol(twin.finance.currency)}
                onChange={(v) => patch((t) => void (t.finance.invested = v))}
              />
            </Field>
            <Field label="Pension contribution">
              <Slider
                value={Math.round(twin.finance.pensionRate * 100)}
                min={0}
                max={40}
                onChange={(v) => patch((t) => void (t.finance.pensionRate = v / 100))}
                format={(v) => `${v}%`}
              />
            </Field>
            <Field
              label="If everything went wrong, is there a safety net?"
              help="Family, inheritance, a spare room to move into. It changes how much risk the model thinks you can survive, which changes what the downside branches actually look like."
            >
              <Slider
                value={twin.finance.familySafetyNet}
                min={0}
                max={100}
                onChange={(v) => patch((t) => void (t.finance.familySafetyNet = v))}
                marks={['Nothing', 'Fully covered']}
              />
            </Field>

            <div className="ob__full">
              <DebtEditor
                debts={twin.finance.debts}
                currency={twin.finance.currency}
                onChange={(debts) => patch((t) => void (t.finance.debts = debts))}
              />
            </div>
          </div>
        ),
      },

      {
        id: 'education',
        title: 'Education',
        lede: 'Used for the returns-to-schooling term and, honestly, a modest signalling effect. It matters far less in this model than a lot of people expect it to.',
        minutes: 1,
        render: () => (
          <div className="ob__grid">
            <Field label="Highest level completed">
              <Select
                value={twin.education.highest}
                options={[
                  { value: 'none', label: 'No formal qualifications' },
                  { value: 'secondary', label: 'Secondary school' },
                  { value: 'vocational', label: 'Vocational / apprenticeship' },
                  { value: 'bachelors', label: 'Bachelor’s' },
                  { value: 'masters', label: 'Master’s' },
                  { value: 'doctorate', label: 'Doctorate' },
                ] as { value: EducationLevel; label: string }[]}
                onChange={(v) => patch((t) => void (t.education.highest = v))}
              />
            </Field>
            <Field label="Subject">
              <TextInput
                value={twin.education.fieldOfStudy}
                placeholder="e.g. Economics"
                onChange={(v) => patch((t) => void (t.education.fieldOfStudy = v))}
              />
            </Field>
            <Field
              label="How selective was the institution?"
              help="A crude proxy for the signalling value of the credential, which fades quickly with experience in the model — as it does in the evidence."
            >
              <Slider
                value={twin.education.institutionTier}
                min={0}
                max={100}
                onChange={(v) => patch((t) => void (t.education.institutionTier = v))}
                marks={['Open access', 'Highly selective']}
              />
            </Field>
          </div>
        ),
      },

      {
        id: 'personality',
        title: 'Personality',
        lede: 'Twenty statements. Answer quickly and honestly rather than aspirationally — the model uses these to set your wellbeing baseline, and an idealised profile produces an idealised forecast that will not be yours.',
        minutes: 4,
        render: () => (
          <BigFivePanel
            responses={bigFive}
            onChange={(id, value) => {
              const next = { ...bigFive, [id]: value };
              setBigFive(next);
              const scored = scoreBigFive(next);
              patch((t) => void (t.traits.bigFive = scored));
            }}
            scores={twin.traits.bigFive}
          />
        ),
      },

      {
        id: 'disposition',
        title: 'Disposition',
        lede: 'Three dials the Big Five does not capture well, and one estimate that comes with a health warning attached.',
        minutes: 2,
        render: () => (
          <div className="ob__grid">
            <Field
              label="Risk tolerance"
              help="Used two ways: it shifts how much autonomy is worth to you, and it sets the risk-aversion term when options are scored against your own values."
            >
              <Slider
                value={twin.traits.riskTolerance}
                min={0}
                max={100}
                onChange={(v) => patch((t) => void (t.traits.riskTolerance = v))}
                marks={['Certainty please', 'Bring it on']}
              />
            </Field>
            <Field label="Ambition">
              <Slider
                value={twin.traits.ambition}
                min={0}
                max={100}
                onChange={(v) => patch((t) => void (t.traits.ambition = v))}
                marks={['Content', 'Driven']}
              />
            </Field>
            <Field label="Discipline" help="How reliably you do the thing when you do not feel like it.">
              <Slider
                value={twin.traits.discipline}
                min={0}
                max={100}
                onChange={(v) => patch((t) => void (t.traits.discipline = v))}
                marks={['Erratic', 'Relentless']}
              />
            </Field>
            <Field label="Tolerance for ambiguity">
              <Slider
                value={twin.traits.ambiguityTolerance}
                min={0}
                max={100}
                onChange={(v) => patch((t) => void (t.traits.ambiguityTolerance = v))}
                marks={['Need clarity', 'Fine in fog']}
              />
            </Field>

            <div className="ob__full">
              <Panel eyebrow="Optional" title="Cognitive ability estimate">
                <p className="ob__note">
                  If you have a test score, you can enter it. If you do not, leave this alone — the model treats a
                  missing estimate as an unknown to be drawn over, which is more honest than a guess.
                  <br />
                  <br />
                  Two things worth knowing before you type a number in. First, whatever you enter is treated as a{' '}
                  <em>noisy measurement</em>: the engine draws a value around it using the standard error below, so
                  your uncertainty propagates into the spread of outcomes instead of vanishing. Second, the effect
                  size attached to it is small. The widely quoted 0.51 correlation between general cognitive ability
                  and job performance has been substantially revised downward, and this model uses a conservative
                  figure scaled by how complex your field is.
                </p>
                <div className="ob__grid ob__grid--tight">
                  <Field label="How do you know?">
                    <Select
                      value={twin.traits.cognition.method}
                      options={[
                        { value: 'unset', label: 'I would rather not say' },
                        { value: 'test', label: 'A proper test' },
                        { value: 'proxy', label: 'A proxy (SAT, GRE, degree class)' },
                        { value: 'self-report', label: 'A rough guess' },
                      ]}
                      onChange={(v) =>
                        patch((t) => {
                          t.traits.cognition.method = v;
                          t.traits.cognition.standardError = v === 'test' ? 5 : v === 'proxy' ? 10 : v === 'self-report' ? 15 : 12;
                        })
                      }
                    />
                  </Field>
                  {twin.traits.cognition.method !== 'unset' && (
                    <>
                      <Field label="Estimate (100 = average)">
                        <Slider
                          value={twin.traits.cognition.estimate}
                          min={70}
                          max={160}
                          onChange={(v) => patch((t) => void (t.traits.cognition.estimate = v))}
                        />
                      </Field>
                      <Field
                        label="Uncertainty attached to it"
                        help="The engine samples around your estimate using this. Wider means the simulation is less willing to lean on the number."
                      >
                        <Slider
                          value={twin.traits.cognition.standardError}
                          min={2}
                          max={25}
                          onChange={(v) => patch((t) => void (t.traits.cognition.standardError = v))}
                        />
                      </Field>
                    </>
                  )}
                </div>
              </Panel>
            </div>
          </div>
        ),
      },

      {
        id: 'values',
        title: 'What you actually want',
        lede: 'This is the only place the app learns what "better" means to you. Nothing else in Crossroad has an opinion about which future is good — these weights are what turn ten thousand outcomes into a score, and they are yours.',
        minutes: 3,
        render: () => <ValuesPanel />,
      },

      {
        id: 'relationship',
        title: 'Relationship',
        lede: 'Relationship quality is one of the strongest correlates of life satisfaction in the model, and separation is one of the largest financial events. Both are modelled, because leaving them out would quietly bias every long-run result.',
        minutes: 2,
        render: () => (
          <div className="ob__grid">
            <Field label="Status">
              <Select
                value={twin.relationship.status}
                options={[
                  { value: 'single', label: 'Single' },
                  { value: 'dating', label: 'Dating' },
                  { value: 'partnered', label: 'Partnered' },
                  { value: 'engaged', label: 'Engaged' },
                  { value: 'married', label: 'Married' },
                  { value: 'separated', label: 'Separated' },
                ] as { value: RelationshipStatus; label: string }[]}
                onChange={(v) => patch((t) => void (t.relationship.status = v))}
              />
            </Field>
            {['dating', 'partnered', 'engaged', 'married'].includes(twin.relationship.status) && (
              <>
                <Field label="How is it, really?">
                  <Slider
                    value={twin.relationship.satisfaction}
                    min={0}
                    max={100}
                    onChange={(v) => patch((t) => void (t.relationship.satisfaction = v))}
                    marks={['Struggling', 'Thriving']}
                  />
                </Field>
                <Field label="Years together">
                  <Slider
                    value={twin.relationship.yearsTogether}
                    min={0}
                    max={50}
                    onChange={(v) => patch((t) => void (t.relationship.yearsTogether = v))}
                  />
                </Field>
                <Field label="Their gross income">
                  <NumberInput
                    value={twin.relationship.partnerIncome}
                    min={0}
                    step={1000}
                    prefix={currencySymbol(twin.finance.currency)}
                    onChange={(v) => patch((t) => void (t.relationship.partnerIncome = v))}
                  />
                </Field>
                <Field
                  label="How willing are they to move?"
                  help="This almost entirely determines the relationship-strain channel on any relocation question."
                >
                  <Slider
                    value={twin.relationship.partnerMobility}
                    min={0}
                    max={100}
                    onChange={(v) => patch((t) => void (t.relationship.partnerMobility = v))}
                    marks={['Rooted here', 'Anywhere']}
                  />
                </Field>
              </>
            )}
            <Field label="Children">
              <Slider
                value={twin.relationship.children}
                min={0}
                max={6}
                onChange={(v) => patch((t) => void (t.relationship.children = v))}
              />
            </Field>
            <Field label="Do you want (more) children?">
              <Toggle
                checked={twin.relationship.wantsChildren}
                onChange={(v) => patch((t) => void (t.relationship.wantsChildren = v))}
                label={twin.relationship.wantsChildren ? 'Yes' : 'No / undecided'}
              />
            </Field>
          </div>
        ),
      },

      {
        id: 'health',
        title: 'Health',
        lede: 'The slowest variable in the model and, over a long horizon, the one that dominates. Exercise and sleep have two of the best-replicated dose–response relationships in epidemiology, and both compound quietly for decades.',
        minutes: 2,
        render: () => (
          <div className="ob__grid">
            <Field label="How would you rate your health?">
              <Slider
                value={twin.health.selfRated}
                min={0}
                max={100}
                onChange={(v) => patch((t) => void (t.health.selfRated = v))}
                marks={['Poor', 'Excellent']}
              />
            </Field>
            <Field label="Hours of sleep a night">
              <Slider
                value={twin.health.sleepHours}
                min={4}
                max={11}
                step={0.25}
                onChange={(v) => patch((t) => void (t.health.sleepHours = v))}
                format={(v) => `${v}h`}
              />
            </Field>
            <Field
              label="Exercise sessions a week"
              help="Returns diminish sharply. Going from zero to three does far more than going from six to nine — the model reflects that curve rather than treating exercise as linear."
            >
              <Slider
                value={twin.health.exerciseSessions}
                min={0}
                max={14}
                onChange={(v) => patch((t) => void (t.health.exerciseSessions = v))}
              />
            </Field>
            <Field label="Alcohol units a week">
              <Slider
                value={twin.health.alcoholUnits}
                min={0}
                max={50}
                onChange={(v) => patch((t) => void (t.health.alcoholUnits = v))}
              />
            </Field>
            <Field label="Do you smoke?">
              <Toggle
                checked={twin.health.smoker}
                onChange={(v) => patch((t) => void (t.health.smoker = v))}
                label={twin.health.smoker ? 'Yes' : 'No'}
              />
            </Field>
          </div>
        ),
      },

      {
        id: 'network',
        title: 'Network',
        lede: 'Most good opportunities arrive through weak ties rather than applications, so this drives the rate at which the model generates chances for you. Close friendships feed a separate channel: social connection predicts survival with an effect size comparable to well-known risk factors.',
        minutes: 2,
        render: () => (
          <div className="ob__grid">
            <Field
              label="People who would take a call from you about work"
            >
              <Slider
                value={twin.network.professionalContacts}
                min={0}
                max={500}
                step={5}
                onChange={(v) => patch((t) => void (t.network.professionalContacts = v))}
              />
            </Field>
            <Field label="People you could call at 3am">
              <Slider
                value={twin.network.closeFriends}
                min={0}
                max={20}
                onChange={(v) => patch((t) => void (t.network.closeFriends = v))}
              />
            </Field>
            <Field label="Mentors">
              <Slider
                value={twin.network.mentors}
                min={0}
                max={10}
                onChange={(v) => patch((t) => void (t.network.mentors = v))}
              />
            </Field>
            <Field
              label="How far does your network reach beyond your own field?"
              help="Breadth matters more than size for opportunity flow — that is the whole finding behind the strength of weak ties."
            >
              <Slider
                value={twin.network.reach}
                min={0}
                max={100}
                onChange={(v) => patch((t) => void (t.network.reach = v))}
                marks={['One industry', 'Everywhere']}
              />
            </Field>
          </div>
        ),
      },

      {
        id: 'habits',
        title: 'Habits',
        lede: 'The savings rate here is the single most powerful lever any individual has over their long-run financial outcomes in this model — considerably more powerful than investment returns, and entirely within your control.',
        minutes: 2,
        render: () => (
          <div className="ob__grid">
            <Field
              label="Share of take-home you save"
            >
              <Slider
                value={Math.round(twin.habits.savingsRate * 100)}
                min={0}
                max={80}
                onChange={(v) => patch((t) => void (t.habits.savingsRate = v / 100))}
                format={(v) => `${v}%`}
              />
            </Field>
            <Field
              label="Hours a week of deliberate practice"
              help="Not work — practice at the edge of your ability, where you are actually bad at the thing. The evidence for its effect is much weaker than the popular version suggests, and the model treats it accordingly."
            >
              <Slider
                value={twin.habits.deliberatePractice}
                min={0}
                max={30}
                onChange={(v) => patch((t) => void (t.habits.deliberatePractice = v))}
                format={(v) => `${v}h`}
              />
            </Field>
            <Field label="Hours a week reading or learning">
              <Slider
                value={twin.habits.learningHours}
                min={0}
                max={30}
                onChange={(v) => patch((t) => void (t.habits.learningHours = v))}
                format={(v) => `${v}h`}
              />
            </Field>
            <Field label="Times a week you see people socially">
              <Slider
                value={twin.habits.socialContact}
                min={0}
                max={14}
                onChange={(v) => patch((t) => void (t.habits.socialContact = v))}
              />
            </Field>
            <Field label="Non-work screen hours a day">
              <Slider
                value={twin.habits.discretionaryScreen}
                min={0}
                max={12}
                step={0.5}
                onChange={(v) => patch((t) => void (t.habits.discretionaryScreen = v))}
                format={(v) => `${v}h`}
              />
            </Field>
          </div>
        ),
      },
    ],
    [twin, patch, bigFive],
  );

  const chapter = chapters[index];
  const isLast = index === chapters.length - 1;
  const totalMinutes = chapters.reduce((sum, c) => sum + c.minutes, 0);

  const advance = () => {
    markChapter(chapter.id);
    if (isLast) go('twin');
    else setIndex((i) => i + 1);
  };

  return (
    <div className="ob">
      <div className="ob__rail">
        <div className="eyebrow">Building your twin</div>
        <ol className="ob__steps">
          {chapters.map((c, i) => (
            <li key={c.id}>
              <button
                className={`ob__step${i === index ? ' is-current' : ''}${
                  twin.completed.includes(c.id) ? ' is-done' : ''
                }`}
                onClick={() => setIndex(i)}
              >
                <span className="ob__step-dot" />
                <span className="ob__step-label">{c.title}</span>
                <span className="ob__step-time num">{c.minutes}m</span>
              </button>
            </li>
          ))}
        </ol>
        <p className="ob__rail-note">
          About {totalMinutes} minutes in total. Nothing is required — skip anything and the model falls back to a
          population average, which the twin screen will show you plainly.
        </p>
      </div>

      <div className="ob__main">
        <AnimatePresence mode="wait">
          <motion.div
            key={chapter.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <header className="ob__header">
              <div className="eyebrow">
                Chapter {index + 1} of {chapters.length}
              </div>
              <h2 className="display ob__title">{chapter.title}</h2>
              <p className="ob__lede">{chapter.lede}</p>
            </header>

            <div className="ob__body">{chapter.render()}</div>
          </motion.div>
        </AnimatePresence>

        <footer className="ob__footer">
          <Button variant="ghost" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
            Back
          </Button>
          <div className="ob__footer-right">
            <Button variant="ghost" onClick={() => (isLast ? go('twin') : setIndex((i) => i + 1))}>
              Skip
            </Button>
            <Button variant="primary" onClick={advance}>
              {isLast ? 'See your twin' : 'Continue'}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Big Five instrument
// ---------------------------------------------------------------------------

function BigFivePanel({
  responses,
  onChange,
  scores,
}: {
  responses: BigFiveResponses;
  onChange: (id: string, value: number) => void;
  scores: BigFive;
}) {
  const answered = BIG_FIVE_ITEMS.filter((i) => responses[i.id] !== undefined).length;

  return (
    <div className="bigfive">
      <div className="bigfive__progress">
        <span className="num">
          {answered} / {BIG_FIVE_ITEMS.length}
        </span>
        <div className="bigfive__bar">
          <motion.div
            className="bigfive__bar-fill"
            animate={{ width: `${(answered / BIG_FIVE_ITEMS.length) * 100}%` }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      </div>

      <ol className="bigfive__items">
        {BIG_FIVE_ITEMS.map((item) => (
          <li key={item.id} className={`bigfive__item${responses[item.id] ? ' is-answered' : ''}`}>
            <span className="bigfive__text">{item.text}</span>
            <div className="bigfive__scale" role="radiogroup" aria-label={item.text}>
              {LIKERT.map((option) => (
                <button
                  key={option.value}
                  role="radio"
                  aria-checked={responses[item.id] === option.value}
                  title={option.label}
                  className={`bigfive__dot${responses[item.id] === option.value ? ' is-on' : ''}`}
                  onClick={() => onChange(item.id, option.value)}
                >
                  <span className="bigfive__dot-inner" />
                </button>
              ))}
            </div>
          </li>
        ))}
      </ol>

      <div className="bigfive__scores">
        {(Object.keys(TRAIT_INFO) as BigFiveTrait[]).map((trait) => {
          const info = TRAIT_INFO[trait];
          const value = scores[trait] ?? 50;
          return (
            <div key={trait} className="bigfive__score">
              <div className="bigfive__score-head">
                <span>{info.label}</span>
                <span className="num">{value}</span>
              </div>
              <div className="bigfive__score-bar">
                <motion.div
                  className="bigfive__score-fill"
                  animate={{ width: `${value}%` }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
              <p className="bigfive__score-note">{info.matters}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

function ValuesPanel() {
  const twin = useApp((s) => s.twin);
  const updateTwin = useApp((s) => s.updateTwin);

  const total = VALUE_IDS.reduce((sum, id) => sum + (twin.values[id] ?? 0), 0);

  return (
    <div className="values">
      <div className="values__list">
        {VALUE_IDS.map((id: ValueId) => {
          const value = twin.values[id] ?? 50;
          const weight = total > 0 ? value / total : 0;
          return (
            <div key={id} className="values__row">
              <div className="values__meta">
                <span className="values__label">{VALUE_LABELS[id].label}</span>
                <span className="values__blurb">{VALUE_LABELS[id].blurb}</span>
              </div>
              <div className="values__slider">
                <Slider
                  value={value}
                  min={0}
                  max={100}
                  onChange={(v) => updateTwin((t) => void (t.values[id] = v))}
                  format={() => `${(weight * 100).toFixed(1)}%`}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="values__note">
        These are normalised into weights, so what matters is how they compare to each other rather than the absolute
        numbers. Setting everything to a hundred is the same as setting everything to fifty.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Debts
// ---------------------------------------------------------------------------

function DebtEditor({
  debts,
  currency,
  onChange,
}: {
  debts: Debt[];
  currency: string;
  onChange: (debts: Debt[]) => void;
}) {
  const add = () =>
    onChange([
      ...debts,
      {
        id: `debt-${Date.now()}`,
        label: 'New debt',
        balance: 5000,
        rate: 0.06,
        annualPayment: 1200,
        kind: 'personal',
      },
    ]);

  const update = (id: string, patch: Partial<Debt>) =>
    onChange(debts.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  return (
    <Panel
      eyebrow="Debts"
      title="Anything you owe"
      action={
        <Button size="sm" onClick={add}>
          Add
        </Button>
      }
    >
      {debts.length === 0 && <p className="ob__note">Nothing owed. Leave it that way if that is true.</p>}
      <div className="debts">
        {debts.map((debt) => (
          <div key={debt.id} className="debts__row">
            <TextInput value={debt.label} onChange={(v) => update(debt.id, { label: v })} />
            <NumberInput
              value={debt.balance}
              min={0}
              step={500}
              prefix={currencySymbol(currency)}
              onChange={(v) => update(debt.id, { balance: v })}
            />
            <NumberInput
              value={Math.round(debt.rate * 1000) / 10}
              min={0}
              max={100}
              step={0.1}
              suffix="%"
              onChange={(v) => update(debt.id, { rate: v / 100 })}
            />
            <Select
              value={debt.kind}
              options={[
                { value: 'student', label: 'Student' },
                { value: 'mortgage', label: 'Mortgage' },
                { value: 'credit', label: 'Credit card' },
                { value: 'personal', label: 'Personal' },
                { value: 'business', label: 'Business' },
              ]}
              onChange={(v) => update(debt.id, { kind: v as Debt['kind'] })}
            />
            <Button variant="ghost" size="sm" onClick={() => onChange(debts.filter((d) => d.id !== debt.id))}>
              Remove
            </Button>
          </div>
        ))}
      </div>
      {debts.length > 0 && (
        <div className="debts__total">
          <Tag>Total owed {money(debts.reduce((sum, d) => sum + d.balance, 0), currency)}</Tag>
        </div>
      )}
    </Panel>
  );
}

function currencySymbol(currency: string): string {
  return currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£';
}
