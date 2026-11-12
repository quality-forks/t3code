import { useAtomValue } from "@effect/atom-react";
import {
  createVcsActionManager,
  createVcsEnvironmentAtoms,
  createVcsStatusRevalidationAtomFamily,
} from "@t3tools/client-runtime/state/vcs";
import * as Equal from "effect/Equal";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";
import { createContext } from "react";
import type { EnvironmentId, VcsStatusResult } from "@t3tools/contracts";
import { supportsVcsActions } from "@t3tools/shared/vcs";
import { localizedVcsTerminology } from "@t3tools/client-runtime/state/vcs";
import { useMessages } from "gt-react";
import { m } from "../i18n/messages";

import { connectionAtomRuntime } from "../connection/runtime";
import { subscribeDocumentReturn } from "../lib/documentActivity";
import { appAtomRegistry } from "../rpc/atomRegistry";

/** Menus and local actions never wait for an environment connection or a status result. */
export function readVcsTerminology(environmentId: EnvironmentId, cwd: string | null) {
  if (cwd === null) return localizedVcsTerminology(null, m);
  const cached = appAtomRegistry
    .getNodes()
    .get(vcsEnvironment.status({ environmentId, input: { cwd } }))
    ?.valueOption();
  return cached && Option.isSome(cached)
    ? selectVcsTerminology(cached.value as AsyncResult.AsyncResult<VcsStatusResult, unknown>)
    : localizedVcsTerminology(null, m);
}

export const VcsTerminologyContext = createContext(localizedVcsTerminology(null, m));

export const selectVcsTerminology = (result: AsyncResult.AsyncResult<VcsStatusResult, unknown>) =>
  localizedVcsTerminology(
    AsyncResult.getOrElse(result, () => null),
    m,
  );
export const selectVcsActionsSupported = (
  result: AsyncResult.AsyncResult<VcsStatusResult, unknown>,
) => supportsVcsActions(AsyncResult.getOrElse(result, () => null));

const NO_VCS_STATUS_ATOM = Atom.make(AsyncResult.initial<VcsStatusResult>());

export function useVcsTerminology(environmentId: EnvironmentId | null, cwd: string | null) {
  const messages = useMessages();
  return useAtomValue(
    environmentId === null || cwd === null
      ? NO_VCS_STATUS_ATOM
      : vcsEnvironment.status({ environmentId, input: { cwd } }),
    (result) =>
      localizedVcsTerminology(
        AsyncResult.getOrElse(result, () => null),
        messages,
      ),
  );
}

export const vcsEnvironment = createVcsEnvironmentAtoms(connectionAtomRuntime);
export const vcsActionManager = createVcsActionManager(connectionAtomRuntime);

/** Only what a chat view reads, so changing file counts don't re-render it on every edit. */
export const chatGitStatusAtom = Atom.family((status: ReturnType<typeof vcsEnvironment.status>) =>
  Atom.map(status, (result) => {
    const data = AsyncResult.getOrElse(result, () => null);
    if (data === null) return null;
    const { isRepo, refName, hasWorkingTreeChanges, pr, vcs } = data;
    return { isRepo, refName, hasWorkingTreeChanges, pr, vcs };
  }).pipe(Atom.withEquality(Equal.equals)),
);
export const NO_CHAT_GIT_STATUS_ATOM: ReturnType<typeof chatGitStatusAtom> = Atom.make(null);

/**
 * Refreshes a checkout's status when the user comes back to the window, where
 * edits made in another app or terminal may be waiting.
 */
export const vcsStatusRevalidation = createVcsStatusRevalidationAtomFamily({
  refreshStatus: vcsEnvironment.refreshStatus,
  subscribeWake: subscribeDocumentReturn,
  wakeDebounceMs: 250,
});

export const vcsBranchRevalidation = createVcsStatusRevalidationAtomFamily({
  refreshStatus: vcsEnvironment.refreshBranch,
  subscribeWake: subscribeDocumentReturn,
  wakeDebounceMs: 250,
});
