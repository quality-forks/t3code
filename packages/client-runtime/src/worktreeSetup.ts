import type {
  OrchestrationV2Run,
  VcsStatusLocalResult,
  WorktreeSetupSnapshot,
} from "@t3tools/contracts";
import { mFallback, msg } from "gt-i18n";
import type { MFunctionType } from "gt-i18n/types";

/** An explicit base wins; unpublished jj changes are the default only for local starts. */
export function resolveNewWorkspaceBase(input: {
  readonly selectedBase: string | null;
  readonly startFromOrigin: boolean;
  readonly status: Pick<VcsStatusLocalResult, "vcs" | "committedBase"> | null | undefined;
  readonly fallbackBase: string | null;
}): string | null {
  return (
    input.selectedBase ??
    (!input.startFromOrigin && input.status?.vcs?.kind === "jj"
      ? input.status.committedBase?.changeId
      : null) ??
    input.fallbackBase
  );
}

/** Pending change-id bases need a human label even after the checkout moves on. */
export function workspaceBaseLabel(
  base: string,
  isJujutsu: boolean,
  resolve: MFunctionType = mFallback,
): string {
  return isJujutsu && /^[k-z]{32}$/.test(base)
    ? resolve(msg("Current change {id}", { id: base.slice(0, 8) }))
    : base;
}

export function resolveVisibleWorktreeSetup(input: {
  live: WorktreeSetupSnapshot | null;
  recorded: WorktreeSetupSnapshot | null;
  runs: ReadonlyArray<Pick<OrchestrationV2Run, "startedAt">>;
  followUpSent: boolean;
}): WorktreeSetupSnapshot | null {
  const snapshot =
    input.live && (!input.recorded || input.live.sequence >= input.recorded.sequence)
      ? input.live
      : input.recorded;
  if (!snapshot) return null;
  if (snapshot.phase === "running") return snapshot;
  if (input.followUpSent) return null;
  if (snapshot.phase !== "done") return snapshot;
  if (!input.runs.some((run) => run.startedAt !== null)) return snapshot;
  return snapshot.stages.some((stage) => stage.status === "failed") ? snapshot : null;
}

export function worktreeSetupAgentStarted(snapshot: WorktreeSetupSnapshot): boolean {
  return snapshot.stages.some((stage) => stage.id === "agent" && stage.status === "done");
}
