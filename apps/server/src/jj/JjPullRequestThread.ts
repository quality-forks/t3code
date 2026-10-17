import * as Effect from "effect/Effect";
import * as Random from "effect/Random";

import {
  GitPullRequestMaterializationError,
  type GitPreparePullRequestThreadInput,
  type GitPreparePullRequestThreadResult,
  type GitManagerServiceError,
  type ServerSettings,
} from "@t3tools/contracts";
import { sourceControlDefinitions } from "../sourceControl/sourceControlDefinitions.ts";
import { isSshRemoteUrl } from "@t3tools/shared/sourceControl";

import type * as GitManager from "../git/GitManager.ts";
import {
  normalizePullRequestReference,
  pullRequestRepositoryKey,
  resolvePullRequestWorktreeLocalBranchName,
  toResolvedPullRequest,
} from "../sourceControl/ChangeRequestStep.ts";
import type { VcsWorkflowOps } from "../git/GitWorkflowService.ts";
import type * as ProjectSetupScriptRunner from "../project/ProjectSetupScriptRunner.ts";
import type * as SourceControlProviderRegistry from "../sourceControl/SourceControlProviderRegistry.ts";
import * as JjProcess from "../vcs/JjProcess.ts";
import {
  isPrivateImportBookmarkName,
  bookmarkNameArgument,
  exactStringPattern,
  localBookmarkRevset,
} from "../vcs/JjRevset.ts";
import type { JjVcsDriverShape } from "../vcs/JjVcsDriver.ts";
import type * as VcsProcess from "../vcs/VcsProcess.ts";
import { jjFailure, mapJjFailure } from "./JjFailure.ts";
import type { JjRefsOps } from "./JjRefs.ts";
import {
  assertBookmarkUsable,
  ensureJjRemote,
  trackRemoteBookmark,
  writeBookmarkUpstreamConfig,
} from "./JjRemotes.ts";
import type { JjWorkspaceOps } from "./JjWorkspaces.ts";

const FETCH_TIMEOUT_MS = 120_000;

export interface JjPullRequestThreadDeps {
  readonly driver: JjVcsDriverShape;
  readonly gitManager: GitManager.GitManager["Service"];
  readonly process: VcsProcess.VcsProcess["Service"];
  readonly refs: JjRefsOps;
  readonly workspaces: JjWorkspaceOps;
  readonly sourceControlProviders: SourceControlProviderRegistry.SourceControlProviderRegistry["Service"];
  readonly projectSetupScriptRunner: ProjectSetupScriptRunner.ProjectSetupScriptRunner["Service"];
  readonly invalidateStatus: (cwd: string) => Effect.Effect<void, never>;
  readonly readWorktreeSubmodules: (
    input: GitPreparePullRequestThreadInput,
  ) => Effect.Effect<ServerSettings["worktreeSubmodules"], never>;
}

export interface JjPullRequestThreadOps {
  readonly resolvePullRequest: VcsWorkflowOps["resolvePullRequest"];
  readonly preparePullRequestThread: (
    input: GitPreparePullRequestThreadInput,
  ) => Effect.Effect<GitPreparePullRequestThreadResult, GitManagerServiceError>;
}

export const makeJjPullRequestThread = (deps: JjPullRequestThreadDeps): JjPullRequestThreadOps => {
  const {
    driver,
    gitManager,
    invalidateStatus,
    process,
    projectSetupScriptRunner,
    readWorktreeSubmodules,
    refs,
    sourceControlProviders,
    workspaces,
  } = deps;

  const run = JjProcess.jjRunner(process);

  const cleanupTemporaryRef = Effect.fn("JjPullRequestThread.cleanupTemporaryRef")(function* (
    operation: string,
    cwd: string,
    gitDir: string,
    hostingCwd: string,
    temporaryRef: string,
  ) {
    for (const step of [
      JjProcess.colocatedGitCommand(process, operation, { gitDir, cwd: hostingCwd }, [
        "update-ref",
        "-d",
        temporaryRef,
      ]),
      run(operation, cwd, ["git", "import"]),
    ]) {
      const exit = yield* Effect.exit(step);
      if (exit._tag === "Failure") {
        yield* Effect.logWarning("Could not clean up temporary pull-request ref", {
          temporaryRef,
          cause: exit.cause,
        });
      }
    }
  });

  /** `gh`/`glab`/`az` read `.git/config` themselves, so hosting calls run from the main workspace. */
  const resolvePullRequest: JjPullRequestThreadOps["resolvePullRequest"] = Effect.fn(
    "JjPullRequestThread.resolvePullRequest",
  )(function* (input) {
    const operation = "JjPullRequestThread.resolvePullRequest";
    const paths = yield* driver
      .ensureUsable(operation, input.cwd)
      .pipe(mapJjFailure(operation, input.cwd, "This Jujutsu repository cannot be used."));
    return yield* gitManager.resolvePullRequest({ ...input, cwd: paths.mainWorkspaceRoot });
  });

  const preparePullRequestThread: JjPullRequestThreadOps["preparePullRequestThread"] = Effect.fn(
    "JjPullRequestThread.preparePullRequestThread",
  )(function* (input) {
    const operation = "JjPullRequestThread.preparePullRequestThread";

    const maybeRunSetupScript = (worktreePath: string) =>
      input.threadId === undefined
        ? Effect.void
        : projectSetupScriptRunner
            .runForThread({
              threadId: input.threadId,
              projectCwd: input.cwd,
              worktreePath,
            })
            .pipe(
              Effect.catch((cause) =>
                Effect.logWarning("JjWorkflow.preparePullRequestThread setup script failed", {
                  threadId: input.threadId,
                  worktreePath,
                  cause,
                }).pipe(Effect.asVoid),
              ),
            );

    return yield* Effect.gen(function* () {
      const paths = yield* driver
        .ensureUsable(operation, input.cwd)
        .pipe(mapJjFailure(operation, input.cwd, "This Jujutsu repository cannot be used."));
      const hostingCwd = paths.mainWorkspaceRoot;
      const provider = yield* sourceControlProviders.resolve({ cwd: hostingCwd });
      const summary = yield* provider.getChangeRequest({
        cwd: hostingCwd,
        reference: normalizePullRequestReference(input.reference),
      });
      const pullRequest = toResolvedPullRequest(summary);
      const localBranch = resolvePullRequestWorktreeLocalBranchName(
        {
          ...pullRequest,
          ...(summary.isCrossRepository !== undefined
            ? { isCrossRepository: summary.isCrossRepository }
            : {}),
        },
        new Set(),
      );

      if (isPrivateImportBookmarkName(localBranch)) {
        return yield* jjFailure(
          operation,
          input.cwd,
          "Temporary import bookmarks cannot be selected.",
        );
      }
      yield* assertBookmarkUsable(driver, operation, input.cwd, localBranch);
      const remoteName = yield* driver
        .resolvePrimaryRemoteName(input.cwd)
        .pipe(Effect.orElseSucceed(() => null));
      const bookmarks = yield* driver
        .listBookmarks(input.cwd)
        .pipe(mapJjFailure(operation, input.cwd, "Could not list Jujutsu bookmarks."));
      const headOnRemote =
        remoteName !== null &&
        bookmarks.some(
          (bookmark) => bookmark.name === pullRequest.headBranch && bookmark.remote === remoteName,
        );

      const sourceRepository =
        summary.isCrossRepository === true
          ? summary.headRepositoryNameWithOwner?.trim() || null
          : null;
      const changeRequestHeadRef = Effect.suspend(() => {
        const ref = sourceControlDefinitions
          .get(provider.kind)
          .changeRequestHeadRef?.(pullRequest.number);
        return ref === undefined
          ? Effect.fail(
              jjFailure(
                operation,
                input.cwd,
                "This host publishes no ref for a change request's head.",
              ),
            )
          : Effect.succeed(ref);
      });
      let sourceHeadCommitId: string | null = null;
      const importedSource = sourceRepository
        ? yield* Effect.gen(function* () {
            const cloneUrls = yield* provider.getRepositoryCloneUrls({
              cwd: hostingCwd,
              repository: sourceRepository,
            });
            const remotes = yield* driver
              .listRemotes(input.cwd)
              .pipe(mapJjFailure(operation, input.cwd, "Could not read repository remotes."));
            const primaryUrl = remotes.remotes.find((remote) => remote.name === remoteName)?.url;
            const sourceRemote = yield* ensureJjRemote({
              driver,
              process,
              cwd: input.cwd,
              operation,
              remoteName: sourceRepository.split("/")[0] ?? "fork",
              remoteUrl:
                primaryUrl && isSshRemoteUrl(primaryUrl) ? cloneUrls.sshUrl : cloneUrls.url,
            });
            const temporaryBookmark = `t3code/import/${(yield* Random.nextInt).toString(36)}${(yield* Random.nextInt).toString(36)}`;
            const temporaryRef = `refs/heads/${temporaryBookmark}`;
            const fetch = (remote: string, sourceRef: string) =>
              JjProcess.colocatedGitCommand(
                process,
                operation,
                { gitDir: paths.gitDir, cwd: hostingCwd },
                ["fetch", "--refmap=", "--", remote, `+${sourceRef}:${temporaryRef}`],
                { timeoutMs: FETCH_TIMEOUT_MS },
              );
            yield* Effect.gen(function* () {
              yield* fetch(sourceRemote, `refs/heads/${pullRequest.headBranch}`).pipe(
                Effect.catch((primaryCause) =>
                  (remoteName === null
                    ? Effect.fail(primaryCause)
                    : changeRequestHeadRef.pipe(Effect.flatMap((ref) => fetch(remoteName, ref)))
                  ).pipe(
                    Effect.mapError(
                      (fallbackCause) =>
                        new GitPullRequestMaterializationError({
                          cwd: input.cwd,
                          pullRequestNumber: pullRequest.number,
                          headRepository: sourceRepository,
                          headBranch: pullRequest.headBranch,
                          localBranch,
                          cause: new AggregateError(
                            [primaryCause, fallbackCause],
                            `Repository-head and pull-request-ref fetches both failed for pull request #${pullRequest.number}.`,
                            { cause: primaryCause },
                          ),
                        }),
                    ),
                  ),
                ),
              );
              yield* run(operation, input.cwd, ["git", "import"], {
                timeoutMs: FETCH_TIMEOUT_MS,
              }).pipe(
                mapJjFailure(operation, input.cwd, "Could not import the source repository head."),
              );
              sourceHeadCommitId =
                (yield* driver
                  .changeAt(input.cwd, localBookmarkRevset(temporaryBookmark))
                  .pipe(
                    mapJjFailure(
                      operation,
                      input.cwd,
                      "Could not read the source pull-request head.",
                    ),
                  ))?.commitId ?? null;
              const existingHead = yield* driver
                .changeAt(input.cwd, localBookmarkRevset(localBranch))
                .pipe(
                  mapJjFailure(operation, input.cwd, "Could not read the local pull-request head."),
                );
              const canAdvance =
                existingHead === null
                  ? true
                  : (yield* driver
                      .countRevset(
                        input.cwd,
                        `${localBookmarkRevset(localBranch)} & ::(${localBookmarkRevset(temporaryBookmark)})`,
                      )
                      .pipe(
                        mapJjFailure(operation, input.cwd, "Could not compare pull-request heads."),
                      )) > 0;
              // Import only the alias: a fork's head can be main, which must not move local main.
              if (canAdvance) {
                yield* writeBookmarkUpstreamConfig(process, {
                  cwd: input.cwd,
                  gitDir: paths.gitDir,
                  name: localBranch,
                  remoteName: sourceRemote,
                  remoteBranch: pullRequest.headBranch,
                });

                yield* run(operation, input.cwd, [
                  "bookmark",
                  existingHead === null ? "create" : "set",
                  bookmarkNameArgument(localBranch),
                  "-r",
                  localBookmarkRevset(temporaryBookmark),
                ]).pipe(
                  mapJjFailure(
                    operation,
                    input.cwd,
                    "Could not update the local pull-request head.",
                  ),
                );
              }
            }).pipe(
              Effect.ensuring(
                cleanupTemporaryRef(operation, input.cwd, paths.gitDir, hostingCwd, temporaryRef),
              ),
            );
            return true;
          })
        : false;

      if (
        !importedSource &&
        headOnRemote &&
        remoteName !== null &&
        localBranch === pullRequest.headBranch
      ) {
        yield* run(
          operation,
          input.cwd,
          [
            "git",
            "fetch",
            "--remote",
            exactStringPattern(remoteName),
            "--branch",
            exactStringPattern(pullRequest.headBranch),
          ],
          { timeoutMs: FETCH_TIMEOUT_MS },
        ).pipe(mapJjFailure(operation, input.cwd, "Could not fetch the pull request head."));
        yield* trackRemoteBookmark({
          process,
          operation,
          cwd: input.cwd,
          gitDir: paths.gitDir,
          remoteName,
          name: pullRequest.headBranch,
        });
      } else if (!importedSource) {
        // Import into a private bookmark before deciding whether the user's bookmark can move.
        if (remoteName === null) {
          return yield* jjFailure(
            operation,
            input.cwd,
            "This repository has no remote to fetch from.",
          );
        }
        const temporaryBookmark = `t3code/import/${(yield* Random.nextInt).toString(36)}${(yield* Random.nextInt).toString(36)}`;
        const temporaryRef = `refs/heads/${temporaryBookmark}`;
        let fetchedNamedHead = false;
        yield* Effect.gen(function* () {
          yield* changeRequestHeadRef.pipe(
            Effect.flatMap((ref) =>
              JjProcess.colocatedGitCommand(
                process,
                operation,
                { gitDir: paths.gitDir, cwd: paths.mainWorkspaceRoot },
                ["fetch", "--refmap=", "--", remoteName, `+${ref}:${temporaryRef}`],
                { timeoutMs: FETCH_TIMEOUT_MS },
              ),
            ),
            Effect.catch((cause) =>
              summary.isCrossRepository === true || pullRequest.state !== "open"
                ? Effect.fail(cause)
                : Effect.gen(function* () {
                    const remote = yield* JjProcess.colocatedGitCommand(
                      process,
                      operation,
                      { gitDir: paths.gitDir, cwd: paths.mainWorkspaceRoot },
                      ["config", "--get", `remote.${remoteName}.url`],
                    );
                    const remoteUrl = remote.stdout.trim();
                    const pullRequestKey = pullRequestRepositoryKey(pullRequest.url);
                    if (
                      remoteUrl.length === 0 ||
                      pullRequestKey === null ||
                      sourceControlDefinitions.canonicalRepositoryKey(pullRequestKey) !==
                        sourceControlDefinitions.canonicalRepositoryKey(
                          sourceControlDefinitions.repositoryKeyFromRemote(remoteUrl),
                        )
                    ) {
                      return yield* cause;
                    }
                    // Some hosts publish no pull ref. Only an open PR in this repository can
                    // safely use its named branch: a closed head may have moved since closing.
                    yield* JjProcess.colocatedGitCommand(
                      process,
                      operation,
                      { gitDir: paths.gitDir, cwd: hostingCwd },
                      [
                        "fetch",
                        "--refmap=",
                        "--",
                        remoteName,
                        `+refs/heads/${pullRequest.headBranch}:${temporaryRef}`,
                      ],
                      { timeoutMs: FETCH_TIMEOUT_MS },
                    );
                    fetchedNamedHead = true;
                  }),
            ),
            mapJjFailure(operation, input.cwd, "Could not fetch the pull request head."),
          );
          yield* run(operation, input.cwd, ["git", "import"], { timeoutMs: FETCH_TIMEOUT_MS }).pipe(
            mapJjFailure(operation, input.cwd, "Could not import the pull request head."),
          );
          const existingHead = yield* driver.changeAt(input.cwd, localBookmarkRevset(localBranch));
          if (
            existingHead !== null &&
            (yield* driver.countRevset(
              input.cwd,
              `${localBookmarkRevset(localBranch)} & ::(${localBookmarkRevset(temporaryBookmark)})`,
            )) === 0
          ) {
            return yield* jjFailure(
              operation,
              input.cwd,
              `Local bookmark ${localBranch} has work outside the pull-request head; it was left unchanged.`,
            );
          }
          yield* run(operation, input.cwd, [
            "bookmark",
            existingHead === null ? "create" : "set",
            bookmarkNameArgument(localBranch),
            "-r",
            localBookmarkRevset(temporaryBookmark),
          ]);
          if (fetchedNamedHead) {
            // Preserve ordinary named-head tracking, but publish the fetched snapshot to
            // the remote-tracking ref only after the local-work check has succeeded.
            yield* JjProcess.colocatedGitCommand(
              process,
              operation,
              { gitDir: paths.gitDir, cwd: hostingCwd },
              ["update-ref", `refs/remotes/${remoteName}/${pullRequest.headBranch}`, temporaryRef],
            );
            yield* run(operation, input.cwd, ["git", "import"]);
            yield* trackRemoteBookmark({
              process,
              operation,
              cwd: input.cwd,
              gitDir: paths.gitDir,
              remoteName,
              name: pullRequest.headBranch,
            });
          }
        }).pipe(
          mapJjFailure(operation, input.cwd, "Could not materialize the pull request head."),
          Effect.ensuring(
            cleanupTemporaryRef(operation, input.cwd, paths.gitDir, hostingCwd, temporaryRef),
          ),
        );
      }

      const headCommit = yield* driver
        .changeAt(input.cwd, localBookmarkRevset(localBranch))
        .pipe(mapJjFailure(operation, input.cwd, "Could not read the local pull-request head."));
      const pullRequestHeadCommitId = sourceHeadCommitId ?? headCommit?.commitId;

      const isOnPullRequestHead = (workspaceCwd: string) =>
        pullRequestHeadCommitId === undefined
          ? Effect.succeed(false)
          : driver.countRevset(workspaceCwd, `${pullRequestHeadCommitId} & ::@`).pipe(
              Effect.map((count) => count > 0),
              mapJjFailure(operation, workspaceCwd, "Could not read pull-request head ancestry."),
            );

      if (input.mode === "local") {
        // Never `gh pr checkout`: it writes a git ref and moves HEAD behind jj's back, leaving
        // the jj working copy stale.
        yield* refs.assertNoStrandedWork({
          cwd: input.cwd,
          operation,
          targetRefName: localBranch,
        });
        yield* run(operation, input.cwd, ["new", localBookmarkRevset(localBranch)], {
          timeoutMs: 60_000,
        }).pipe(mapJjFailure(operation, input.cwd, `Could not move onto ${localBranch}.`));
        return {
          pullRequest,
          branch: localBranch,
          worktreePath: null,
          isOnPullRequestHead: yield* isOnPullRequestHead(input.cwd),
        };
      }

      const worktree = yield* workspaces.createWorktree(
        {
          cwd: input.cwd,
          refName: localBranch,
          path: null,
        },
        { submodules: yield* readWorktreeSubmodules(input), localBookmark: true },
      );
      yield* maybeRunSetupScript(worktree.worktree.path);

      return {
        pullRequest,
        branch: worktree.worktree.refName,
        worktreePath: worktree.worktree.path,
        isOnPullRequestHead: yield* isOnPullRequestHead(worktree.worktree.path),
      };
    }).pipe(Effect.ensuring(invalidateStatus(input.cwd)));
  });

  return { resolvePullRequest, preparePullRequestThread };
};
