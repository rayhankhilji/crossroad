/**
 * Importers.
 *
 * A note on what this is and is not, because the honest version matters more
 * than the impressive-sounding one.
 *
 * Crossroad has no server. That is the central privacy commitment, and it has
 * a direct consequence: there is no OAuth. OAuth requires a client secret held
 * somewhere the user cannot see, a redirect endpoint, and a token exchange —
 * all of which need a backend. So there is no "Connect your bank" button here,
 * because the only way to build one would be to start sending your financial
 * data to a server, which is the exact thing this app promises not to do.
 *
 * What works instead is the export file. Every service worth importing from is
 * legally obliged to let you download your own data, and those exports parse
 * perfectly well in a browser tab. The file is read with the File API, parsed
 * in memory, reduced to a handful of numbers, and thrown away. Nothing is
 * uploaded because there is nowhere to upload it to.
 *
 * The one live integration is GitHub, and only because its public API needs no
 * authentication at all for public profile data.
 *
 * Everything below either does what it says or is clearly marked as
 * unavailable, with the reason. There are no decorative connectors.
 */

import type { DigitalTwin, ImportRecord, ImportSourceId, Skill } from './types';

export interface ImportOutcome {
  record: ImportRecord;
  /** Applied to a copy of the twin. */
  apply: (twin: DigitalTwin) => void;
  /** Human-readable list of what changed, shown before it is committed. */
  changes: string[];
}

export type ImportAvailability =
  | { kind: 'file'; accept: string; instructions: string }
  | { kind: 'live'; instructions: string }
  | { kind: 'unavailable'; reason: string };

export interface ImporterSpec {
  id: ImportSourceId;
  label: string;
  /** What the model actually does with it. */
  purpose: string;
  availability: ImportAvailability;
}

export const IMPORTERS: ImporterSpec[] = [
  {
    id: 'github',
    label: 'GitHub',
    purpose:
      'Public repository and contribution activity becomes a proxy for deliberate practice hours, and repository languages become skill entries with market-value estimates.',
    availability: {
      kind: 'live',
      instructions:
        'Enter a username. This calls the public GitHub API directly from your browser and needs no login, because everything it reads is already public. Private activity is not visible and is not requested.',
    },
  },
  {
    id: 'apple-health',
    label: 'Apple Health',
    purpose:
      'Sleep duration and workout frequency, which feed two of the best-evidenced relationships in the entire model — the exercise and sleep terms in the health process.',
    availability: {
      kind: 'file',
      accept: '.xml',
      instructions:
        'On iPhone: Health → your profile picture → Export All Health Data. That produces a zip; unzip it and choose export.xml. The file is often large, so parsing takes a moment. It is read in this tab and never uploaded.',
    },
  },
  {
    id: 'bank-csv',
    label: 'Bank statement',
    purpose:
      'Total outgoings become your annual living costs, which is the single most consequential number in the whole simulation — it sets your runway, and runway determines whether a bad year is survivable.',
    availability: {
      kind: 'file',
      accept: '.csv',
      instructions:
        'Export a CSV of the last twelve months from your bank. Most formats work: the parser looks for a date column and an amount column, and handles both signed amounts and separate debit/credit columns. Nothing leaves this tab — there is no server to send it to, which is also why there is no "connect your bank" button.',
    },
  },
  {
    id: 'google-calendar',
    label: 'Calendar',
    purpose:
      'Meeting load and the spread of events across the week become a measured estimate of hours worked, which drives the stress process and therefore health.',
    availability: {
      kind: 'file',
      accept: '.ics',
      instructions:
        'Google Calendar → Settings → Import & export → Export. Unzip and pick a .ics file. Only start times, end times and busy/free status are read; titles, descriptions, locations and attendees are ignored entirely.',
    },
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    purpose: 'Position history becomes years of experience, seniority and the number of employer changes.',
    availability: {
      kind: 'file',
      accept: '.csv',
      instructions:
        'LinkedIn → Settings → Data privacy → Get a copy of your data. Unzip and choose Positions.csv.',
    },
  },
  {
    id: 'screen-time',
    label: 'Screen Time',
    purpose: 'Would fill in discretionary screen hours.',
    availability: {
      kind: 'unavailable',
      reason:
        'Apple provides no export for Screen Time — not a file, not an API. The data exists only inside Settings. Enter the daily average by hand on the Habits chapter instead.',
    },
  },
  {
    id: 'spotify',
    label: 'Spotify',
    purpose: 'Listening history is sometimes proposed as a mood proxy.',
    availability: {
      kind: 'unavailable',
      reason:
        'Deliberately not built. The evidence linking listening history to wellbeing is thin enough that importing it would add noise dressed as insight, and the model would be worse for it. The wellbeing questions during onboarding are more informative and much more honest.',
    },
  },
];

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

interface GitHubRepo {
  name: string;
  language: string | null;
  stargazers_count: number;
  fork: boolean;
  pushed_at: string;
  size: number;
}

/** Rough market-value estimates by language, 0–100. Coarse and editable. */
const LANGUAGE_VALUE: Record<string, number> = {
  TypeScript: 85,
  JavaScript: 74,
  Python: 86,
  Rust: 82,
  Go: 84,
  Java: 78,
  'C++': 76,
  C: 70,
  'C#': 74,
  Swift: 72,
  Kotlin: 74,
  Ruby: 64,
  PHP: 58,
  Scala: 72,
  Elixir: 66,
  Haskell: 58,
  R: 62,
  Julia: 58,
  Shell: 55,
  HTML: 40,
  CSS: 45,
};

export async function importGitHub(username: string): Promise<ImportOutcome> {
  const clean = username.trim().replace(/^@/, '');
  if (!clean) throw new Error('Enter a GitHub username.');

  const [userResponse, reposResponse] = await Promise.all([
    fetch(`https://api.github.com/users/${encodeURIComponent(clean)}`),
    fetch(`https://api.github.com/users/${encodeURIComponent(clean)}/repos?per_page=100&sort=pushed`),
  ]);

  if (userResponse.status === 404) throw new Error(`No GitHub user called "${clean}".`);
  if (userResponse.status === 403) {
    throw new Error('GitHub rate-limited this browser. Unauthenticated requests are capped per hour — try again later.');
  }
  if (!userResponse.ok) throw new Error(`GitHub returned ${userResponse.status}.`);

  const user = (await userResponse.json()) as { public_repos: number; followers: number; created_at: string; name?: string };
  const repos = (reposResponse.ok ? await reposResponse.json() : []) as GitHubRepo[];

  const own = repos.filter((r) => !r.fork);
  const yearsOnPlatform = (Date.now() - new Date(user.created_at).getTime()) / (365.25 * 24 * 3600 * 1000);

  const recentlyActive = own.filter(
    (r) => Date.now() - new Date(r.pushed_at).getTime() < 365 * 24 * 3600 * 1000,
  );

  // Language frequency, weighted by repository size so a one-file experiment
  // does not count the same as a long-running project.
  const languageWeight = new Map<string, number>();
  for (const repo of own) {
    if (!repo.language) continue;
    languageWeight.set(repo.language, (languageWeight.get(repo.language) ?? 0) + Math.log1p(repo.size));
  }
  const topLanguages = [...languageWeight.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxWeight = topLanguages[0]?.[1] ?? 1;

  const skills: Skill[] = topLanguages.map(([language, weight], i) => ({
    id: `gh-${language.toLowerCase()}`,
    label: language,
    // Proficiency is inferred from relative volume and platform tenure. This is
    // a weak proxy and is shown as one — volume of code is not skill.
    level: Math.round(Math.min(90, 35 + (weight / maxWeight) * 35 + Math.min(20, yearsOnPlatform * 2.5))),
    marketValue: LANGUAGE_VALUE[language] ?? 60,
    practiceHours: i === 0 ? 8 : 2,
  }));

  // Recent public activity as a practice proxy, capped hard. Someone with
  // forty active repos is not doing forty hours a week of deliberate practice.
  const practiceHours = Math.min(14, Math.round(recentlyActive.length * 0.8));
  const reach = Math.min(90, 35 + Math.log1p(user.followers) * 8);

  const changes = [
    `${skills.length} skill${skills.length === 1 ? '' : 's'} from your most-used languages`,
    `deliberate practice set to ${practiceHours}h/week from ${recentlyActive.length} recently active repositories`,
    `network reach nudged to ${Math.round(reach)} from ${user.followers} followers`,
  ];

  return {
    changes,
    record: {
      id: `github-${Date.now()}`,
      source: 'github',
      importedAt: new Date().toISOString(),
      summary: `${clean}: ${own.length} public repos, ${recentlyActive.length} active this year, ${user.followers} followers`,
      fieldsTouched: ['skills', 'habits.deliberatePractice', 'network.reach'],
      signals: {
        publicRepos: own.length,
        recentlyActive: recentlyActive.length,
        followers: user.followers,
        yearsOnPlatform: Math.round(yearsOnPlatform * 10) / 10,
      },
    },
    apply: (twin) => {
      const existing = twin.skills.filter((s) => !s.id.startsWith('gh-'));
      twin.skills = [...existing, ...skills];
      twin.habits.deliberatePractice = practiceHours;
      twin.network.reach = Math.round(reach);
    },
  };
}

// ---------------------------------------------------------------------------
// Apple Health
// ---------------------------------------------------------------------------

/**
 * Apple's export.xml is frequently hundreds of megabytes, so this scans the
 * text for the two record types it needs rather than building a DOM. A full
 * XML parse of that file will lock or crash a browser tab.
 */
export async function importAppleHealth(file: File): Promise<ImportOutcome> {
  const text = await file.text();

  // Sleep: SleepAnalysis records with an "Asleep" value.
  const sleepPattern =
    /<Record[^>]*type="HKCategoryTypeIdentifierSleepAnalysis"[^>]*value="[^"]*Asleep[^"]*"[^>]*startDate="([^"]+)"[^>]*endDate="([^"]+)"/g;
  const nightly = new Map<string, number>();
  let match: RegExpExecArray | null;
  while ((match = sleepPattern.exec(text)) !== null) {
    const start = new Date(match[1]);
    const end = new Date(match[2]);
    const hours = (end.getTime() - start.getTime()) / 3_600_000;
    if (hours <= 0 || hours > 16) continue;
    // Attribute to the night it started, so a 23:30–07:00 sleep is one night.
    const key = start.toISOString().slice(0, 10);
    nightly.set(key, (nightly.get(key) ?? 0) + hours);
  }

  const nights = [...nightly.values()].filter((h) => h >= 2 && h <= 14);
  const meanSleep = nights.length ? nights.reduce((a, b) => a + b, 0) / nights.length : null;

  // Workouts in the last year.
  const workoutPattern = /<Workout[^>]*startDate="([^"]+)"/g;
  const cutoff = Date.now() - 365 * 24 * 3600 * 1000;
  let workouts = 0;
  let earliest = Infinity;
  while ((match = workoutPattern.exec(text)) !== null) {
    const start = new Date(match[1]).getTime();
    if (start >= cutoff) workouts++;
    if (start < earliest) earliest = start;
  }
  const weeksCovered = Math.max(1, Math.min(52, (Date.now() - Math.max(earliest, cutoff)) / (7 * 24 * 3600 * 1000)));
  const sessionsPerWeek = Math.round((workouts / weeksCovered) * 10) / 10;

  if (meanSleep === null && workouts === 0) {
    throw new Error(
      'No sleep or workout records found. Make sure this is export.xml from the Health app rather than export_cda.xml.',
    );
  }

  const changes: string[] = [];
  if (meanSleep !== null) changes.push(`sleep set to ${meanSleep.toFixed(1)}h from ${nights.length} nights`);
  if (workouts > 0) changes.push(`exercise set to ${sessionsPerWeek}/week from ${workouts} workouts in the last year`);

  return {
    changes,
    record: {
      id: `health-${Date.now()}`,
      source: 'apple-health',
      importedAt: new Date().toISOString(),
      summary: `${nights.length} nights of sleep, ${workouts} workouts in the last year`,
      fieldsTouched: ['health.sleepHours', 'health.exerciseSessions'],
      signals: {
        nights: nights.length,
        meanSleepHours: meanSleep ? Math.round(meanSleep * 100) / 100 : 'not found',
        workoutsLastYear: workouts,
      },
    },
    apply: (twin) => {
      if (meanSleep !== null) twin.health.sleepHours = Math.round(meanSleep * 4) / 4;
      if (workouts > 0) twin.health.exerciseSessions = Math.max(0, Math.round(sessionsPerWeek));
    },
  };
}

// ---------------------------------------------------------------------------
// Bank CSV
// ---------------------------------------------------------------------------

/** Split a CSV line, respecting quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      out.push(current);
      current = '';
    } else current += char;
  }
  out.push(current);
  return out;
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[£$€,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (!cleaned || cleaned === '-') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

export async function importBankCsv(file: File): Promise<ImportOutcome> {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error('That file has no rows in it.');

  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());

  const findColumn = (...candidates: string[]) =>
    header.findIndex((h) => candidates.some((c) => h.includes(c)));

  const dateIndex = findColumn('date', 'transaction date', 'posted');
  const amountIndex = findColumn('amount', 'value');
  const debitIndex = findColumn('debit', 'money out', 'paid out', 'withdrawal');
  const creditIndex = findColumn('credit', 'money in', 'paid in', 'deposit');

  if (dateIndex === -1 || (amountIndex === -1 && debitIndex === -1)) {
    throw new Error(
      `Could not find the columns needed. Looked for a date column and either an amount column or a debit column. Found: ${header.join(', ')}`,
    );
  }

  let outgoings = 0;
  let incomings = 0;
  let rows = 0;
  let earliest = Infinity;
  let latest = -Infinity;

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    if (cells.length <= dateIndex) continue;

    const date = new Date(cells[dateIndex].trim());
    if (Number.isNaN(date.getTime())) continue;
    earliest = Math.min(earliest, date.getTime());
    latest = Math.max(latest, date.getTime());
    rows++;

    if (debitIndex !== -1) {
      const debit = parseAmount(cells[debitIndex] ?? '');
      const credit = creditIndex !== -1 ? parseAmount(cells[creditIndex] ?? '') : null;
      if (debit) outgoings += Math.abs(debit);
      if (credit) incomings += Math.abs(credit);
    } else {
      const amount = parseAmount(cells[amountIndex] ?? '');
      if (amount === null) continue;
      if (amount < 0) outgoings += -amount;
      else incomings += amount;
    }
  }

  if (rows === 0) throw new Error('No rows with a readable date were found.');

  const days = Math.max(1, (latest - earliest) / 86_400_000);
  // Extrapolating a year from a short window is unreliable, so the UI is told
  // how much data this came from and the number is presented as an estimate.
  const annualSpend = Math.round((outgoings / days) * 365);
  const annualIncome = Math.round((incomings / days) * 365);

  return {
    changes: [
      `annual living costs estimated at ${Math.round(annualSpend).toLocaleString('en-GB')} from ${rows} transactions over ${Math.round(days)} days`,
      days < 150
        ? 'that window is under five months, so the annual figure is a rough extrapolation — worth sanity-checking by hand'
        : 'the window is long enough for a reasonable annual estimate',
    ],
    record: {
      id: `bank-${Date.now()}`,
      source: 'bank-csv',
      importedAt: new Date().toISOString(),
      summary: `${rows} transactions over ${Math.round(days)} days · ${Math.round(annualSpend).toLocaleString('en-GB')}/yr out`,
      fieldsTouched: ['finance.livingCosts'],
      signals: { transactions: rows, days: Math.round(days), annualSpend, annualIncome },
    },
    apply: (twin) => {
      twin.finance.livingCosts = annualSpend;
    },
  };
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export async function importCalendar(file: File): Promise<ImportOutcome> {
  const text = await file.text();

  const pattern = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
  const cutoff = Date.now() - 90 * 24 * 3600 * 1000;

  let totalHours = 0;
  let events = 0;
  const daysSeen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const block = match[1];
    const start = parseIcsDate(block.match(/DTSTART[^:]*:([0-9TZ]+)/)?.[1]);
    const end = parseIcsDate(block.match(/DTEND[^:]*:([0-9TZ]+)/)?.[1]);
    if (!start || !end) continue;
    if (start.getTime() < cutoff) continue;

    const hours = (end.getTime() - start.getTime()) / 3_600_000;
    // Skip all-day and multi-day entries — they are not meetings.
    if (hours <= 0 || hours > 10) continue;

    totalHours += hours;
    events++;
    daysSeen.add(start.toISOString().slice(0, 10));
  }

  if (events === 0) throw new Error('No timed events found in the last 90 days of that calendar.');

  const weeks = Math.max(1, daysSeen.size / 5);
  const meetingHoursPerWeek = Math.round((totalHours / weeks) * 10) / 10;

  // Meetings are a lower bound on working hours, never the whole of them.
  // The multiplier reflects that most work does not appear on a calendar.
  const estimatedHours = Math.min(90, Math.round(Math.max(35, meetingHoursPerWeek * 2.6)));

  return {
    changes: [
      `${meetingHoursPerWeek}h/week in meetings across ${events} events`,
      `weekly hours estimated at ${estimatedHours} — meetings are a lower bound, so this scales them up and is a guess worth correcting by hand`,
    ],
    record: {
      id: `calendar-${Date.now()}`,
      source: 'google-calendar',
      importedAt: new Date().toISOString(),
      summary: `${events} events over the last 90 days · ${meetingHoursPerWeek}h/week in meetings`,
      fieldsTouched: ['career.hoursPerWeek'],
      signals: { events, meetingHoursPerWeek, estimatedHours },
    },
    apply: (twin) => {
      twin.career.hoursPerWeek = estimatedHours;
    },
  };
}

function parseIcsDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
  if (!match) return null;
  const [, y, m, d, hh = '0', mm = '0', ss = '0'] = match;
  return new Date(Date.UTC(+y, +m - 1, +d, +hh, +mm, +ss));
}

// ---------------------------------------------------------------------------
// LinkedIn positions
// ---------------------------------------------------------------------------

export async function importLinkedIn(file: File): Promise<ImportOutcome> {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error('That file has no rows in it.');

  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const titleIndex = header.findIndex((h) => h.includes('title'));
  const startIndex = header.findIndex((h) => h.includes('started'));
  const finishIndex = header.findIndex((h) => h.includes('finished'));

  if (titleIndex === -1 || startIndex === -1) {
    throw new Error(`This does not look like LinkedIn's Positions.csv. Found columns: ${header.join(', ')}`);
  }

  const positions: { title: string; start: Date; end: Date | null }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const start = new Date(cells[startIndex]?.trim() ?? '');
    if (Number.isNaN(start.getTime())) continue;
    const finishRaw = finishIndex !== -1 ? cells[finishIndex]?.trim() : '';
    const end = finishRaw ? new Date(finishRaw) : null;
    positions.push({ title: cells[titleIndex]?.trim() ?? '', start, end: end && !Number.isNaN(end.getTime()) ? end : null });
  }

  if (positions.length === 0) throw new Error('No positions with a readable start date were found.');

  positions.sort((a, b) => a.start.getTime() - b.start.getTime());
  const first = positions[0].start;
  const yearsExperience = Math.round((Date.now() - first.getTime()) / (365.25 * 24 * 3600 * 1000));
  const current = positions[positions.length - 1];

  const title = current.title;
  const seniority = inferSeniority(title);

  return {
    changes: [
      `${yearsExperience} years of experience from ${positions.length} positions since ${first.getFullYear()}`,
      `current title set to "${title}"`,
      `level inferred as ${seniority}`,
    ],
    record: {
      id: `linkedin-${Date.now()}`,
      source: 'linkedin',
      importedAt: new Date().toISOString(),
      summary: `${positions.length} positions, ${yearsExperience} years since ${first.getFullYear()}`,
      fieldsTouched: ['career.yearsExperience', 'career.title', 'career.seniority'],
      signals: { positions: positions.length, yearsExperience, title },
    },
    apply: (twin) => {
      twin.career.yearsExperience = yearsExperience;
      if (title) twin.career.title = title;
      twin.career.seniority = seniority;
    },
  };
}

function inferSeniority(title: string): DigitalTwin['career']['seniority'] {
  const lower = title.toLowerCase();
  if (/(founder|co-founder)/.test(lower)) return 'founder';
  if (/(chief|cto|ceo|cfo|coo|vp|vice president|director|head of)/.test(lower)) return 'executive';
  if (/(principal|staff|lead|manager)/.test(lower)) return 'lead';
  if (/senior|snr|sr\.?/.test(lower)) return 'senior';
  if (/(junior|graduate|intern|associate|trainee)/.test(lower)) return 'entry';
  return 'mid';
}
