import {
  createVcsActionManager,
  createVcsEnvironmentAtoms,
} from "@t3tools/client-runtime/state/vcs";

import { connectionAtomRuntime } from "../connection/runtime";
import type { EnvironmentId, VcsStatusResult } from "@t3tools/contracts";
import { resolveVcsFallbackNotice, resolveVcsUnsupportedReason } from "@t3tools/shared/vcs";
import { useEnvironmentQuerySelector } from "./query";
import { appAtomRegistry } from "./atom-registry";
import { AsyncResult } from "effect/reactivity";
import * as Option from "effect/Option";
import { localizedVcsTerminology } from "@t3tools/client-runtime/state/vcs";
import { useMessages } from "gt-react-native";
import { m } from "../i18n/messages";

/** Rows read cached checkout vocabulary without mounting a status stream per row. */
export function cachedRepositoryTerminology(
  environmentId: EnvironmentId,
  cwd: string | null,
  resolve: typeof m = m,
) {
  const node =
    cwd === null
      ? undefined
      : appAtomRegistry.getNodes().get(vcsEnvironment.status({ environmentId, input: { cwd } }));
  const cached = node?.valueOption();
  return localizedVcsTerminology(
    cached && Option.isSome(cached)
      ? AsyncResult.getOrElse(
          cached.value as AsyncResult.AsyncResult<VcsStatusResult, unknown>,
          () => null,
        )
      : null,
    resolve,
  );
}

export const vcsEnvironment = createVcsEnvironmentAtoms(connectionAtomRuntime);
export const vcsActionManager = createVcsActionManager(connectionAtomRuntime);

const selectUnsupportedReason = (result: AsyncResult.AsyncResult<VcsStatusResult, unknown>) =>
  resolveVcsUnsupportedReason(AsyncResult.getOrElse(result, () => null));
const selectNotice = (result: AsyncResult.AsyncResult<VcsStatusResult, unknown>) =>
  resolveVcsFallbackNotice(AsyncResult.getOrElse(result, () => null))?.notice ?? null;

export function useRepositoryVcs(environmentId: EnvironmentId | null, cwd: string | null) {
  const messages = useMessages();
  const atom =
    environmentId === null || cwd === null
      ? null
      : vcsEnvironment.status({ environmentId, input: { cwd } });
  const terminology = useEnvironmentQuerySelector(atom, (result) =>
    localizedVcsTerminology(
      AsyncResult.getOrElse(result, () => null),
      messages,
    ),
  );
  const unsupportedReason = useEnvironmentQuerySelector(atom, selectUnsupportedReason);
  const notice = useEnvironmentQuerySelector(atom, selectNotice);
  return {
    terminology,
    unsupportedReason,
    actionsSupported: unsupportedReason === null,
    fallbackNotice: notice ? { notice, reason: null } : null,
  };
}
