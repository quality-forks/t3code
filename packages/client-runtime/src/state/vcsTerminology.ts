import type { VcsStatusLocalResult } from "@t3tools/contracts";
import type { VcsTerminology } from "@t3tools/shared/vcs";
import { mFallback, msg } from "gt-i18n";
import type { MFunctionType } from "gt-i18n/types";
export function localizedVcsTerminology(
  status: Pick<VcsStatusLocalResult, "vcs"> | null | undefined,
  resolve: MFunctionType = mFallback,
): VcsTerminology {
  return status?.vcs?.kind === "jj" ? jjTerminology(resolve) : gitTerminology(resolve);
}
export function gitTerminology(resolve: MFunctionType): VcsTerminology {
  return {
    kind: "git",
    systemName: resolve(msg("Git")),
    refNoun: resolve(msg("branch")),
    refNounPlural: resolve(msg("branches")),
    refNounTitle: resolve(msg("Branch")),
    refNounPluralTitle: resolve(msg("Branches")),
    workspaceNoun: resolve(msg("worktree")),
    workspaceNounTitle: resolve(msg("Worktree")),
    workspaceNounPlural: resolve(msg("worktrees")),
    changeNoun: resolve(msg("commit")),
    changeNounTitle: resolve(msg("Commit")),
    workingTreeNoun: resolve(msg("working tree")),
    workingTreeNounTitle: resolve(msg("Working tree")),
    workingTreeDiffLabel: resolve(msg("Uncommitted")),
    workingTreeEditsAdjective: resolve(msg("uncommitted")),
    workingTreeSubtitle: resolve(msg("Staged, unstaged, and untracked files")),
    localChangesLabel: resolve(msg("Uncommitted changes")),
    changeOnNewRefMobileLabel: resolve(msg("Commit on a new branch")),
    refSwitchChangesDescription: resolve(
      msg(
        "You have uncommitted changes. They'll carry over to the other branch, or block the switch if they conflict.",
      ),
    ),
    currentRefFallback: resolve(msg("checkout")),
    genericRefNoun: resolve(msg("ref")),
    genericRefNounPlural: resolve(msg("refs")),
    repositoryAdjective: resolve(msg("git")),
    noRefLabel: resolve(msg("Detached HEAD")),
    noRefDisplay: resolve(msg("(detached HEAD)")),
    defaultRefLabel: resolve(msg("Default branch")),
    hooksNotice: null,
    dirtyPushHint: resolve(msg("Commit or stash local changes before pushing.")),
    cleanCommitHint: resolve(msg("Worktree is clean. Make changes before committing.")),
    noRefHint: (tail, surface = "mobile") =>
      surface === "web"
        ? resolve(msg("Detached HEAD: check out a branch before {value0}.", { value0: tail }))
        : resolve(msg("Detached HEAD: checkout a branch before {value0}.", { value0: tail })),
    quickNoRefHint: (changeRequest, surface = "mobile") =>
      resolve(
        msg("Create and checkout a {value0} before pushing or opening {value1}.", {
          value0: surface === "web" ? resolve(msg("ref")) : resolve(msg("branch")),
          value1: changeRequest,
        }),
      ),
    noRefActionsNotice: (changeRequest) =>
      resolve(
        msg("Detached HEAD: create and check out a branch to enable push and {value0} actions.", {
          value0: changeRequest,
        }),
      ),
    changeOnNewRefLabel: resolve(msg("Commit on new branch")),
    featureCheckoutLabel: (surface = "web") =>
      surface === "web"
        ? resolve(msg("Check out feature branch & continue"))
        : resolve(msg("Feature branch & continue")),
    createAndSwitchLabel: resolve(msg("Create & checkout")),
    preserveReviewSectionTitles: false,
  };
}
export function jjTerminology(resolve: MFunctionType): VcsTerminology {
  return {
    kind: "jj",
    systemName: resolve(msg("Jujutsu")),
    refNoun: resolve(msg("bookmark")),
    refNounPlural: resolve(msg("bookmarks")),
    refNounTitle: resolve(msg("Bookmark")),
    refNounPluralTitle: resolve(msg("Bookmarks")),
    workspaceNoun: resolve(msg("workspace")),
    workspaceNounTitle: resolve(msg("Workspace")),
    workspaceNounPlural: resolve(msg("workspaces")),
    changeNoun: resolve(msg("change")),
    changeNounTitle: resolve(msg("Change")),
    workingTreeNoun: resolve(msg("working copy")),
    workingTreeNounTitle: resolve(msg("Working copy")),
    workingTreeDiffLabel: resolve(msg("Working copy")),
    workingTreeEditsAdjective: resolve(msg("working copy")),
    workingTreeSubtitle: resolve(msg("Working copy files")),
    localChangesLabel: resolve(msg("Working copy changes")),
    changeOnNewRefMobileLabel: resolve(msg("Commit on a new bookmark")),
    refSwitchChangesDescription: resolve(
      msg(
        "You have working copy changes. They'll stay in the current change when you switch bookmarks. The switch may be refused if it would leave that change without a bookmark.",
      ),
    ),
    currentRefFallback: resolve(msg("working copy")),
    genericRefNoun: resolve(msg("bookmark")),
    genericRefNounPlural: resolve(msg("bookmarks")),
    repositoryAdjective: resolve(msg("Jujutsu")),
    noRefLabel: resolve(msg("No bookmark")),
    noRefDisplay: resolve(msg("(no bookmark)")),
    defaultRefLabel: resolve(msg("Default bookmark")),
    hooksNotice: resolve(msg("Jujutsu does not run Git hooks.")),
    dirtyPushHint: resolve(msg("Commit local changes before pushing.")),
    cleanCommitHint: resolve(msg("The working copy is clean. Make changes before committing.")),
    noRefHint: (tail) =>
      resolve(msg("No bookmark here: create one before {value0}.", { value0: tail })),
    quickNoRefHint: (changeRequest) =>
      resolve(
        msg("No bookmark here: create one before pushing or opening {value0}.", {
          value0: changeRequest,
        }),
      ),
    noRefActionsNotice: (changeRequest) =>
      resolve(
        msg("No bookmark here: create one before enabling push and {value0} actions.", {
          value0: changeRequest,
        }),
      ),
    changeOnNewRefLabel: resolve(msg("Commit on new bookmark")),
    featureCheckoutLabel: () => resolve(msg("Switch to feature bookmark & continue")),
    createAndSwitchLabel: resolve(msg("Create & switch")),
    preserveReviewSectionTitles: true,
  };
}
