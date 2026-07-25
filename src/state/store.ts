/**
 * Application state.
 *
 * Everything lives in the browser. The twin, the assumption overrides and the
 * saved questions are persisted to localStorage and never sent anywhere —
 * there is no backend to send them to. That is a deliberate architectural
 * commitment, not a feature that could be quietly reversed later: an app that
 * asks for your salary, your health, your relationship and your inner life
 * has no business holding any of it on someone else's computer.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { defaultAssumptions, withOverrides, type AssumptionId, type AssumptionValues } from '../engine/assumptions';
import type { Attribution, SensitivityPoint } from '../engine/attribution';
import { defaultOptions, getDecision, type OptionValues } from '../engine/decisions';
import type { SimResult } from '../engine/monteCarlo';
import { createTwin, exampleTwin, SCHEMA_VERSION } from '../engine/twin';
import type { DigitalTwin } from '../engine/types';
import type { SimulatePayload, WorkerRequest, WorkerResponse } from '../worker/simulation.worker';

export type Screen = 'landing' | 'onboarding' | 'twin' | 'ask' | 'results' | 'assumptions' | 'imports';

export interface RunProgress {
  phase: 'simulating' | 'explaining';
  done: number;
  total: number;
  label: string;
}

export interface SavedQuestion {
  id: string;
  decisionId: string;
  options: OptionValues;
  askedAt: string;
  /** Headline for the history list. */
  summary: string;
}

interface AppState {
  screen: Screen;
  twin: DigitalTwin;
  /** Only the values the user has actually changed. */
  assumptionOverrides: Partial<Record<AssumptionId, number>>;

  decisionId: string;
  options: OptionValues;
  horizonYears: number;
  runs: number;
  seed: number;
  /** Which branch the attribution panel is explaining. */
  focusBranchId: string | null;

  running: boolean;
  progress: RunProgress | null;
  result: SimResult | null;
  attribution: Attribution[] | null;
  sensitivityPoints: SensitivityPoint[] | null;
  error: string | null;

  history: SavedQuestion[];

  // -- actions --
  go: (screen: Screen) => void;
  updateTwin: (patch: (twin: DigitalTwin) => void) => void;
  replaceTwin: (twin: DigitalTwin) => void;
  resetTwin: () => void;
  loadExample: () => void;
  markChapter: (chapter: string) => void;

  setAssumption: (id: AssumptionId, value: number) => void;
  resetAssumption: (id: AssumptionId) => void;
  resetAllAssumptions: () => void;
  assumptions: () => AssumptionValues;

  chooseDecision: (decisionId: string) => void;
  setOption: (id: string, value: OptionValues[string]) => void;
  setHorizon: (years: number) => void;
  setRuns: (runs: number) => void;
  reseed: () => void;
  focusBranch: (branchId: string | null) => void;

  run: () => void;
  cancel: () => void;
}

// ---------------------------------------------------------------------------
// Worker plumbing
// ---------------------------------------------------------------------------

let worker: Worker | null = null;
let requestId = 0;
let activeRequest = 0;

function ensureWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../worker/simulation.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      // Ignore anything from a run the user has already superseded.
      if (message.id !== activeRequest) return;

      const set = useApp.setState;
      switch (message.type) {
        case 'progress':
          set({ progress: { phase: message.phase, done: message.done, total: message.total, label: message.label } });
          break;
        case 'result':
          set({
            result: message.result,
            attribution: message.attribution,
            running: false,
            progress: null,
            error: null,
          });
          break;
        case 'sensitivity':
          set({ sensitivityPoints: message.points });
          break;
        case 'error':
          set({ error: message.message, running: false, progress: null });
          break;
      }
    };
    worker.onerror = (event) => {
      useApp.setState({ error: event.message || 'The simulation worker failed.', running: false, progress: null });
    };
  }
  return worker;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const initialDecision = 'found-startup';

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      screen: 'landing',
      twin: createTwin(),
      assumptionOverrides: {},

      decisionId: initialDecision,
      options: defaultOptions(getDecision(initialDecision)),
      horizonYears: 15,
      runs: 10000,
      seed: 20260725,
      focusBranchId: null,

      running: false,
      progress: null,
      result: null,
      attribution: null,
      sensitivityPoints: null,
      error: null,

      history: [],

      go: (screen) => set({ screen }),

      updateTwin: (patch) =>
        set((state) => {
          const next = structuredClone(state.twin);
          patch(next);
          next.updatedAt = new Date().toISOString();
          return { twin: next };
        }),

      replaceTwin: (twin) => set({ twin: { ...twin, updatedAt: new Date().toISOString() } }),

      resetTwin: () => set({ twin: createTwin(), result: null, attribution: null }),

      loadExample: () => set({ twin: exampleTwin(), result: null, attribution: null }),

      markChapter: (chapter) =>
        set((state) => {
          if (state.twin.completed.includes(chapter)) return {};
          const next = structuredClone(state.twin);
          next.completed = [...next.completed, chapter];
          next.updatedAt = new Date().toISOString();
          return { twin: next };
        }),

      setAssumption: (id, value) =>
        set((state) => ({
          assumptionOverrides: { ...state.assumptionOverrides, [id]: value },
          // A changed assumption invalidates the answer that was built on it.
          result: null,
          attribution: null,
        })),

      resetAssumption: (id) =>
        set((state) => {
          const next = { ...state.assumptionOverrides };
          delete next[id];
          return { assumptionOverrides: next, result: null, attribution: null };
        }),

      resetAllAssumptions: () => set({ assumptionOverrides: {}, result: null, attribution: null }),

      assumptions: () => withOverrides(get().assumptionOverrides),

      chooseDecision: (decisionId) =>
        set({
          decisionId,
          options: defaultOptions(getDecision(decisionId)),
          result: null,
          attribution: null,
          focusBranchId: null,
          sensitivityPoints: null,
        }),

      setOption: (id, value) =>
        set((state) => ({ options: { ...state.options, [id]: value }, result: null, attribution: null })),

      setHorizon: (years) => set({ horizonYears: years, result: null, attribution: null }),
      setRuns: (runs) => set({ runs, result: null, attribution: null }),
      reseed: () => set({ seed: Math.floor(Math.random() * 2 ** 31), result: null, attribution: null }),
      focusBranch: (branchId) => set({ focusBranchId: branchId }),

      run: () => {
        const state = get();
        const spec = getDecision(state.decisionId);
        // Explain the first branch that is not the do-nothing baseline.
        const target = spec.branches.find((b) => b.id !== 'stay') ?? spec.branches[0];
        const branchId = state.focusBranchId ?? target.id;

        const payload: SimulatePayload = {
          twin: state.twin,
          params: withOverrides(state.assumptionOverrides),
          decisionId: state.decisionId,
          options: state.options,
          horizonYears: state.horizonYears,
          runs: state.runs,
          seed: state.seed,
          samplePaths: 48,
          attributeBranchId: branchId,
          // Attribution costs one full simulation per channel, so it runs at a
          // fraction of the headline count. The UI reports that count openly
          // rather than implying the explanation is as precise as the answer.
          ablationRuns: Math.max(400, Math.min(3000, Math.round(state.runs / 4))),
        };

        activeRequest = ++requestId;
        set({
          running: true,
          error: null,
          progress: { phase: 'simulating', done: 0, total: spec.branches.length, label: 'Starting' },
          result: null,
          attribution: null,
          sensitivityPoints: null,
          focusBranchId: branchId,
          screen: 'results',
          history: [
            {
              id: `${Date.now()}`,
              decisionId: state.decisionId,
              options: state.options,
              askedAt: new Date().toISOString(),
              summary: spec.question,
            },
            ...state.history.filter((h) => h.decisionId !== state.decisionId).slice(0, 11),
          ],
        });

        const request: WorkerRequest = { id: activeRequest, type: 'simulate', payload };
        ensureWorker().postMessage(request);
      },

      cancel: () => {
        // Terminating is the only reliable way to stop a busy worker; the next
        // run lazily builds a fresh one.
        if (worker) {
          worker.terminate();
          worker = null;
        }
        activeRequest = -1;
        set({ running: false, progress: null });
      },
    }),
    {
      name: 'crossroad.v1',
      storage: createJSONStorage(() => localStorage),
      version: SCHEMA_VERSION,
      // Results are large and cheap to recompute; only the inputs are worth
      // keeping across sessions.
      partialize: (state) => ({
        twin: state.twin,
        assumptionOverrides: state.assumptionOverrides,
        decisionId: state.decisionId,
        options: state.options,
        horizonYears: state.horizonYears,
        runs: state.runs,
        seed: state.seed,
        history: state.history,
      }),
    },
  ),
);

export function currentAssumptions(): AssumptionValues {
  return withOverrides(useApp.getState().assumptionOverrides);
}

export { defaultAssumptions };
