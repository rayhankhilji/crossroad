/**
 * The simulation worker.
 *
 * Ten thousand lives across two branches is tens of millions of arithmetic
 * operations, and a fifteen-year horizon with attribution turned on is several
 * times that again. On the main thread it would lock the interface for
 * seconds. Here it runs off to one side and streams progress back, so the
 * interface can show the futures accumulating rather than a spinner.
 *
 * Nothing in this file talks to the network. The twin never leaves the tab.
 */

import { attribute, sensitivity, type Attribution, type SensitivityPoint } from '../engine/attribution';
import { simulate, type SimRequest, type SimResult } from '../engine/monteCarlo';
import type { AssumptionValues } from '../engine/assumptions';
import type { OptionValues } from '../engine/decisions';
import type { DigitalTwin } from '../engine/types';

export interface SimulatePayload {
  twin: DigitalTwin;
  params: AssumptionValues;
  decisionId: string;
  options: OptionValues;
  horizonYears: number;
  runs: number;
  seed: number;
  samplePaths: number;
  /** Which branch to explain, if attribution is wanted alongside. */
  attributeBranchId?: string;
  ablationRuns?: number;
}

export type WorkerRequest =
  | { id: number; type: 'simulate'; payload: SimulatePayload }
  | {
      id: number;
      type: 'sensitivity';
      payload: SimulatePayload & { branchId: string; metric: string; assumptionIds: string[] };
    };

export type WorkerResponse =
  | { id: number; type: 'progress'; phase: 'simulating' | 'explaining'; done: number; total: number; label: string }
  | { id: number; type: 'result'; result: SimResult; attribution: Attribution[] | null }
  | { id: number; type: 'sensitivity'; points: SensitivityPoint[] }
  | { id: number; type: 'error'; message: string };

const post = (message: WorkerResponse) => self.postMessage(message);

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = event.data;

  try {
    if (type === 'simulate') {
      const request: SimRequest = {
        twin: payload.twin,
        params: payload.params,
        decisionId: payload.decisionId,
        options: payload.options,
        horizonYears: payload.horizonYears,
        runs: payload.runs,
        seed: payload.seed,
        samplePaths: payload.samplePaths,
      };

      const result = simulate(request, (done, total, label) => {
        post({ id, type: 'progress', phase: 'simulating', done, total, label });
      });

      let attribution: Attribution[] | null = null;
      if (payload.attributeBranchId) {
        attribution = attribute({
          ...request,
          branchId: payload.attributeBranchId,
          ablationRuns: payload.ablationRuns,
          onProgress: (done, total, label) => {
            post({ id, type: 'progress', phase: 'explaining', done, total, label });
          },
        });
      }

      post({ id, type: 'result', result, attribution });
      return;
    }

    if (type === 'sensitivity') {
      const points = sensitivity({
        twin: payload.twin,
        params: payload.params,
        decisionId: payload.decisionId,
        options: payload.options,
        horizonYears: payload.horizonYears,
        seed: payload.seed,
        branchId: payload.branchId,
        metric: payload.metric as never,
        assumptionIds: payload.assumptionIds,
        runs: 1200,
      });
      post({ id, type: 'sensitivity', points });
      return;
    }
  } catch (error) {
    post({ id, type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
