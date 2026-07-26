<div align="center">

# Crossroad

**Monte Carlo simulation for life decisions.**

Not *what should I do?* — but *what futures become more likely if I choose X?*

[**Live app**](https://rayhankhilji.github.io/crossroad/) · [How the model works](#how-the-model-works) · [What this cannot do](#what-this-cannot-do)

</div>

---

Most tools that claim to help with a big decision give you an opinion. Crossroad
gives you a distribution.

You build a detailed model of yourself — finances, personality, health, network,
habits, what you actually value — and then ask a question. *Should I quit and
start a company? Move to San Francisco? Go back and study? Have a child now or in
five years?* Every option is simulated ten thousand times, and what comes back is
the shape of the futures each choice opens and the shape of the ones it closes.

Then you take the answer apart. Every headline number decomposes into the
mechanisms that produced it, and every mechanism sits on a named assumption with
a rationale, a confidence rating, an honest note about what is wrong with it, a
source, and a slider. Disagree with a number, drag it, and watch the answer move.

**Nothing leaves your browser.** There is no server, no account, no telemetry.
The twin lives in local storage and the simulation runs in a Web Worker on your
own machine.

---

## Contents

- [What makes it different](#what-makes-it-different)
- [How the model works](#how-the-model-works)
- [Common random numbers](#common-random-numbers-the-part-that-makes-the-comparison-honest)
- [Attribution](#attribution-every-number-links-to-why)
- [The decision library](#the-decision-library)
- [Importing data](#importing-data)
- [What this cannot do](#what-this-cannot-do)
- [Running it](#running-it)
- [Project structure](#project-structure)
- [Calibration](#calibration)
- [Licence](#licence)

---

## What makes it different

### It never gives you a number without the spread around it

A single projected figure invites you to read your future off it. Every result
here is a distribution: median beside mean, the middle half beside the middle
eight-tenths, and the tails reported rather than trimmed away.

This matters most exactly where people care most. Simulate founding a company and
the *average* outcome is excellent while the *typical* one is not — venture
returns follow a power law, so the mean is carried by a handful of enormous
results almost nobody gets. Crossroad shows both side by side and says so
explicitly when the mean is being dragged by outliers:

> The average is 11× the typical case. A handful of enormous outcomes are
> carrying it — read the median.

### It leads with the question you are actually asking

The headline is not "expected value +£4.1m". It is:

> **55%** of identical worlds left you financially better off

Because the branches share random streams, that is a genuinely paired comparison
— the fraction of futures in which this choice, and not luck, left you ahead.

### It is arguable

Fifty-one model parameters live in an open registry — 14 rated high confidence,
27 medium, 10 low. Every one has a plain-English rationale, a caveat saying what
is wrong with it, at least one source, and a slider. There is a filter to show
only the low-confidence ones, because those are where the model is most likely to
be wrong and they deserve the most scrutiny.

### Luck is loud

The default settings make chance responsible for most of the variance in
outcomes. A simulator in which your traits neatly determine your future would be
more flattering and much less true. `model.luckWeight` is exposed like everything
else — and it is labelled as the most consequential and least measurable number
in the entire model.

---

## How the model works

A **digital twin** is the portrait: identity, career, finances, education, Big
Five personality, cognitive estimate, risk tolerance, values, relationship,
health, network, habits and skills. It is never mutated by a simulation.

A **simulation** spins up N copies of that twin as particles and marches each one
forward year by year through coupled stochastic processes:

| Process | What happens each year |
|---|---|
| **Macroeconomy** | An AR(1) latent state. Recessions cluster, so "quit into a downturn" differs from "quit at random". |
| **Markets** | Real returns correlated with the economy, plus an explicit crash process for the fat left tail a log-normal misses. |
| **Income** | Concave age–earnings profile, trait and career-capital returns, cyclical term, log-normal idiosyncratic shock. |
| **Employment** | Layoff hazard scaled by employer stage, seniority and the cycle. Re-employment hazard driven by capital and network, with wage scarring. |
| **Opportunity** | Poisson arrivals through weak ties; whether you take one depends on ambition and how bad things currently are. |
| **Career capital** | Deliberate practice against skill obsolescence, at a rate set by how fast your field turns over. |
| **Health** | Gompertz-like age decline, habit flows, chronic-stress cost, social connection, discrete health shocks, and mortality. |
| **Relationships** | Formation and separation hazards, quality reverting to a couple-specific set point, childbirth, asset splits on separation. |
| **Wealth** | Progressive tax, lifestyle inflation applied to *raises* rather than to the income gap, investment returns, debt servicing. |
| **Wellbeing** | A dispositional set point plus circumstance, with transient shocks decaying at the adaptation half-life. |

### Wellbeing is modelled carefully, because it is easy to model badly

Wellbeing is a set point — mostly low neuroticism and high extraversion — plus
circumstantial terms: log income, relationship quality, health, chronic stress,
commute, and involuntary unemployment.

Transient shocks decay toward the set point at a configurable half-life, which is
the hedonic treadmill. But adaptation is **not** applied uniformly, because the
panel evidence says it is not uniform: people largely return to baseline after
marriage, and do *not* fully adapt to involuntary unemployment or to health
decline. Those are modelled as persistent.

The engine also refuses to collapse measured happiness and stated meaning into
one score. Having a child produces a measured wellbeing dip for several years
*and* a persistent purpose gain, and both are reported, because on the axis most
parents actually care about the dip is not the story.

### Selected sources

The full registry with rationales and caveats is in
[`src/engine/assumptions.ts`](src/engine/assumptions.ts) and browsable in the app.

- Killingsworth (2021); Kahneman & Deaton (2010); Killingsworth, Kahneman & Mellers (2023) — income and wellbeing
- Lucas, Clark, Georgellis & Diener (2003, 2004) — adaptation and its exceptions
- Clark et al. (2008), *Economic Journal* — lags and leads in life satisfaction
- Dimson, Marsh & Staunton — long-run global real equity returns
- Barrick & Mount (1991); Sackett et al. (2022) — personality, cognitive ability and job performance
- Psacharopoulos & Patrinos (2018); Card (1999) — returns to education
- Holt-Lunstad, Smith & Layton (2010), *PLOS Medicine* — social relationships and mortality
- Arem et al. (2015), *JAMA Internal Medicine* — physical activity dose–response
- Kivimäki et al. (2015), *Lancet* — long working hours and cardiovascular risk
- Granovetter (1973); Rajkumar et al. (2022), *Science* — the strength of weak ties
- Glaeser & Maré (2001); De la Roca & Puga (2017) — agglomeration and learning in cities
- Stutzer & Frey (2008) — the commuting paradox

Where the evidence is contested, the registry says so. The entry behind the
wellbeing set point notes that the popular "50/10/40 happiness pie chart" is not
well supported and that its own authors have walked it back. The entry for
cognitive ability notes that the widely quoted 0.51 validity has been
substantially revised downward. The entry for deliberate practice notes that
meta-analysis puts its contribution far below the popular 10,000-hours story.

---

## Common random numbers: the part that makes the comparison honest

This is the single most important implementation detail.

Each simulated life draws from **nine independent random streams** — economy,
markets, income, career, health, relationships, venture, traits, and a general
one — all derived deterministically from one run seed. Run #4,217 of the *stay*
branch and run #4,217 of the *quit* branch therefore see the **same** economic
conditions, the **same** market returns and the **same** health draws. What
differs between them is the decision and nothing else.

If a single generator fed the whole simulation, the branches would fall out of
step immediately, because quitting consumes a different number of draws. From
that point on they would live in different worlds, and the difference between
them would be mostly sampling noise.

The effect is large, and the test suite asserts it rather than trusting it:

```
paired standard error  <  unpaired standard error ÷ 4
```

In practice it is close to an order of magnitude, which is the difference between
being able to report a small effect and not.

Everything is reproducible: same twin, same question, same seed, same ten
thousand futures. The seed is displayed on every result.

---

## Attribution: every number links to why

Given a headline difference, Crossroad decomposes it by the most direct method
available — switch one mechanism off, re-run the entire simulation, and see how
much of the difference disappears.

Moving from London to the Bay Area does not just produce a number. For the
example twin, over fifteen years, on net worth:

| Mechanism | Contribution |
|---|---|
| Salary re-index to the destination market | **+£595k** |
| Cost of living re-index | **−£453k** |
| Social network reset | −£149k |
| Opportunity density in a denser labour market | +£75k |
| Strain on the partnership | −£62k |
| Cost of moving | −£9k |
| *Interaction between the above* | *+£175k* |
| **Total** | **+£171k** |

Each row expands into the reasoning behind that mechanism, the assumptions it
rests on with their confidence ratings and sources, and a 95% interval — so a bar
that is really just Monte Carlo noise looks like noise.

This is a **leave-one-out** decomposition, and it is worth being precise about
what that does and does not give you:

- It measures each channel's marginal contribution *given that all the others are
  present*. That is the right question for "where did this number come from?".
- The contributions do **not** sum to the total, because the channels interact —
  a salary uplift and a higher cost base compound together. The gap is reported
  openly as an interaction term rather than smeared across the channels to make
  the arithmetic look tidy. A large interaction term is informative, not
  embarrassing: it means the decision has to be judged whole.
- A full Shapley decomposition would allocate interactions fairly but costs 2ⁿ
  simulations. Leave-one-out costs n+1.

There is also a **sensitivity** pass that perturbs individual assumptions within
their plausible ranges and flags results that flip sign — a result that inverts
when a low-confidence parameter is nudged should be presented as a coin toss, and
this is how the app knows to say so.

---

## The decision library

Ten decisions, each built from documented channels rather than a single fudge
factor:

| Question | Notable mechanisms |
|---|---|
| Quit and start a company | Power-law exit distribution, founder pay cut, accelerated career capital, hours and strain, runway |
| Move somewhere else | Salary re-index, cost re-index, agglomeration, social reset, partner strain, commute |
| Change jobs | The rise itself, tenure reset, employer risk profile, new network surface |
| Go back and study | Forgone earnings, tuition, Mincerian return as a *level* effect, credential, switching penalty |
| Switch field | Capital written down, the new field's slope, retraining gap, new risk profile, fit |
| Go independent | Rate uplift × utilisation, doubled income variance, autonomy, lost pension, client network |
| Go all in at work | Diminishing output returns, hours→stress, what gets crowded out, visibility |
| Take a long break | Income stops, spending while away, skill decay, recovery, re-entry |
| Have a child now or wait | Direct cost, career pause, the measured dip, purpose |
| Buy or keep renting | Rent replaced, interest, forced saving via principal, maintenance, immobility, security |

Every branch is simulated, including "carry on as you are" — staying is a choice
with its own trajectory, not the absence of one. There is no recommended branch
and the app never picks one, because which future you want is not something a
simulation can tell you.

Outcomes are sorted into named archetypes — *quiet compounding*, *rich and well*,
*well paid and worn down*, *knocked off course*, *health intervened*, *ran out of
road* — and drawn as a Sankey tree where ribbon width is genuine probability
mass. A 5% breakout is a thread; a 40% setback is a rope.

---

## Importing data

Crossroad has no server, and OAuth requires one — a client secret, a redirect
endpoint, a token exchange. So there is **no "connect your bank" button**, because
building one would mean sending your financial data somewhere, which is the exact
thing this app promises not to do.

What works instead is the export file. Every service worth importing from is
legally obliged to let you download your own data, and those files parse
perfectly well in a browser tab.

| Source | Status | What it fills in |
|---|---|---|
| **GitHub** | Live public API, no auth | Skills and market values from repository languages, practice hours from recent activity, network reach |
| **Apple Health** | `export.xml` | Mean sleep duration, workout frequency |
| **Bank statement** | `.csv` | Annual living costs, inferred from outgoings |
| **Calendar** | `.ics` | Meeting load → estimated weekly hours |
| **LinkedIn** | `Positions.csv` | Years of experience, current title, inferred seniority |
| **Screen Time** | Not possible | Apple provides no export at all — enter it by hand |
| **Spotify** | Deliberately not built | The evidence linking listening history to wellbeing is thin enough that importing it would add noise dressed as insight |

Every import shows exactly what it will change *before* it is applied, writes an
entry to an audit trail, and leaves every value editable afterwards. An import is
a starting point, not an authority.

---

## What this cannot do

Read this part before trusting anything the app says.

**It cannot predict your life.** It applies population-average relationships to a
simplified person who shares some of your numbers. The distance between that and
a forecast is enormous.

**Several parameters are educated guesses.** Ten are rated low confidence and
there is a filter to show only them. `model.luckWeight` — how much of outcomes is
chance — is the most consequential and least measurable number in the whole
thing.

**Population averages may not transfer to you.** Even the high-confidence
findings are averages across large groups. Some have effect sizes that are real
but modest, and several are correlational with obvious reverse-causation
problems, which the caveats say explicitly.

**It knows nothing about the thing that will actually decide this.** Your
particular company, your particular relationship, the thing you have not told it.

**More simulations buy precision about the model, never accuracy about the
world.** Ten million runs of a wrong model is still a wrong answer, delivered
confidently.

**It is not financial, medical, career or psychological advice**, and the
personality instrument is a rough twenty-item self-report, not a validated
clinical measure.

What it *is* good for: seeing the **shape** of a decision. Which mechanisms
dominate. How much is under your control and how much is weather. Where the tails
are, before you walk into one.

---

## Running it

Requires Node 20+.

```bash
git clone https://github.com/rayhankhilji/crossroad.git
cd crossroad
npm install
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on `localhost:5173` |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Engine test suite |
| `npm run typecheck` | TypeScript, no emit |
| `npm run calibrate` | Run every decision against the example twin and print the headline numbers |

`npm run calibrate` accepts `RUNS` and `HORIZON` environment variables.

The app works fully offline after first load — fonts are self-hosted and there
are no runtime network calls except the optional GitHub import.

---

## Project structure

```
src/
  engine/            Pure TypeScript. No React, no DOM, fully testable.
    rng.ts           xoshiro128** + distributions. Seeded and reproducible.
    types.ts         Digital twin and simulation state vocabulary.
    assumptions.ts   The registry: 51 parameters, each with sources and caveats.
    dynamics.ts      The model. One simulated year → the next.
    decisions.ts     Ten decisions as documented, ablatable channels.
    monteCarlo.ts    The runner. Common random numbers, paired statistics.
    attribution.ts   Leave-one-out decomposition and sensitivity analysis.
    archetypes.ts    Sorting outcomes into recognisable futures.
    utility.ts       Expected utility against the user's own value weights.
    stats.ts         Summaries, bands, histograms, paired comparisons.
    bigfive.ts       Twenty-item instrument and scoring.
    importers.ts     Export-file parsers and the GitHub API client.
    locations.ts     Place profiles: salary, cost, opportunity, social density.
    twin.ts          Twin construction and the worked example.
  worker/            Simulation off the main thread, streaming progress.
  state/             Zustand store, persisted to localStorage only.
  ui/
    charts/          Five custom visualisations. No charting library.
    screens/         Landing, onboarding, twin, imports, ask, results, assumptions.
```

### Notes on the visualisations

There is no charting library. Everything the app draws is a distribution over
time, a decomposition, or a tree — all three want custom marks, and a
general-purpose library would be fought at every step for a worse result.

The categorical palette is **validated, not chosen by eye**: run through a
colour-vision-deficiency checker that verifies perceptual separation in OKLab for
protanopia, deuteranopia and tritanopia, plus a normal-vision floor and contrast
against the actual chart surface. The baseline branch is always orange and
alternatives take blue then aqua — specifically the three slots that clear the
*all-pairs* gates rather than only the adjacent-pair ones, because branches
genuinely can all touch.

Every figure ships a hover layer and a table view, so identity is never carried
by colour alone. Net worth uses a signed-log scale, because a distribution
spanning "in debt" to "generational wealth" renders as an unreadable smear on a
linear axis.

---

## Calibration

`npm run calibrate` runs every decision against the example twin and prints the
headline numbers so a human can look at them and ask whether they are plausible.
Automated tests check internal consistency; this checks whether the model is
saying anything sane about the world, which no assertion can do for you.

It has already earned its place. The first calibration run exposed four real bugs
that all typechecked and passed tests:

- lifestyle inflation was compounding against the income *gap* rather than the
  income *rise*, which drove savings rates to zero for everybody within five
  years;
- fractional mode durations never expired, so a six-month retraining stint ran
  forever and collapsed income geometrically;
- a degree was silently thrown away by any later re-pricing against the market,
  because the education uplift was applied to the current salary rather than to
  market value;
- temporary choices leaked permanently — a nine-month sabbatical was paying out
  its health and stress benefits for the full fifteen-year horizon, which made it
  look like the best decision available to anyone.

The test suite covers determinism, distribution properties, the attribution
identity, tax progressivity, transient-modifier expiry, and directional sanity —
but deliberately does **not** assert magnitudes. Pinning "moving to San Francisco
is worth £171,000" into a test would be asserting that the model is *right*,
which no test can establish, and would make every legitimate recalibration look
like a regression.

---

## Licence

MIT. See [LICENSE](LICENSE).

The model is a set of opinions about how life works, assembled from published
research and a lot of judgement calls. Disagree with it — that is what the
sliders are for.
