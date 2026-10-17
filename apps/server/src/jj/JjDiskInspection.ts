import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as JjProcess from "../vcs/JjProcess.ts";
import type * as VcsProcess from "../vcs/VcsProcess.ts";

class DiskInspectionError extends Schema.TaggedError<DiskInspectionError>()("DiskInspectionError", {
  message: Schema.String,
}) {}

const cleanupGitCommand = Effect.fn("JjDiskInspection.gitCommand")(function* (
  ...args: Parameters<typeof JjProcess.colocatedGitCommand>
) {
  const result = yield* JjProcess.colocatedGitCommand(...args);
  if (result.stdoutTruncated || result.stderrTruncated || result.stderr.trim() !== "") {
    return yield* new DiskInspectionError({
      message: "Git inspection produced warnings or incomplete output; workspace kept.",
    });
  }
  return result;
});

export const inspectDisk = Effect.fn("JjDiskInspection.inspectDisk")(function* (
  process: VcsProcess.VcsProcess["Service"],
  gitPaths: JjProcess.ColocatedGitInput,
  commitId: string,
  options: { readonly submodules?: "refuse" | "allow-uninitialized" } = {},
) {
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const temporary = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-jj-cleanup-index-",
      });
      const env = { GIT_INDEX_FILE: path.join(temporary, "index") };
      const operation = "JjDiskInspection.inspectDisk";
      yield* cleanupGitCommand(process, operation, gitPaths, ["read-tree", commitId], {
        env,
      });
      // jj does not manage submodule worktrees. Only manual removal may prove
      // that a gitlink has no worktree or repository state to preserve.
      const index = yield* cleanupGitCommand(
        process,
        operation,
        gitPaths,
        ["ls-files", "--stage", "-z"],
        // Stage records include object ids and paths: allow millions of entries,
        // including SHA-256 ids/longer paths. Stay below V8's string-length limit
        // so truncation can still fail closed instead of failing during decoding.
        { env, maxOutputBytes: 16 * 1024 * 1024 },
      );
      if (index.stdoutTruncated || index.stderrTruncated || index.stderr.trim() !== "")
        return "submodules could not be inspected";
      // Stage records are NUL-delimited; tabs/newlines in paths are not record boundaries.
      for (let offset = 0; offset < index.stdout.length;) {
        const end = index.stdout.indexOf("\0", offset);
        if (end === -1) return "submodules could not be inspected";
        if (index.stdout.startsWith("160000 ", offset)) {
          if (options.submodules !== "allow-uninitialized") return "has submodules";
          const tab = index.stdout.indexOf("\t", offset);
          if (tab === -1 || tab >= end || gitPaths.workTree === undefined)
            return "submodules could not be inspected";
          const relative = index.stdout.slice(tab + 1, end);
          const parts = relative.split("/");
          if (parts.some((part) => part === "" || part === "." || part === ".."))
            return "submodules could not be inspected";
          let current = gitPaths.workTree;
          for (const [position, part] of parts.entries()) {
            current = path.join(current, part);
            const state = yield* fileSystem.lstat(current).pipe(
              Effect.map((info) => info.type),
              Effect.catchIf(
                (error) => error.reason._tag === "NotFound",
                () => Effect.succeed("Absent" as const),
              ),
            );
            if (state === "Absent") break;
            // Never inspect through a symlink, including an intermediate directory.
            if (state !== "Directory") return "has initialized or uncertain submodules";
            if (
              position === parts.length - 1 &&
              (yield* fileSystem.readDirectory(current)).length > 0
            )
              return "has initialized or nonempty submodules";
          }
        }
        offset = end + 1;
      }
      const tracked = yield* cleanupGitCommand(
        process,
        operation,
        gitPaths,
        ["diff", "--quiet", "--ignore-submodules=none", commitId, "--"],
        { env, allowNonZeroExit: true },
      );
      if (tracked.exitCode !== 0 || tracked.stderr.trim() !== "" || tracked.stderrTruncated)
        return "has unsnapshotted tracked changes or could not verify tracked files";
      const listed = yield* cleanupGitCommand(
        process,
        operation,
        gitPaths,
        ["ls-files", "--others", "--exclude-standard", "--directory", "--no-empty-directory", "-z"],
        { env, maxOutputBytes: 1024 * 1024 },
      );
      if (listed.stdoutTruncated || listed.stderrTruncated || listed.stderr.trim() !== "")
        return "local files exceed the inspection limit";
      const file = listed.stdout
        .split("\0")
        .find(
          (entry) =>
            entry !== "" &&
            entry !== ".git" &&
            entry !== ".jj" &&
            !entry.startsWith(".jj/") &&
            !entry.startsWith(".git/"),
        );
      if (file !== undefined) return `has untracked files (${file})`;
      return null;
    }),
  );
});
