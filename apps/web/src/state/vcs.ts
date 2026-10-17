import { createContext } from "react";
import type { EnvironmentId, VcsStatusResult } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";
import {
  createVcsActionManager,
  createVcsEnvironmentAtoms,
  createVcsStatusRevalidationAtomFamily,
} from "@t3tools/client-runtime/state/vcs";
import {
  resolveVcsTerminology,
  supportsVcsActions,
  type VcsTerminology,
} from "@t3tools/shared/vcs";

import { connectionAtomRuntime } from "../connection/runtime";
import { useEnvironmentQuerySelector } from "./query";

export const vcsEnvironment = createVcsEnvironmentAtoms(connectionAtomRuntime);
export const vcsActionManager = createVcsActionManager(connectionAtomRuntime);
export const vcsStatusRevalidation = createVcsStatusRevalidationAtomFamily({
  refreshStatus: {
    label: vcsEnvironment.refreshStatus.label,
    run: (registry, target) =>
      vcsEnvironment.refreshStatus.run(registry, {
        environmentId: target.environmentId,
        input: { cwd: target.input.cwd },
      }),
  },
});

export const VcsTerminologyContext = createContext(resolveVcsTerminology(null));

export const selectVcsTerminology = (status: AsyncResult.AsyncResult<VcsStatusResult, unknown>) =>
  resolveVcsTerminology(Option.getOrNull(AsyncResult.value(status)));
export const selectVcsActionsSupported = (
  status: AsyncResult.AsyncResult<VcsStatusResult, unknown>,
) => supportsVcsActions(Option.getOrNull(AsyncResult.value(status)));

/** Reads the shared status atom for (environment, cwd); Git terms until it answers. */
export function useVcsTerminology(
  environmentId: EnvironmentId | null,
  cwd: string | null,
): VcsTerminology {
  return useEnvironmentQuerySelector(
    environmentId === null || cwd === null
      ? null
      : vcsEnvironment.status({ environmentId, input: { cwd, includeRemote: false } }),
    selectVcsTerminology,
  );
}
