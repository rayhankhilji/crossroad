/**
 * The assumption registry.
 *
 * Crossroad does not predict your life. It runs a model, and a model is only
 * ever as good as the numbers you put into it. So every single number the
 * engine uses lives here, in the open, with a rationale, a confidence rating
 * and a source — and every one of them is editable by the user.
 *
 * If you change a number here, the whole app changes with it. That is the
 * point. When the results screen says "+£4.1m", you can click the number,
 * walk back through the drivers, land on the assumptions underneath, disagree
 * with one, drag it, and watch the answer move. A forecast you cannot argue
 * with is not a forecast, it is a horoscope.
 *
 * Confidence ratings mean:
 *   high   — replicated meta-analytic or national-statistics grade evidence
 *   medium — solid single studies or well-established industry data, contested
 *            at the margins
 *   low    — a defensible guess. Structural choices, not measurements.
 *
 * Nothing in here is a personalised prediction, and several of the "high"
 * confidence findings are population averages that may not transfer to any
 * individual. That caveat is carried into the UI rather than buried here.
 */

export type AssumptionGroup =
  | 'wellbeing'
  | 'income'
  | 'wealth'
  | 'career'
  | 'entrepreneurship'
  | 'health'
  | 'relationships'
  | 'geography'
  | 'model';

export interface AssumptionSource {
  label: string;
  url?: string;
  kind: 'meta-analysis' | 'empirical' | 'official-statistics' | 'industry-data' | 'estimate' | 'convention';
}

export interface Assumption {
  id: string;
  group: AssumptionGroup;
  label: string;
  /** The default the engine ships with. */
  value: number;
  min: number;
  max: number;
  step: number;
  /** Suffix shown in the UI: '%', 'yr', '×', '' … */
  unit: string;
  /** Display multiplier — e.g. 100 to show 0.05 as "5%". */
  display?: number;
  /** Why this number, in plain English. Shown wherever the number is used. */
  rationale: string;
  /** What is wrong or uncertain about it. Always shown next to the rationale. */
  caveat?: string;
  confidence: 'high' | 'medium' | 'low';
  sources: AssumptionSource[];
}

const A = <const T extends readonly Assumption[]>(list: T) => list;

export const ASSUMPTION_LIST = A([
  // -------------------------------------------------------------------------
  // Wellbeing
  // -------------------------------------------------------------------------
  {
    id: 'wellbeing.logIncomeSlope',
    group: 'wellbeing',
    label: 'Wellbeing gain per doubling of income',
    value: 3.2,
    min: 0,
    max: 10,
    step: 0.1,
    unit: 'pts',
    rationale:
      'Experienced wellbeing rises roughly linearly with the logarithm of income — each doubling adds a similar increment, so going from £25k to £50k moves you as much as £50k to £100k does. The engine uses points on a 0–100 wellbeing scale.',
    caveat:
      'Kahneman & Deaton found a plateau near $75k; Killingsworth found no plateau. The 2023 adversarial collaboration between them concluded both were partly right: the plateau exists for the least happy ~20% of people, while for everyone else wellbeing keeps climbing. This single slope is a simplification of that.',
    confidence: 'high',
    sources: [
      { label: 'Killingsworth (2021), PNAS — Experienced well-being rises with income', kind: 'empirical' },
      { label: 'Kahneman & Deaton (2010), PNAS — High income improves evaluation of life but not emotional well-being', kind: 'empirical' },
      { label: 'Killingsworth, Kahneman & Mellers (2023), PNAS — Income and emotional well-being: a conflict resolved', kind: 'empirical' },
    ],
  },
  {
    id: 'wellbeing.adaptationHalfLife',
    group: 'wellbeing',
    label: 'Hedonic adaptation half-life',
    value: 1.6,
    min: 0.25,
    max: 8,
    step: 0.05,
    unit: 'yr',
    rationale:
      'Most circumstantial changes — a raise, a nicer flat, a new city — fade. The engine decays the wellbeing effect of each shock toward your set point with this half-life, so a windfall that adds 8 points today adds 4 points in about eighteen months.',
    caveat:
      'Adaptation is not universal. Longitudinal panel work finds people largely return to baseline after marriage but do *not* fully adapt to unemployment, disability or widowhood. The engine models those exceptions separately rather than applying this half-life to everything.',
    confidence: 'high',
    sources: [
      { label: 'Lucas, Clark, Georgellis & Diener (2003, 2004) — Reexamining adaptation and the set point model', kind: 'empirical' },
      { label: 'Diener, Lucas & Scollon (2006) — Beyond the hedonic treadmill', kind: 'empirical' },
    ],
  },
  {
    id: 'wellbeing.setPointWeight',
    group: 'wellbeing',
    label: 'Share of wellbeing anchored to disposition',
    value: 0.45,
    min: 0,
    max: 0.9,
    step: 0.01,
    unit: '%',
    display: 100,
    rationale:
      'A large, stable fraction of how happy you feel is temperament rather than circumstance — mostly low neuroticism and high extraversion. The engine anchors this share of wellbeing to your Big Five profile so that circumstances move the rest.',
    caveat:
      'The popular "50% genes, 10% circumstances, 40% intentional activity" pie chart is not well supported — its own authors have walked it back, and the underlying twin-study heritability estimates do not decompose life outcomes that way. Treat this as a modelling choice, not a measurement.',
    confidence: 'medium',
    sources: [
      { label: 'Lykken & Tellegen (1996) — Happiness is a stochastic phenomenon', kind: 'empirical' },
      { label: 'Brown & Rohrer (2020) — critique of the happiness pie chart', kind: 'empirical' },
      { label: 'Steel, Schmidt & Shultz (2008) — meta-analysis of personality and subjective well-being', kind: 'meta-analysis' },
    ],
  },
  {
    id: 'wellbeing.unemploymentPenalty',
    group: 'wellbeing',
    label: 'Wellbeing cost of involuntary unemployment',
    value: 11,
    min: 0,
    max: 30,
    step: 0.5,
    unit: 'pts',
    rationale:
      'Losing work costs far more wellbeing than the lost income alone accounts for, and unlike most shocks it does not fully fade with time — panel studies find a persistent scar even after re-employment.',
    caveat:
      'Voluntary breaks (a planned sabbatical, a funded startup attempt) do not carry this penalty in the engine, because the evidence is specifically about involuntary job loss.',
    confidence: 'high',
    sources: [
      { label: 'Clark, Diener, Georgellis & Lucas (2008), Economic Journal — Lags and leads in life satisfaction', kind: 'empirical' },
      { label: 'Winkelmann & Winkelmann (1998) — Why are the unemployed so unhappy?', kind: 'empirical' },
    ],
  },
  {
    id: 'wellbeing.relationshipWeight',
    group: 'wellbeing',
    label: 'Wellbeing weight on relationship quality',
    value: 0.22,
    min: 0,
    max: 0.5,
    step: 0.01,
    unit: '×',
    rationale:
      'The quality of close relationships is one of the strongest single correlates of life satisfaction — larger than income across most of the income range. The engine gives relationship quality this weight in the wellbeing composite.',
    caveat:
      'Correlational. Happy people also form and keep better relationships, so a good chunk of this is reverse causation. The engine deliberately does not model that feedback loop, which likely overstates the causal effect of a relationship change.',
    confidence: 'medium',
    sources: [
      { label: 'Waldinger & Schulz — Harvard Study of Adult Development', kind: 'empirical' },
      { label: 'Diener & Seligman (2002) — Very happy people', kind: 'empirical' },
    ],
  },
  {
    id: 'wellbeing.stressWeight',
    group: 'wellbeing',
    label: 'Wellbeing weight on chronic stress',
    value: 0.28,
    min: 0,
    max: 0.6,
    step: 0.01,
    unit: '×',
    rationale:
      'Sustained stress suppresses day-to-day wellbeing more reliably than almost any circumstantial gain raises it. Weighted heavily, and asymmetrically: the engine lets stress subtract faster than income adds.',
    confidence: 'medium',
    sources: [{ label: 'Modelling choice informed by affective-science literature on negativity bias', kind: 'estimate' }],
  },
  {
    id: 'wellbeing.commutePenalty',
    group: 'wellbeing',
    label: 'Wellbeing cost per 30 min of daily commute',
    value: 2.4,
    min: 0,
    max: 10,
    step: 0.1,
    unit: 'pts',
    rationale:
      'People systematically fail to be compensated for commuting — the "commuting paradox". Longer commutes predict lower life satisfaction even after controlling for the higher pay or cheaper housing that bought them.',
    caveat: 'Effect sizes vary a lot by mode; an enjoyable train commute with a book is not a 90-minute drive.',
    confidence: 'medium',
    sources: [{ label: 'Stutzer & Frey (2008) — Stress that doesn’t pay: the commuting paradox', kind: 'empirical' }],
  },
  {
    id: 'wellbeing.socialFormationRate',
    group: 'wellbeing',
    label: 'Close friendships formed per year in a new city',
    value: 0.9,
    min: 0,
    max: 4,
    step: 0.1,
    unit: '/yr',
    rationale:
      'Rebuilding a close social circle after a move is slow. The engine forms roughly this many close ties per year, scaled by extraversion and by the destination’s social density, while distant ties decay.',
    caveat:
      'Highly idiosyncratic. Moving to a city where you already have friends is a completely different event from arriving cold, and the engine only partly captures that through the network profile.',
    confidence: 'low',
    sources: [{ label: 'Hall (2019) — How many hours does it take to make a friend?', kind: 'empirical' }],
  },
  {
    id: 'wellbeing.discountRate',
    group: 'wellbeing',
    label: 'Discount rate on future wellbeing',
    value: 0.03,
    min: 0,
    max: 0.15,
    step: 0.005,
    unit: '%',
    display: 100,
    rationale:
      'When summing wellbeing across a whole simulated life, later years are discounted at this rate. A low rate treats your future self almost as much as your present self.',
    caveat:
      'This is an ethical choice dressed as a parameter. Set it to zero if you think a happy year at 60 counts exactly as much as a happy year at 30.',
    confidence: 'low',
    sources: [{ label: 'Convention in welfare economics; user-adjustable by design', kind: 'convention' }],
  },

  // -------------------------------------------------------------------------
  // Income and career
  // -------------------------------------------------------------------------
  {
    id: 'income.baseRealGrowth',
    group: 'income',
    label: 'Baseline real wage growth',
    value: 0.012,
    min: -0.02,
    max: 0.06,
    step: 0.001,
    unit: '%',
    display: 100,
    rationale:
      'Economy-wide real earnings growth, before anything you personally do. UK real wages have grown at roughly this pace on average over recent decades, with long flat stretches.',
    caveat: 'A national average across a period that included a decade of near-zero real growth. Sector matters enormously.',
    confidence: 'medium',
    sources: [{ label: 'ONS — Average Weekly Earnings, real terms series', kind: 'official-statistics' }],
  },
  {
    id: 'income.experienceReturn',
    group: 'income',
    label: 'Peak return to a year of experience',
    value: 0.035,
    min: 0,
    max: 0.12,
    step: 0.002,
    unit: '%',
    display: 100,
    rationale:
      'Earnings rise steeply early in a career and flatten later — the classic concave age–earnings profile from the Mincer earnings function. This is the slope near the start; the engine decays it with experience and flattens it near retirement.',
    confidence: 'high',
    sources: [
      { label: 'Mincer (1974) — Schooling, Experience and Earnings', kind: 'empirical' },
      { label: 'ONS — Annual Survey of Hours and Earnings, age profiles', kind: 'official-statistics' },
    ],
  },
  {
    id: 'income.jobChangePremium',
    group: 'income',
    label: 'Pay bump from changing employer',
    value: 0.14,
    min: 0,
    max: 0.5,
    step: 0.01,
    unit: '%',
    display: 100,
    rationale:
      'Moving employer reliably pays better than staying. Job switchers have consistently posted higher wage growth than stayers in matched payroll data, and the gap widens in tight labour markets.',
    caveat: 'The premium compresses sharply in a slack market; the engine scales it down when the simulated economy is weak.',
    confidence: 'high',
    sources: [
      { label: 'ADP Research — Job switchers vs stayers pay growth series', kind: 'industry-data' },
      { label: 'Federal Reserve Bank of Atlanta — Wage Growth Tracker, job switcher series', kind: 'official-statistics' },
    ],
  },
  {
    id: 'income.conscientiousnessReturn',
    group: 'income',
    label: 'Income effect of conscientiousness',
    value: 0.055,
    min: 0,
    max: 0.2,
    step: 0.005,
    unit: '%',
    display: 100,
    rationale:
      'Conscientiousness is the Big Five trait that most consistently predicts job performance across occupations, and it shows up in earnings. Applied here as an annual multiplier on income growth for someone a standard deviation above the mean.',
    caveat:
      'The classic validity coefficient is around 0.2 — real, but modest. It explains a few percent of variance in performance, not most of it. The engine keeps the effect small on purpose.',
    confidence: 'high',
    sources: [
      { label: 'Barrick & Mount (1991) — The Big Five personality dimensions and job performance: a meta-analysis', kind: 'meta-analysis' },
      { label: 'Sackett, Zhang, Berry & Lievens (2022) — Revisiting meta-analytic estimates of validity', kind: 'meta-analysis' },
    ],
  },
  {
    id: 'income.cognitiveReturn',
    group: 'income',
    label: 'Income effect of cognitive ability',
    value: 0.04,
    min: 0,
    max: 0.2,
    step: 0.005,
    unit: '%',
    display: 100,
    rationale:
      'General cognitive ability predicts job performance and training success, more strongly in complex jobs than simple ones. Applied per standard deviation, scaled by the complexity of your field.',
    caveat:
      'The widely quoted 0.51 validity from Schmidt & Hunter has been substantially revised downward — corrections for range restriction were applied in a way that inflated it. The engine uses a deliberately conservative effect, and treats any self-reported IQ estimate as noisy by attaching a standard error to it.',
    confidence: 'medium',
    sources: [
      { label: 'Schmidt & Hunter (1998) — The validity and utility of selection methods', kind: 'meta-analysis' },
      { label: 'Sackett et al. (2022) — Revisiting meta-analytic estimates of validity in personnel selection', kind: 'meta-analysis' },
    ],
  },
  {
    id: 'income.educationReturn',
    group: 'income',
    label: 'Return per additional year of education',
    value: 0.085,
    min: 0,
    max: 0.25,
    step: 0.005,
    unit: '%',
    display: 100,
    rationale:
      'The private return to a year of schooling clusters around 8–10% globally in the Mincerian literature, and instrumental-variable studies broadly support a causal component.',
    caveat:
      'An average across fields that hides enormous variance — the return to a postgraduate arts degree and to a medical degree are not the same number, and part of the return is signalling rather than skill.',
    confidence: 'high',
    sources: [
      { label: 'Psacharopoulos & Patrinos (2018) — Returns to investment in education: a decennial review', kind: 'meta-analysis' },
      { label: 'Card (1999) — The causal effect of education on earnings', kind: 'empirical' },
    ],
  },
  {
    id: 'income.shockSigma',
    group: 'income',
    label: 'Annual income volatility',
    value: 0.14,
    min: 0.02,
    max: 0.5,
    step: 0.01,
    unit: '%',
    display: 100,
    rationale:
      'Individual earnings are much more volatile year to year than aggregate wage series suggest. This is the log-space standard deviation of the idiosyncratic shock applied each year.',
    caveat: 'Fat-tailed in reality — the engine uses a log-normal, which understates the worst years.',
    confidence: 'medium',
    sources: [{ label: 'Guvenen et al. — What do data on millions of U.S. workers reveal about earnings risk?', kind: 'empirical' }],
  },
  {
    id: 'career.layoffBaseRate',
    group: 'career',
    label: 'Baseline annual involuntary job loss risk',
    value: 0.055,
    min: 0,
    max: 0.3,
    step: 0.005,
    unit: '%',
    display: 100,
    rationale:
      'The chance of being laid off, made redundant or otherwise involuntarily separated in a given year, before adjusting for your employer stage, seniority and the simulated economy.',
    caveat: 'Varies by an order of magnitude across sectors and firm stage. The engine adjusts it heavily; this is only the anchor.',
    confidence: 'medium',
    sources: [{ label: 'ONS Labour Force Survey — redundancy rates; US JOLTS layoffs and discharges rate', kind: 'official-statistics' }],
  },
  {
    id: 'career.capitalGrowthRate',
    group: 'career',
    label: 'Career capital growth from deliberate practice',
    value: 1.8,
    min: 0,
    max: 6,
    step: 0.1,
    unit: 'pts/yr',
    rationale:
      'Points of career capital gained per year for someone doing about ten hours a week of genuinely deliberate practice at the edge of their ability. Scaled by discipline and by how much your work stretches you.',
    caveat:
      'The "deliberate practice explains expertise" claim has been substantially trimmed by replication — meta-analysis puts it at a modest share of the variance in professional domains, far below the popular 10,000-hours story.',
    confidence: 'low',
    sources: [
      { label: 'Ericsson, Krampe & Tesch-Römer (1993) — The role of deliberate practice', kind: 'empirical' },
      { label: 'Macnamara, Hambrick & Oswald (2014) — Deliberate practice and performance: a meta-analysis', kind: 'meta-analysis' },
    ],
  },
  {
    id: 'career.capitalDecayRate',
    group: 'career',
    label: 'Career capital decay when not practising',
    value: 2.6,
    min: 0,
    max: 10,
    step: 0.1,
    unit: 'pts/yr',
    rationale:
      'Skills and reputation depreciate. Technical fields depreciate fastest; the engine scales this by how quickly your field turns over. A gap year costs more in machine learning than in law.',
    confidence: 'low',
    sources: [{ label: 'Modelling choice; informed by literature on skill obsolescence and career-break wage scarring', kind: 'estimate' }],
  },
  {
    id: 'career.networkOpportunityRate',
    group: 'career',
    label: 'Opportunities surfaced per year by a strong network',
    value: 1.5,
    min: 0,
    max: 6,
    step: 0.1,
    unit: '/yr',
    rationale:
      'Most good jobs arrive through weak ties rather than applications. The engine converts network strength into a Poisson rate of unsolicited opportunities, each of which may carry a pay premium.',
    confidence: 'medium',
    sources: [
      { label: 'Granovetter (1973) — The strength of weak ties', kind: 'empirical' },
      { label: 'Rajkumar et al. (2022), Science — A causal test of the strength of weak ties', kind: 'empirical' },
    ],
  },
  {
    id: 'career.burnoutThreshold',
    group: 'career',
    label: 'Weekly hours before burnout risk accelerates',
    value: 52,
    min: 35,
    max: 90,
    step: 1,
    unit: 'h',
    rationale:
      'Output per hour falls and health risk rises past roughly this point. Beyond it the engine converts extra hours into stress at an accelerating rate and into productive output at a decreasing one.',
    caveat: 'Threshold varies with autonomy and meaning — 60 hours on your own project is not 60 hours on someone else’s.',
    confidence: 'medium',
    sources: [
      { label: 'Pencavel (2014) — The productivity of working hours', kind: 'empirical' },
      { label: 'Kivimäki et al. (2015), Lancet — Long working hours and risk of coronary heart disease and stroke', kind: 'meta-analysis' },
    ],
  },

  // -------------------------------------------------------------------------
  // Wealth
  // -------------------------------------------------------------------------
  {
    id: 'wealth.realReturn',
    group: 'wealth',
    label: 'Expected real return on invested assets',
    value: 0.05,
    min: -0.02,
    max: 0.12,
    step: 0.0025,
    unit: '%',
    display: 100,
    rationale:
      'Long-run real (inflation-adjusted) total return on a globally diversified equity portfolio, measured over more than a century across many markets.',
    caveat:
      'The historical record is survivorship-flattered and the future need not resemble it. Starting valuations matter: the same 5% assumption applied at a high CAPE has historically disappointed.',
    confidence: 'high',
    sources: [{ label: 'Dimson, Marsh & Staunton — Global Investment Returns Yearbook', kind: 'empirical' }],
  },
  {
    id: 'wealth.returnVolatility',
    group: 'wealth',
    label: 'Annual volatility of invested assets',
    value: 0.17,
    min: 0.02,
    max: 0.4,
    step: 0.005,
    unit: '%',
    display: 100,
    rationale:
      'Standard deviation of annual real equity returns. This is what turns a single expected value into a distribution, and it is why the spread of outcomes widens the further out you look.',
    caveat:
      'Real returns are not normally distributed — crashes cluster and are fatter-tailed than this. The engine adds an explicit crash process on top to compensate.',
    confidence: 'high',
    sources: [{ label: 'Dimson, Marsh & Staunton — Global Investment Returns Yearbook', kind: 'empirical' }],
  },
  {
    id: 'wealth.crashProbability',
    group: 'wealth',
    label: 'Annual probability of a major market drawdown',
    value: 0.07,
    min: 0,
    max: 0.3,
    step: 0.005,
    unit: '%',
    display: 100,
    rationale:
      'A drop of 25% or more in a single year. Adds the fat left tail that a plain log-normal misses, and correlates with a spike in layoff risk in the same year.',
    confidence: 'medium',
    sources: [{ label: 'Historical frequency of >25% annual real drawdowns in developed equity markets', kind: 'empirical' }],
  },
  {
    id: 'wealth.lifestyleInflation',
    group: 'wealth',
    label: 'Share of a pay rise absorbed by spending',
    value: 0.45,
    min: 0,
    max: 1,
    step: 0.05,
    unit: '%',
    display: 100,
    rationale:
      'When income rises, spending follows. This is the fraction of each raise that gets absorbed into the standard of living rather than saved — the single most underrated determinant of long-run wealth in the model.',
    caveat: 'Extremely person-specific. The engine nudges it using your stated savings rate and conscientiousness, but it is worth setting by hand.',
    confidence: 'medium',
    sources: [{ label: 'Consumption-smoothing literature; permanent income hypothesis with partial adjustment', kind: 'empirical' }],
  },
  {
    id: 'wealth.safeWithdrawalRate',
    group: 'wealth',
    label: 'Sustainable withdrawal rate',
    value: 0.038,
    min: 0.02,
    max: 0.08,
    step: 0.001,
    unit: '%',
    display: 100,
    rationale:
      'Used to convert a pot of money into the "freedom" metric: how much of your annual spending your assets could cover indefinitely. The classic 4% rule, trimmed for lower expected returns and longer retirements.',
    caveat: 'The 4% rule was derived from US-only historical data over 30-year windows. It has held up less well internationally.',
    confidence: 'medium',
    sources: [
      { label: 'Bengen (1994); Cooley, Hubbard & Walz (1998) — the Trinity study', kind: 'empirical' },
      { label: 'Estrada — international evidence on safe withdrawal rates', kind: 'empirical' },
    ],
  },
  {
    id: 'wealth.runwayStressPoint',
    group: 'wealth',
    label: 'Runway below which financial stress bites',
    value: 6,
    min: 0,
    max: 36,
    step: 1,
    unit: 'mo',
    rationale:
      'Months of spending covered by liquid savings. Below this the engine ramps financial stress up sharply and starts constraining choices — you take the safe job, not the right one.',
    confidence: 'medium',
    sources: [{ label: 'Financial-precarity and wellbeing literature; scarcity effects on decision-making', kind: 'empirical' }],
  },

  // -------------------------------------------------------------------------
  // Entrepreneurship
  // -------------------------------------------------------------------------
  {
    id: 'startup.failureRate',
    group: 'entrepreneurship',
    label: 'Share of funded startups returning nothing',
    value: 0.7,
    min: 0.2,
    max: 0.95,
    step: 0.01,
    unit: '%',
    display: 100,
    rationale:
      'Across venture portfolios, the large majority of investments return less than the capital in. The engine treats this as the probability mass on the "no financial return to the founder" branch.',
    caveat:
      'The base rate depends enormously on what you count. Unfunded side projects that quietly stop are not in this denominator, and "failure" for an investor is not the same as failure for a founder, who may still have been paid a salary and gained career capital.',
    confidence: 'medium',
    sources: [
      { label: 'Correlation Ventures / Cambridge Associates — distribution of VC investment outcomes', kind: 'industry-data' },
      { label: 'CB Insights — startup failure post-mortems', kind: 'industry-data' },
    ],
  },
  {
    id: 'startup.acquisitionRate',
    group: 'entrepreneurship',
    label: 'Share reaching a modest exit',
    value: 0.22,
    min: 0.01,
    max: 0.6,
    step: 0.01,
    unit: '%',
    display: 100,
    rationale:
      'Acqui-hires and small trade sales — life-changing but not fortune-making. This is the middle of the outcome distribution and, for most founders, the realistic good case.',
    confidence: 'medium',
    sources: [{ label: 'Cambridge Associates / PitchBook exit distributions', kind: 'industry-data' }],
  },
  {
    id: 'startup.breakoutRate',
    group: 'entrepreneurship',
    label: 'Share reaching a breakout outcome',
    value: 0.02,
    min: 0.001,
    max: 0.2,
    step: 0.001,
    unit: '%',
    display: 100,
    rationale:
      'The tail that pays for everything else. Venture returns follow a power law, so the mean outcome of founding a company is dominated by a small number of enormous wins that almost nobody gets.',
    caveat:
      'This is exactly why the expected value of founding is a misleading number to look at alone. Crossroad always shows you the median next to the mean for this reason, and they are very far apart here.',
    confidence: 'medium',
    sources: [{ label: 'Power-law distribution of venture outcomes; Cambridge Associates benchmark data', kind: 'industry-data' }],
  },
  {
    id: 'startup.breakoutParetoAlpha',
    group: 'entrepreneurship',
    label: 'Power-law shape of breakout outcomes',
    value: 1.15,
    min: 1.02,
    max: 3,
    step: 0.01,
    unit: 'α',
    rationale:
      'The Pareto shape parameter for the value of a breakout exit. Values near 1 mean the tail is so heavy that the average is dominated by the single largest outcome and is unstable across samples.',
    caveat: 'With alpha this low the sample mean genuinely does not converge well. That is a fact about the world, not a bug in the model — treat mean exit value with suspicion.',
    confidence: 'low',
    sources: [{ label: 'Empirical fits to venture exit size distributions', kind: 'industry-data' }],
  },
  {
    id: 'startup.founderSalaryRatio',
    group: 'entrepreneurship',
    label: 'Founder pay as a share of market salary',
    value: 0.45,
    min: 0,
    max: 1.2,
    step: 0.05,
    unit: '%',
    display: 100,
    rationale:
      'What an early-stage founder actually pays themselves relative to what they could earn employed. The gap is the real, certain cost paid up front against an uncertain payoff.',
    confidence: 'medium',
    sources: [{ label: 'Pilot / Kruze Consulting founder compensation surveys', kind: 'industry-data' }],
  },
  {
    id: 'startup.careerCapitalBonus',
    group: 'entrepreneurship',
    label: 'Career capital gained per year founding',
    value: 3.4,
    min: -2,
    max: 10,
    step: 0.1,
    unit: 'pts/yr',
    rationale:
      'Even a failed company is a credential and an accelerated education. The engine credits founding with faster career capital growth than an equivalent employed year, which is why a failed startup often still improves the median path.',
    caveat: 'Not universal — a failure in a field that stigmatises it, or after a very long run, can be career-negative. The engine reduces the bonus for very long unsuccessful attempts.',
    confidence: 'low',
    sources: [{ label: 'Modelling choice; informed by serial-founder outcome studies', kind: 'estimate' }],
  },
  {
    id: 'startup.hoursPremium',
    group: 'entrepreneurship',
    label: 'Extra weekly hours while founding',
    value: 14,
    min: 0,
    max: 40,
    step: 1,
    unit: 'h',
    rationale: 'Founding adds hours on top of an already full week, which the engine converts into stress and into relationship and health pressure.',
    confidence: 'medium',
    sources: [{ label: 'Founder time-use surveys', kind: 'industry-data' }],
  },

  // -------------------------------------------------------------------------
  // Health
  // -------------------------------------------------------------------------
  {
    id: 'health.ageDeclineRate',
    group: 'health',
    label: 'Baseline health decline with age',
    value: 0.55,
    min: 0,
    max: 3,
    step: 0.05,
    unit: 'pts/yr',
    rationale:
      'Points of the 0–100 health index lost per year at age 40, accelerating with age on a Gompertz-like curve. Calibrated so that the average trajectory tracks self-rated health by age in national surveys.',
    confidence: 'medium',
    sources: [{ label: 'ONS national life tables; self-rated health by age, Health Survey for England', kind: 'official-statistics' }],
  },
  {
    id: 'health.exerciseBenefit',
    group: 'health',
    label: 'Health gain per weekly exercise session',
    value: 1.15,
    min: 0,
    max: 5,
    step: 0.05,
    unit: 'pts',
    rationale:
      'Physical activity has one of the largest and best-replicated dose–response relationships with mortality and morbidity in all of epidemiology. Returns diminish sharply — the jump from zero to three sessions dwarfs the jump from six to nine.',
    caveat: 'Observational; the very inactive are disproportionately already ill, which inflates the apparent benefit of the first sessions.',
    confidence: 'high',
    sources: [{ label: 'Arem et al. (2015), JAMA Internal Medicine — Leisure time physical activity and mortality dose-response', kind: 'meta-analysis' }],
  },
  {
    id: 'health.sleepOptimum',
    group: 'health',
    label: 'Optimal nightly sleep',
    value: 7.5,
    min: 5,
    max: 10,
    step: 0.25,
    unit: 'h',
    rationale:
      'Health and cognitive outcomes follow a U-shape in sleep duration with a minimum penalty around here. The engine penalises deviation in both directions, more steeply for short sleep.',
    caveat: 'Long sleep is more likely a marker of existing illness than a cause of it, so the right-hand side of the U is probably over-penalised.',
    confidence: 'high',
    sources: [{ label: 'Hirshkowitz et al. (2015) — National Sleep Foundation duration recommendations', kind: 'meta-analysis' }],
  },
  {
    id: 'health.stressHealthCost',
    group: 'health',
    label: 'Health cost of sustained high stress',
    value: 0.9,
    min: 0,
    max: 4,
    step: 0.05,
    unit: 'pts/yr',
    rationale:
      'Points of health lost per year while stress sits in the top quartile. Chronic stress and long working hours show up in cardiovascular outcomes over years, not months.',
    confidence: 'medium',
    sources: [{ label: 'Kivimäki et al. (2015), Lancet — Long working hours and cardiovascular risk', kind: 'meta-analysis' }],
  },
  {
    id: 'health.socialConnectionBenefit',
    group: 'health',
    label: 'Health gain from strong social connection',
    value: 2.1,
    min: 0,
    max: 8,
    step: 0.1,
    unit: 'pts',
    rationale:
      'Social integration predicts survival with an effect size comparable to well-known risk factors like smoking. The engine routes part of the effect of moving city and of relationship changes through this channel.',
    confidence: 'high',
    sources: [{ label: 'Holt-Lunstad, Smith & Layton (2010), PLOS Medicine — Social relationships and mortality risk: a meta-analytic review', kind: 'meta-analysis' }],
  },
  {
    id: 'health.shockProbability40',
    group: 'health',
    label: 'Annual probability of a serious health event at 40',
    value: 0.011,
    min: 0,
    max: 0.1,
    step: 0.001,
    unit: '%',
    display: 100,
    rationale:
      'A health event significant enough to interrupt work. Scales steeply with age and with the health index, and is the main mechanism by which the model produces genuinely bad tails that have nothing to do with money.',
    confidence: 'medium',
    sources: [{ label: 'Health Survey for England; incidence of major cardiovascular and oncological events by age', kind: 'official-statistics' }],
  },

  // -------------------------------------------------------------------------
  // Relationships
  // -------------------------------------------------------------------------
  {
    id: 'relationship.formationRate',
    group: 'relationships',
    label: 'Annual probability of forming a partnership when single',
    value: 0.18,
    min: 0,
    max: 0.6,
    step: 0.01,
    unit: '%',
    display: 100,
    rationale:
      'Base hazard of entering a serious relationship in a given year while single, before adjusting for age, extraversion, hours worked and the social density of where you live.',
    confidence: 'low',
    sources: [{ label: 'ONS partnership formation statistics; Understanding Society panel', kind: 'official-statistics' }],
  },
  {
    id: 'relationship.dissolutionRate',
    group: 'relationships',
    label: 'Annual probability a partnership ends',
    value: 0.04,
    min: 0,
    max: 0.3,
    step: 0.005,
    unit: '%',
    display: 100,
    rationale:
      'Base hazard of separation, before adjusting for relationship quality, duration, stress and whether the household has just been through a major disruption such as a move or a startup.',
    caveat: 'Hazard is strongly front-loaded in the first few years and the engine applies a duration adjustment, so this flat rate is only the anchor.',
    confidence: 'medium',
    sources: [{ label: 'ONS divorce and separation statistics', kind: 'official-statistics' }],
  },
  {
    id: 'relationship.relocationStrain',
    group: 'relationships',
    label: 'Extra separation risk in the year after relocating',
    value: 0.05,
    min: 0,
    max: 0.3,
    step: 0.005,
    unit: '%',
    display: 100,
    rationale:
      'Moving city puts measurable strain on a partnership, especially when only one person’s career motivated it. The engine scales this by the partner’s stated mobility, so a willing partner mostly removes it.',
    confidence: 'low',
    sources: [{ label: 'Trailing-spouse and dual-career migration literature', kind: 'empirical' }],
  },
  {
    id: 'relationship.childWellbeingDip',
    group: 'relationships',
    label: 'Wellbeing dip in the years after a birth',
    value: 4.5,
    min: -10,
    max: 15,
    step: 0.5,
    unit: 'pts',
    rationale:
      'Measured life satisfaction typically rises around a birth then falls below baseline for a few years, driven mostly by sleep loss, cost and time pressure, before recovering.',
    caveat:
      'This is one of the places where measured wellbeing and stated meaning diverge most sharply: the same parents who report lower moment-to-moment happiness usually report higher sense of purpose. The engine reports both and never collapses them into one score.',
    confidence: 'medium',
    sources: [
      { label: 'Clark et al. (2008) — Lags and leads in life satisfaction', kind: 'empirical' },
      { label: 'Myrskylä & Margolis (2014) — Happiness before and after the kids', kind: 'empirical' },
    ],
  },
  {
    id: 'relationship.childAnnualCost',
    group: 'relationships',
    label: 'Annual cost per child',
    value: 7800,
    min: 0,
    max: 40000,
    step: 100,
    unit: '',
    rationale:
      'Direct spending per child per year, in the twin’s currency. Excludes the much larger indirect cost of reduced earnings, which the engine models separately as a career-trajectory effect.',
    confidence: 'medium',
    sources: [{ label: 'Child Poverty Action Group — Cost of a Child report series', kind: 'official-statistics' }],
  },

  // -------------------------------------------------------------------------
  // Geography
  // -------------------------------------------------------------------------
  {
    id: 'geography.moveCareerBoost',
    group: 'geography',
    label: 'Career capital boost from a high-opportunity city',
    value: 2.2,
    min: 0,
    max: 8,
    step: 0.1,
    unit: 'pts/yr',
    rationale:
      'Dense labour markets raise both the rate of good matches and the pace of learning. Agglomeration effects on wages are among the most robust findings in urban economics.',
    caveat:
      'Sorting is the perennial confound: ambitious, capable people move to expensive cities, so part of the observed premium is who moves rather than the move itself. The engine tries to net that out by scaling the boost with your existing career capital rather than granting it flat.',
    confidence: 'medium',
    sources: [
      { label: 'Glaeser & Maré (2001) — Cities and skills', kind: 'empirical' },
      { label: 'De la Roca & Puga (2017) — Learning by working in big cities', kind: 'empirical' },
    ],
  },
  {
    id: 'geography.moveAdjustmentYears',
    group: 'geography',
    label: 'Years to feel settled after moving',
    value: 2.4,
    min: 0.25,
    max: 8,
    step: 0.1,
    unit: 'yr',
    rationale:
      'How long the transition costs of a move — social disruption, admin, disorientation — take to fade. Until then the engine applies a wellbeing drag that decays over this period.',
    confidence: 'low',
    sources: [{ label: 'Modelling choice; informed by migration and life-satisfaction panel studies', kind: 'estimate' }],
  },

  // -------------------------------------------------------------------------
  // Model mechanics
  // -------------------------------------------------------------------------
  {
    id: 'model.runs',
    group: 'model',
    label: 'Simulations per branch',
    value: 10000,
    min: 500,
    max: 50000,
    step: 500,
    unit: '',
    rationale:
      'How many independent futures to run for each option. More runs narrow the Monte Carlo error on every reported statistic — the standard error of a mean falls with the square root of this number.',
    caveat: 'More runs buy precision about the model, never accuracy about the world. Ten million runs of a wrong model is still a wrong answer, delivered confidently.',
    confidence: 'high',
    sources: [{ label: 'Standard Monte Carlo error analysis', kind: 'convention' }],
  },
  {
    id: 'model.horizonYears',
    group: 'model',
    label: 'Simulation horizon',
    value: 15,
    min: 1,
    max: 50,
    step: 1,
    unit: 'yr',
    rationale:
      'How far forward to simulate. Uncertainty compounds, so the spread of outcomes at 30 years is enormous — long horizons are useful for seeing the shape of a decision, not for reading off a number.',
    confidence: 'high',
    sources: [{ label: 'Structural parameter', kind: 'convention' }],
  },
  {
    id: 'model.economyPersistence',
    group: 'model',
    label: 'Economic cycle persistence',
    value: 0.62,
    min: 0,
    max: 0.95,
    step: 0.01,
    unit: 'ρ',
    rationale:
      'Year-to-year autocorrelation of the simulated macroeconomic state. Recessions cluster: a bad year makes the next year more likely to be bad, which is what makes "quit into a downturn" meaningfully different from "quit at random".',
    confidence: 'medium',
    sources: [{ label: 'Autoregressive business-cycle modelling convention', kind: 'convention' }],
  },
  {
    id: 'model.luckWeight',
    group: 'model',
    label: 'Weight on luck versus attributes',
    value: 0.55,
    min: 0,
    max: 1,
    step: 0.01,
    unit: '×',
    rationale:
      'How much of the variance in outcomes comes from chance rather than from anything about you. Set high on purpose. Simulations that make outcomes follow neatly from traits produce a comforting, false picture in which people deserve what happens to them.',
    caveat:
      'This is the most consequential and least measurable number in the entire model. Turn it down and the app will flatter you; turn it up and it will tell you almost nothing is in your control. Both are wrong, and where the truth sits is genuinely unknown.',
    confidence: 'low',
    sources: [
      { label: 'Pluchino, Biondo & Rapisarda (2018) — Talent versus luck: the role of randomness in success and failure', kind: 'empirical' },
      { label: 'Frank (2016) — Success and Luck', kind: 'empirical' },
    ],
  },
] as const satisfies readonly Assumption[]);

export type AssumptionId = (typeof ASSUMPTION_LIST)[number]['id'];

export const ASSUMPTIONS: Record<AssumptionId, Assumption> = Object.fromEntries(
  ASSUMPTION_LIST.map((a) => [a.id, a]),
) as Record<AssumptionId, Assumption>;

/** Resolved parameter set handed to the engine. */
export type AssumptionValues = Record<AssumptionId, number>;

export function defaultAssumptions(): AssumptionValues {
  return Object.fromEntries(ASSUMPTION_LIST.map((a) => [a.id, a.value])) as AssumptionValues;
}

/** Merge user overrides over the defaults, dropping anything unrecognised. */
export function withOverrides(overrides: Partial<AssumptionValues>): AssumptionValues {
  const base = defaultAssumptions();
  for (const [key, value] of Object.entries(overrides)) {
    if (key in base && typeof value === 'number' && Number.isFinite(value)) {
      const spec = ASSUMPTIONS[key as AssumptionId];
      base[key as AssumptionId] = Math.min(spec.max, Math.max(spec.min, value));
    }
  }
  return base;
}

export const ASSUMPTION_GROUPS: { id: AssumptionGroup; label: string; blurb: string }[] = [
  { id: 'wellbeing', label: 'Wellbeing', blurb: 'How circumstances turn into how you actually feel.' },
  { id: 'income', label: 'Income', blurb: 'What makes earnings rise, stall or fall.' },
  { id: 'career', label: 'Career', blurb: 'Skill, reputation, opportunity and risk of losing the job.' },
  { id: 'wealth', label: 'Wealth', blurb: 'Returns, volatility, spending and what money buys you.' },
  { id: 'entrepreneurship', label: 'Founding', blurb: 'The power law that governs starting something.' },
  { id: 'health', label: 'Health', blurb: 'The slow variable that quietly dominates the long run.' },
  { id: 'relationships', label: 'Relationships', blurb: 'Formation, strain, children, and their real costs.' },
  { id: 'geography', label: 'Place', blurb: 'What a city does to a career and to a life.' },
  { id: 'model', label: 'Model', blurb: 'How the simulation itself is set up. Including how much is luck.' },
];

export function assumptionsByGroup(group: AssumptionGroup): Assumption[] {
  return ASSUMPTION_LIST.filter((a) => a.group === group) as unknown as Assumption[];
}

/** Format an assumption's value the way it should appear in the UI. */
export function formatAssumption(spec: Assumption, value: number): string {
  const scaled = value * (spec.display ?? 1);
  const decimals = spec.step >= 1 ? 0 : spec.step >= 0.1 ? 1 : spec.display === 100 ? 1 : 2;
  const num = scaled.toLocaleString('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return spec.unit ? `${num}${spec.unit === '%' || spec.unit === '×' || spec.unit === 'α' || spec.unit === 'ρ' ? spec.unit : ' ' + spec.unit}` : num;
}
