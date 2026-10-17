import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";

export const makePrivateObjectStore = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  hostPlatform: string,
) => {
  // Makes Git write new objects to `privateObjects` and read the repository's. Lists every object
  // directory Git resolved (`count-objects -v` output) flat, since nesting the repository's objects
  // one level deeper can pass Git's depth limit.
  const privateObjectDirectoryEnv = (
    privateObjects: string,
    repositoryObjects: string,
    countObjects: string,
  ) => {
    // Git prints an entry C-quoted when it needs quoting; quote the rest the same way, so a
    // path holding the list separator stays one entry (Git 2.11.1+).
    const quoted = (entry: string) =>
      entry.startsWith('"') ? entry : `"${entry.replace(/[\\"]/g, "\\$&")}"`;
    const alternates = [
      repositoryObjects,
      ...countObjects
        .split("\n")
        .flatMap((line) =>
          line.startsWith("alternate: ") ? [line.slice("alternate: ".length)] : [],
        ),
    ];
    return {
      GIT_OBJECT_DIRECTORY: privateObjects,
      GIT_ALTERNATE_OBJECT_DIRECTORIES: alternates
        .map(quoted)
        .join(hostPlatform === "win32" ? ";" : ":"),
    } satisfies NodeJS.ProcessEnv;
  };

  // Moves finished packs and loose objects into the repository, as Git's own quarantine does. A
  // pack's index goes last: Git reads a pack as soon as it sees the index.
  const adoptPrivateObjects = Effect.fn("GitVcsDriver.adoptPrivateObjects")(function* (
    privateObjects: string,
    repositoryObjects: string,
  ) {
    for (const directory of yield* fileSystem.readDirectory(privateObjects)) {
      if (directory !== "pack" && !/^[0-9a-f]{2}$/.test(directory)) continue;
      const names = (yield* fileSystem.readDirectory(path.join(privateObjects, directory)))
        .filter((name) => !name.startsWith("tmp_"))
        .toSorted((a, b) => Number(a.endsWith(".idx")) - Number(b.endsWith(".idx")));
      if (names.length === 0) continue;
      yield* fileSystem.makeDirectory(path.join(repositoryObjects, directory), { recursive: true });
      for (const name of names) {
        const target = path.join(repositoryObjects, directory, name);
        if (yield* fileSystem.exists(target)) continue;
        yield* fileSystem.rename(path.join(privateObjects, directory, name), target);
      }
    }
  });

  return { privateObjectDirectoryEnv, adoptPrivateObjects };
};
