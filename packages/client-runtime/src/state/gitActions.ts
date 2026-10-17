import type {
  GitRunStackedActionInput,
  GitStackedAction,
  VcsStatusResult,
} from "@t3tools/contracts";
import { resolveVcsUnsupportedReason, type VcsTerminology } from "@t3tools/shared/vcs";
import { sourceControlClients, type ChangeRequestTerminology } from "../sourceControlClients.ts";
import { mFallback, msg } from "gt-i18n";
import type { MFunctionType } from "gt-i18n/types";
import { localizedVcsTerminology } from "./vcsTerminology.ts";

export type GitActionSurface = "web" | "mobile";
export type GitActionIconName = "commit" | "push" | "pr";
export type GitDialogAction = "commit" | "push" | "create_pr";
export interface GitActionMenuItem {
  id: "commit" | "push" | "pr";
  label: string;
  disabled: boolean;
  icon: GitActionIconName;
  kind: "open_dialog" | "open_pr";
  dialogAction?: GitDialogAction;
}
export interface GitQuickAction {
  label: string;
  disabled: boolean;
  kind: "run_action" | "run_pull" | "open_pr" | "open_publish" | "show_hint";
  action?: GitStackedAction;
  hint?: string;
}
export interface DefaultBranchActionDialogCopy {
  title: string;
  description: string;
  continueLabel: string;
}
export type DefaultBranchConfirmableAction =
  | "push"
  | "create_pr"
  | "commit_push"
  | "commit_push_pr";
export type GitActionRequestInput = Pick<
  GitRunStackedActionInput,
  "action" | "commitMessage" | "featureBranch" | "filePaths"
>;

export function changeRequestTerminologyFor(
  gitStatus: VcsStatusResult | null,
): ChangeRequestTerminology {
  return sourceControlClients.get(gitStatus?.sourceControlProvider?.kind).changeRequest;
}

export function buildMenuItems(
  gitStatus: VcsStatusResult | null,
  isBusy: boolean,
  hasOriginRemote = true,
  surface: GitActionSurface = "mobile",
  resolve: MFunctionType = mFallback,
): GitActionMenuItem[] {
  if (!gitStatus) return [];
  const blocked = isBusy || resolveVcsUnsupportedReason(gitStatus) !== null;
  const hasBranch = gitStatus.refName !== null;
  const hasOpenPr = gitStatus.pr?.state === "open";
  const canPushWithoutUpstream = hasOriginRemote && !gitStatus.hasUpstream;
  const canPush =
    !blocked &&
    hasBranch &&
    (surface === "web" || !gitStatus.hasWorkingTreeChanges) &&
    gitStatus.behindCount === 0 &&
    gitStatus.aheadCount > 0 &&
    (gitStatus.hasUpstream || canPushWithoutUpstream);
  const canCreatePr =
    !blocked &&
    hasBranch &&
    !hasOpenPr &&
    !(surface === "mobile" && gitStatus.vcs?.kind === "jj" && gitStatus.hasWorkingTreeChanges) &&
    (gitStatus.aheadOfDefaultCount ?? gitStatus.aheadCount) > 0 &&
    gitStatus.behindCount === 0 &&
    (gitStatus.hasUpstream || canPushWithoutUpstream);
  const items: GitActionMenuItem[] = [
    {
      id: "commit",
      label: resolve(msg("Commit", { $context: "verb, git action" })),
      disabled: blocked || !gitStatus.hasWorkingTreeChanges,
      icon: "commit",
      kind: "open_dialog",
      dialogAction: "commit",
    },
  ];
  if (surface === "web" && !hasOriginRemote) return items;
  items.push({
    id: "push",
    label: resolve(msg("Push", { $context: "verb, git action" })),
    disabled: !canPush,
    icon: "push",
    kind: "open_dialog",
    dialogAction: "push",
  });
  if (surface === "web" && hasOpenPr) return items;
  const terminology = changeRequestTerminologyFor(gitStatus);
  const vcs = localizedVcsTerminology(gitStatus, resolve);
  const shortLabel = terminology.shortLabel;
  items.push(
    hasOpenPr
      ? {
          id: "pr",
          label: resolve(msg("View {shortLabel}", { shortLabel: shortLabel })),
          disabled: blocked,
          icon: "pr",
          kind: "open_pr",
        }
      : {
          id: "pr",
          label: resolve(
            vcs.kind === "git"
              ? surface === "web"
                ? msg("Create {term, select, mr {MR} cr {change request} other {PR}}", {
                    term: changeRequestTermKind(terminology),
                  })
                : msg("Create {shortLabel}", { shortLabel: terminology.shortLabel })
              : msg("Create {shortLabel}", { shortLabel: shortLabel }),
          ),
          disabled: !canCreatePr,
          icon: "pr",
          kind: "open_dialog",
          dialogAction: "create_pr",
        },
  );
  return items;
}

export function resolveQuickAction(
  gitStatus: VcsStatusResult | null,
  isBusy: boolean,
  isDefaultBranch = false,
  hasOriginRemote = true,
  surface: GitActionSurface = "mobile",
  resolve: MFunctionType = mFallback,
): GitQuickAction {
  const vcs = localizedVcsTerminology(gitStatus, resolve);
  if (isBusy)
    return {
      label: resolve(msg("Commit", { $context: "verb, git action" })),
      disabled: true,
      kind: "show_hint",
      hint: resolve(
        vcs.kind === "git"
          ? msg("Git action in progress.")
          : msg("{value0} action in progress.", { value0: vcs.systemName }),
      ),
    };
  if (!gitStatus)
    return {
      label: resolve(msg("Commit", { $context: "verb, git action" })),
      disabled: true,
      kind: "show_hint",
      hint: resolve(
        vcs.kind === "git"
          ? msg("Git status is unavailable.")
          : msg("{value0} status is unavailable.", { value0: vcs.systemName }),
      ),
    };
  const unsupportedReason = resolveVcsUnsupportedReason(gitStatus);
  if (unsupportedReason !== null)
    return {
      label: resolve(msg("Commit", { $context: "verb, git action" })),
      disabled: true,
      kind: "show_hint",
      hint: unsupportedReason,
    };
  const terminology = sourceControlClients.get(gitStatus.sourceControlProvider?.kind).changeRequest;
  const shortLabel = terminology.shortLabel;
  const hasOpenPr = gitStatus.pr?.state === "open";
  const isAhead = gitStatus.aheadCount > 0;
  const isBehind = gitStatus.behindCount > 0;
  const resting: GitQuickAction = {
    label: resolve(msg("Commit", { $context: "verb, git action" })),
    disabled: true,
    kind: "show_hint",
    hint: resolve(
      vcs.kind === "git"
        ? msg("Branch is up to date. No action needed.")
        : msg("{value0} is up to date. No action needed.", { value0: vcs.refNounTitle }),
    ),
  };
  if (gitStatus.refName === null)
    return {
      label: resolve(msg("Commit", { $context: "verb, git action" })),
      disabled: true,
      kind: "show_hint",
      hint:
        vcs.kind === "git"
          ? resolve(
              surface === "web"
                ? msg(
                    "Create and checkout a ref before pushing or opening a {term, select, mr {merge request} cr {change request} other {pull request}}.",
                    { term: changeRequestTermKind(terminology) },
                  )
                : msg(
                    "{kind, select, pr {Create and checkout a branch before pushing or opening a PR.} mr {Create and checkout a branch before pushing or opening an MR.} generic {Create and checkout a branch before pushing or opening a change request.} other {Create and checkout a branch before pushing or opening {changeRequest}.}}",
                    {
                      kind: changeRequestKind(terminology),
                      changeRequest: terminology.shortLabelWithArticle,
                    },
                  ),
            )
          : vcs.quickNoRefHint(
              surface === "web"
                ? resolve(msg("a {value0}", { value0: terminology.singular }))
                : terminology.shortLabelWithArticle,
              surface,
            ),
    };
  if (gitStatus.hasWorkingTreeChanges) {
    if (isBehind || (!gitStatus.hasUpstream && !hasOriginRemote))
      return {
        label: resolve(msg("Commit", { $context: "verb, git action" })),
        disabled: false,
        kind: "run_action",
        action: "commit",
      };
    if (hasOpenPr || isDefaultBranch)
      return {
        label: resolve(msg("Commit & push")),
        disabled: false,
        kind: "run_action",
        action: "commit_push",
      };
    return {
      label: resolve(
        vcs.kind === "git"
          ? surface === "web"
            ? msg("Commit, push & {term, select, mr {MR} cr {change request} other {PR}}", {
                term: changeRequestTermKind(terminology),
              })
            : msg("Commit, push & {shortLabel}", { shortLabel: terminology.shortLabel })
          : msg("Commit, push & {shortLabel}", { shortLabel: shortLabel }),
      ),
      disabled: false,
      kind: "run_action",
      action: "commit_push_pr",
    };
  }
  if (!gitStatus.hasUpstream) {
    if (!hasOriginRemote) {
      if (surface === "web")
        return { label: resolve(msg("Publish repository")), disabled: false, kind: "open_publish" };
      if (hasOpenPr && !isAhead)
        return {
          label: resolve(msg("View {shortLabel}", { shortLabel: shortLabel })),
          disabled: false,
          kind: "open_pr",
        };
      return {
        label: resolve(msg("Push", { $context: "verb, git action" })),
        disabled: true,
        kind: "show_hint",
        hint: resolve(
          vcs.kind === "git"
            ? msg(
                '{kind, select, pr {Add an "origin" remote before pushing or creating a PR.} mr {Add an "origin" remote before pushing or creating an MR.} generic {Add an "origin" remote before pushing or creating a change request.} other {Add an "origin" remote before pushing or creating {changeRequest}.}}',
                {
                  kind: changeRequestKind(terminology),
                  changeRequest: terminology.shortLabelWithArticle,
                },
              )
            : msg('Add an "origin" remote before pushing or creating {value0}.', {
                value0: terminology.shortLabelWithArticle,
              }),
        ),
      };
    }
    if (!isAhead) {
      if (hasOpenPr)
        return surface === "web"
          ? resting
          : {
              label: resolve(msg("View {shortLabel}", { shortLabel: shortLabel })),
              disabled: false,
              kind: "open_pr",
            };
      return {
        label: resolve(msg("Push", { $context: "verb, git action" })),
        disabled: true,
        kind: "show_hint",
        hint: resolve(
          vcs.kind === "git"
            ? msg("No local commits to push.")
            : msg("No local {changes} to push.", {
                changes: resolve(
                  msg("{kind, select, jj {changes} other {commits}}", {
                    kind: vcs.preserveReviewSectionTitles ? "jj" : "git",
                  }),
                ),
              }),
        ),
      };
    }
  } else {
    if (isAhead && isBehind)
      return {
        label: resolve(
          vcs.kind === "git"
            ? surface === "web"
              ? msg("Sync ref")
              : msg("Sync branch")
            : msg("Sync {value0}", {
                value0: surface === "web" ? vcs.genericRefNoun : vcs.refNoun,
              }),
        ),
        disabled: true,
        kind: "show_hint",
        hint: resolve(
          vcs.kind === "git"
            ? msg("Branch has diverged from upstream. Rebase/merge first.")
            : msg("{value0} has diverged from upstream. Rebase/merge first.", {
                value0: vcs.refNounTitle,
              }),
        ),
      };
    if (isBehind)
      return {
        label: resolve(
          surface === "web" ? msg("Pull") : msg("Pull", { $context: "verb, git action" }),
        ),
        disabled: false,
        kind: "run_pull",
      };
  }
  if (isAhead) {
    if (hasOpenPr || isDefaultBranch)
      return {
        label: resolve(msg("Push", { $context: "verb, git action" })),
        disabled: false,
        kind: "run_action",
        action: "push",
      };
    return {
      label: resolve(
        vcs.kind === "git"
          ? surface === "web"
            ? msg("Push & create {term, select, mr {MR} cr {change request} other {PR}}", {
                term: changeRequestTermKind(terminology),
              })
            : msg("Push & create {shortLabel}", { shortLabel: terminology.shortLabel })
          : msg("Push & create {shortLabel}", { shortLabel: shortLabel }),
      ),
      disabled: false,
      kind: "run_action",
      action: "create_pr",
    };
  }
  if (hasOpenPr && gitStatus.hasUpstream)
    return surface === "web"
      ? resting
      : {
          label: resolve(msg("View {shortLabel}", { shortLabel: shortLabel })),
          disabled: false,
          kind: "open_pr",
        };
  if ((gitStatus.aheadOfDefaultCount ?? gitStatus.aheadCount) > 0 && !isDefaultBranch)
    return {
      label: resolve(
        vcs.kind === "git"
          ? surface === "web"
            ? msg("Create {term, select, mr {MR} cr {change request} other {PR}}", {
                term: changeRequestTermKind(terminology),
              })
            : msg("Create {shortLabel}", { shortLabel: terminology.shortLabel })
          : msg("Create {shortLabel}", { shortLabel: shortLabel }),
      ),
      disabled: false,
      kind: "run_action",
      action: "create_pr",
    };
  return resting;
}

export function getGitActionDisabledReason(
  input: {
    item: GitActionMenuItem;
    gitStatus: VcsStatusResult | null;
    isBusy: boolean;
    hasOriginRemote: boolean;
    surface?: GitActionSurface;
  },
  resolve: MFunctionType = mFallback,
): string | null {
  const { item, gitStatus, isBusy, hasOriginRemote, surface = "mobile" } = input;
  const vcs = localizedVcsTerminology(gitStatus, resolve);
  if (!item.disabled) return null;
  if (isBusy)
    return resolve(
      vcs.kind === "git"
        ? msg("Git action in progress.")
        : msg("{value0} action in progress.", { value0: vcs.systemName }),
    );
  if (!gitStatus)
    return resolve(
      vcs.kind === "git"
        ? msg("Git status is unavailable.")
        : msg("{value0} status is unavailable.", { value0: vcs.systemName }),
    );
  const unsupportedReason = resolveVcsUnsupportedReason(gitStatus);
  if (unsupportedReason !== null) return unsupportedReason;
  const terminology = sourceControlClients.get(gitStatus.sourceControlProvider?.kind).changeRequest;
  const request =
    surface === "web"
      ? resolve(msg("a {value0}", { value0: terminology.singular }))
      : terminology.shortLabelWithArticle;
  const hasChanges = gitStatus.hasWorkingTreeChanges;
  if (item.id === "commit")
    return !hasChanges
      ? surface === "web"
        ? vcs.cleanCommitHint
        : resolve(
            vcs.kind === "git"
              ? msg("Worktree is clean. Make changes before committing.")
              : msg("{value0} is clean. Make changes before committing.", {
                  value0: vcs.workspaceNounTitle,
                }),
          )
      : resolve(msg("Commit is currently unavailable."));
  if (item.id === "push") {
    if (gitStatus.refName === null)
      return vcs.kind === "git"
        ? resolve(
            surface === "web"
              ? msg("Detached HEAD: check out a branch before pushing.")
              : msg("Detached HEAD: checkout a branch before pushing."),
          )
        : vcs.noRefHint(resolve(msg("pushing")), surface);
    if (hasChanges && (surface === "mobile" || gitStatus.vcs?.kind === "jj"))
      return vcs.dirtyPushHint;
    if (gitStatus.behindCount > 0)
      return resolve(
        vcs.kind === "git"
          ? msg("Branch is behind upstream. Pull/rebase before pushing.")
          : msg("{value0} is behind upstream. Pull/rebase before pushing.", {
              value0: vcs.refNounTitle,
            }),
      );
    if (!gitStatus.hasUpstream && !hasOriginRemote)
      return resolve(msg('Add an "origin" remote before pushing.'));
    if (gitStatus.aheadCount <= 0)
      return resolve(
        vcs.kind === "git"
          ? msg("No local commits to push.")
          : msg("No local {changes} to push.", {
              changes: resolve(
                msg("{kind, select, jj {changes} other {commits}}", {
                  kind: vcs.preserveReviewSectionTitles ? "jj" : "git",
                }),
              ),
            }),
      );
    return resolve(msg("Push is currently unavailable."));
  }
  if (surface === "mobile" && gitStatus.pr?.state === "open")
    return resolve(
      msg("View {shortLabel} is currently unavailable.", { shortLabel: terminology.shortLabel }),
    );
  if (gitStatus.refName === null)
    return vcs.kind === "git"
      ? resolve(
          surface === "web"
            ? msg(
                "Detached HEAD: check out a branch before creating a {term, select, mr {merge request} cr {change request} other {pull request}}.",
                { term: changeRequestTermKind(terminology) },
              )
            : msg(
                "{kind, select, pr {Detached HEAD: checkout a branch before creating a PR.} mr {Detached HEAD: checkout a branch before creating an MR.} generic {Detached HEAD: checkout a branch before creating a change request.} other {Detached HEAD: checkout a branch before creating {changeRequest}.}}",
                {
                  kind: changeRequestKind(terminology),
                  changeRequest: terminology.shortLabelWithArticle,
                },
              ),
        )
      : vcs.noRefHint(resolve(msg("creating {value0}", { value0: request })), surface);
  if (surface === "mobile" && gitStatus.vcs?.kind === "jj" && hasChanges) return vcs.dirtyPushHint;
  if (!gitStatus.hasUpstream && !hasOriginRemote)
    return resolve(
      vcs.kind === "git"
        ? surface === "web"
          ? msg(
              'Add an "origin" remote before creating a {term, select, mr {merge request} cr {change request} other {pull request}}.',
              { term: changeRequestTermKind(terminology) },
            )
          : msg(
              '{kind, select, pr {Add an "origin" remote before creating a PR.} mr {Add an "origin" remote before creating an MR.} generic {Add an "origin" remote before creating a change request.} other {Add an "origin" remote before creating {changeRequest}.}}',
              {
                kind: changeRequestKind(terminology),
                changeRequest: terminology.shortLabelWithArticle,
              },
            )
        : msg('Add an "origin" remote before creating {value0}.', { value0: request }),
    );
  if ((gitStatus.aheadOfDefaultCount ?? gitStatus.aheadCount) <= 0)
    return resolve(
      vcs.kind === "git"
        ? surface === "web"
          ? msg(
              "No local commits to include in a {term, select, mr {merge request} cr {change request} other {pull request}}.",
              { term: changeRequestTermKind(terminology) },
            )
          : msg(
              "{kind, select, pr {No local commits to include in a PR.} mr {No local commits to include in an MR.} generic {No local commits to include in a change request.} other {No local commits to include in {changeRequest}.}}",
              {
                kind: changeRequestKind(terminology),
                changeRequest: terminology.shortLabelWithArticle,
              },
            )
        : msg("No local {changes} to include in {value1}.", {
            changes: resolve(
              msg("{kind, select, jj {changes} other {commits}}", {
                kind: vcs.preserveReviewSectionTitles ? "jj" : "git",
              }),
            ),
            value1: request,
          }),
    );
  if (gitStatus.behindCount > 0)
    return resolve(
      vcs.kind === "git"
        ? surface === "web"
          ? msg(
              "Branch is behind upstream. Pull/rebase before creating a {term, select, mr {merge request} cr {change request} other {pull request}}.",
              { term: changeRequestTermKind(terminology) },
            )
          : msg(
              "{kind, select, pr {Branch is behind upstream. Pull/rebase before creating a PR.} mr {Branch is behind upstream. Pull/rebase before creating an MR.} generic {Branch is behind upstream. Pull/rebase before creating a change request.} other {Branch is behind upstream. Pull/rebase before creating {changeRequest}.}}",
              {
                kind: changeRequestKind(terminology),
                changeRequest: terminology.shortLabelWithArticle,
              },
            )
        : msg("{value0} is behind upstream. Pull/rebase before creating {value1}.", {
            value0: vcs.refNounTitle,
            value1: request,
          }),
    );
  return resolve(
    vcs.kind === "git"
      ? surface === "web"
        ? msg(
            "Create {term, select, mr {merge request} cr {change request} other {pull request}} is currently unavailable.",
            {
              term: changeRequestTermKind(terminology),
            },
          )
        : msg("Create {shortLabel} is currently unavailable.", {
            shortLabel: terminology.shortLabel,
          })
      : msg("Create {value0} is currently unavailable.", {
          value0: surface === "web" ? terminology.singular : terminology.shortLabel,
        }),
  );
}

export function requiresDefaultBranchConfirmation(
  action: GitStackedAction,
  isDefaultBranch: boolean,
): boolean {
  return (
    isDefaultBranch &&
    (action === "push" ||
      action === "create_pr" ||
      action === "commit_push" ||
      action === "commit_push_pr")
  );
}
export function resolveDefaultBranchActionDialogCopy(
  input: {
    action: DefaultBranchConfirmableAction;
    branchName: string;
    includesCommit: boolean;
    vcsTerminology?: VcsTerminology;
    terminology?: ChangeRequestTerminology;
    surface?: GitActionSurface;
  },
  resolve: MFunctionType = mFallback,
): DefaultBranchActionDialogCopy {
  const vcs = input.vcsTerminology ?? localizedVcsTerminology(null, resolve);
  const surface = input.surface ?? "mobile";
  const web = surface === "web";
  const ref = web ? vcs.genericRefNoun : vcs.refNoun;
  const terminology = input.terminology ?? sourceControlClients.get(undefined).changeRequest;
  const shortLabel = terminology.shortLabel;
  const request = web
    ? resolve(msg("a {value0}", { value0: terminology.singular }))
    : terminology.shortLabelWithArticle;
  if (input.action === "push" || input.action === "commit_push")
    return input.includesCommit
      ? {
          title: resolve(
            vcs.kind === "git"
              ? surface === "web"
                ? msg("Commit & push to default ref?")
                : msg("Commit & push to default branch?")
              : msg("Commit & push to default {value0}?", { value0: ref }),
          ),
          description: resolve(
            vcs.kind === "git"
              ? surface === "web"
                ? msg(
                    'This action will commit and push changes on "{branch}". You can continue on this ref or create a feature ref and run the same action there.',
                    { branch: input.branchName },
                  )
                : msg(
                    'This action will commit and push changes on "{branch}". You can continue on this branch or create a feature branch and run the same action there.',
                    { branch: input.branchName },
                  )
              : msg(
                  'This action will commit and push changes on "{value0}". You can continue on this {value1} or create a feature {value1} and run the same action there.',
                  { value0: input.branchName, value1: ref },
                ),
          ),
          continueLabel: resolve(
            vcs.kind === "git"
              ? msg("Commit & push to {branch}", { branch: input.branchName })
              : msg("Commit & push to {value0}", { value0: input.branchName }),
          ),
        }
      : {
          title: resolve(
            vcs.kind === "git"
              ? surface === "web"
                ? msg("Push to default ref?")
                : msg("Push to default branch?")
              : msg("Push to default {value0}?", { value0: ref }),
          ),
          description: resolve(
            vcs.kind === "git"
              ? surface === "web"
                ? msg(
                    'This action will push local commits on "{branch}". You can continue on this ref or create a feature ref and run the same action there.',
                    { branch: input.branchName },
                  )
                : msg(
                    'This action will push local commits on "{branch}". You can continue on this branch or create a feature branch and run the same action there.',
                    { branch: input.branchName },
                  )
              : msg(
                  'This action will push local {changes} on "{value1}". You can continue on this {value2} or create a feature {value2} and run the same action there.',
                  {
                    changes: resolve(
                      msg("{kind, select, jj {changes} other {commits}}", {
                        kind: vcs.preserveReviewSectionTitles ? "jj" : "git",
                      }),
                    ),
                    value1: input.branchName,
                    value2: ref,
                  },
                ),
          ),
          continueLabel: resolve(
            vcs.kind === "git"
              ? msg("Push to {branch}", { branch: input.branchName })
              : msg("Push to {value0}", { value0: input.branchName }),
          ),
        };
  return input.includesCommit
    ? {
        title: resolve(
          vcs.kind === "git"
            ? surface === "web"
              ? msg(
                  "Commit, push & create {term, select, mr {MR} cr {change request} other {PR}} from default ref?",
                  { term: changeRequestTermKind(terminology) },
                )
              : msg("Commit, push & create {shortLabel} from default branch?", { shortLabel })
            : msg("Commit, push & create {value0} from default {value1}?", {
                value0: shortLabel,
                value1: ref,
              }),
        ),
        description: resolve(
          vcs.kind === "git"
            ? surface === "web"
              ? msg(
                  'This action will commit, push, and create a {term, select, mr {merge request} cr {change request} other {pull request}} on "{branch}". You can continue on this ref or create a feature ref and run the same action there.',
                  { term: changeRequestTermKind(terminology), branch: input.branchName },
                )
              : msg(
                  '{kind, select, pr {This action will commit, push, and create a PR on "{branch}". You can continue on this branch or create a feature branch and run the same action there.} mr {This action will commit, push, and create an MR on "{branch}". You can continue on this branch or create a feature branch and run the same action there.} generic {This action will commit, push, and create a change request on "{branch}". You can continue on this branch or create a feature branch and run the same action there.} other {This action will commit, push, and create {changeRequest} on "{branch}". You can continue on this branch or create a feature branch and run the same action there.}}',
                  {
                    kind: changeRequestKind(terminology),
                    changeRequest: terminology.shortLabelWithArticle,
                    branch: input.branchName,
                  },
                )
            : msg(
                'This action will commit, push, and create {value0} on "{value1}". You can continue on this {value2} or create a feature {value2} and run the same action there.',
                { value0: request, value1: input.branchName, value2: ref },
              ),
        ),
        continueLabel: resolve(
          vcs.kind === "git"
            ? surface === "web"
              ? msg(
                  "Commit, push & create {term, select, mr {MR} cr {change request} other {PR}}",
                  { term: changeRequestTermKind(terminology) },
                )
              : msg("Commit, push & create {shortLabel}", { shortLabel })
            : msg("Commit, push & create {shortLabel}", { shortLabel: shortLabel }),
        ),
      }
    : {
        title: resolve(
          vcs.kind === "git"
            ? surface === "web"
              ? msg(
                  "Push & create {term, select, mr {MR} cr {change request} other {PR}} from default ref?",
                  {
                    term: changeRequestTermKind(terminology),
                  },
                )
              : msg("Push & create {shortLabel} from default branch?", { shortLabel })
            : msg("Push & create {value0} from default {value1}?", {
                value0: shortLabel,
                value1: ref,
              }),
        ),
        description: resolve(
          vcs.kind === "git"
            ? surface === "web"
              ? msg(
                  'This action will push local commits and create a {term, select, mr {merge request} cr {change request} other {pull request}} on "{branch}". You can continue on this ref or create a feature ref and run the same action there.',
                  { term: changeRequestTermKind(terminology), branch: input.branchName },
                )
              : msg(
                  '{kind, select, pr {This action will push local commits and create a PR on "{branch}". You can continue on this branch or create a feature branch and run the same action there.} mr {This action will push local commits and create an MR on "{branch}". You can continue on this branch or create a feature branch and run the same action there.} generic {This action will push local commits and create a change request on "{branch}". You can continue on this branch or create a feature branch and run the same action there.} other {This action will push local commits and create {changeRequest} on "{branch}". You can continue on this branch or create a feature branch and run the same action there.}}',
                  {
                    kind: changeRequestKind(terminology),
                    changeRequest: terminology.shortLabelWithArticle,
                    branch: input.branchName,
                  },
                )
            : msg(
                'This action will push local {changes} and create {value1} on "{value2}". You can continue on this {value3} or create a feature {value3} and run the same action there.',
                {
                  changes: resolve(
                    msg("{kind, select, jj {changes} other {commits}}", {
                      kind: vcs.preserveReviewSectionTitles ? "jj" : "git",
                    }),
                  ),
                  value1: request,
                  value2: input.branchName,
                  value3: ref,
                },
              ),
        ),
        continueLabel: resolve(
          vcs.kind === "git"
            ? surface === "web"
              ? msg("Push & create {term, select, mr {MR} cr {change request} other {PR}}", {
                  term: changeRequestTermKind(terminology),
                })
              : msg("Push & create {shortLabel}", { shortLabel: terminology.shortLabel })
            : msg("Push & create {shortLabel}", { shortLabel: shortLabel }),
        ),
      };
}

export function resolveFeatureBranchUnavailableReason(
  input: {
    action: DefaultBranchConfirmableAction;
    branchName: string;
    hasWorkingTreeChanges: boolean;
    vcsTerminology?: VcsTerminology;
  },
  resolve: MFunctionType = mFallback,
): string | null {
  const vcs = input.vcsTerminology ?? localizedVcsTerminology(null, resolve);
  if (!input.hasWorkingTreeChanges) {
    return resolve(
      vcs.kind === "git"
        ? msg(
            "There are no changes to commit, so a feature branch can't be named. Create a branch yourself or continue on {branch}.",
            { branch: input.branchName },
          )
        : msg(
            "There are no changes to commit, so a feature {value0} can't be named. Create a {value0} yourself or continue on {value1}.",
            { value0: vcs.refNoun, value1: input.branchName },
          ),
    );
  }
  if (input.action === "push" || input.action === "create_pr") {
    return resolve(
      vcs.kind === "git"
        ? msg(
            "This action doesn't commit your changes, so a feature branch can't be named. Create a branch yourself or continue on {branch}.",
            { branch: input.branchName },
          )
        : msg(
            "This action doesn't commit your changes, so a feature {value0} can't be named. Create a {value0} yourself or continue on {value1}.",
            { value0: vcs.refNoun, value1: input.branchName },
          ),
    );
  }
  return null;
}

function changeRequestKind(
  terminology: ChangeRequestTerminology,
): "pr" | "mr" | "generic" | "other" {
  switch (terminology.shortLabelWithArticle) {
    case "a PR":
      return "pr";
    case "an MR":
      return "mr";
    case "a change request":
      return "generic";
    default:
      return "other";
  }
}

function changeRequestTermKind(terminology: ChangeRequestTerminology): "mr" | "cr" | "pr" {
  if (terminology.singular === "merge request") return "mr";
  if (terminology.singular === "change request") return "cr";
  return "pr";
}
