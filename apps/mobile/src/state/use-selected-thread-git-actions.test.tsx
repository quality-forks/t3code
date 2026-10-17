import { act, useEffect, useReducer } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AsyncResult } from "effect/reactivity";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { GIT_VCS_TERMINOLOGY } from "@t3tools/shared/vcs";

const harness = vi.hoisted(() => ({
  selection: {
    selectedThread: { environmentId: "environment-1", id: "thread-1" } as unknown,
    selectedThreadProject: { workspaceRoot: "/repo" } as unknown,
    selectedEnvironmentRuntime: { connectionState: "connected" } as unknown,
  },
  worktree: { selectedThreadCwd: "/repo" as string | null, selectedThreadWorktreePath: null },
  renderCount: 0,
  statusSubscriptions: [] as unknown[],
}));

vi.mock("./use-atom-command", () => ({
  useAtomCommand: () => async () => AsyncResult.success({}),
}));
vi.mock("./vcs", () => ({
  vcsEnvironment: { refreshStatus: "refreshStatus", status: (input: unknown) => input },
  vcsActionManager: { runStackedAction: () => "runStackedAction", track: vi.fn() },
}));
vi.mock("./sourceControl", () => ({
  sourceControlEnvironment: { discovery: () => "source-control-discovery" },
}));
vi.mock("./threads", () => ({ threadEnvironment: { updateMetadata: "updateMetadata" } }));
vi.mock("./queries", () => ({ useBranches: () => ({ data: null, refresh: () => {} }) }));
vi.mock("./query", () => ({
  useEnvironmentQuery: (atom: unknown) => {
    harness.statusSubscriptions.push(atom);
    return { data: { isRepo: true, vcs: { kind: "git" } } };
  },
}));
vi.mock("../lib/uuid", () => ({ uuidv4: () => "uuid" }));
vi.mock("./atom-registry", () => ({ appAtomRegistry: {} }));
vi.mock("./session", () => ({
  readEnvironmentScope: () => true,
  useEnvironmentScope: () => true,
}));
vi.mock("@effect/atom-react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@effect/atom-react")>()),
  useAtomMount: () => {},
}));
vi.mock("./use-remote-environment-registry", () => ({
  environmentConnectedAtom: () => null,
  setPendingConnectionError: () => {},
}));
vi.mock("./use-vcs-action-state", () => ({
  showGitActionResult: () => {},
  useVcsActionState: () => ({ currentLabel: null }),
}));
vi.mock("./use-thread-selection", () => ({
  useThreadSelection: () => {
    harness.renderCount += 1;
    if (harness.renderCount > 50) {
      throw new Error("Consumer rerendered more than 50 times");
    }
    return harness.selection;
  },
}));
vi.mock("./use-selected-thread-worktree", () => ({
  useSelectedThreadWorktree: () => harness.worktree,
}));

import { useSelectedThreadGitActions } from "./use-selected-thread-git-actions";
import { useSelectedThreadGitState } from "./use-selected-thread-git-state";

let root: Root | null = null;
let rerender: () => void = () => {};

function Consumer() {
  const [, bump] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    rerender = bump;
  });
  useSelectedThreadGitActions();
  return null;
}

function StateConsumer() {
  const state = useSelectedThreadGitState();
  expect(state.vcsTerminology).toBe(GIT_VCS_TERMINOLOGY);
  return null;
}

async function flush() {
  for (let index = 0; index < 5; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.selection = {
    selectedThread: { environmentId: "environment-1", id: "thread-1" },
    selectedThreadProject: { workspaceRoot: "/repo" },
    selectedEnvironmentRuntime: { connectionState: "connected" },
  };
  harness.worktree = { selectedThreadCwd: "/repo", selectedThreadWorktreePath: null };
  harness.renderCount = 0;
  harness.statusSubscriptions = [];
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

describe("useSelectedThreadGitActions", () => {
  it("uses the same full-status key for Git state terminology without a local-only probe", () => {
    root = createRoot(document.createElement("div"));
    act(() => root!.render(<StateConsumer />));
    expect(harness.renderCount).toBe(1);
    expect(harness.statusSubscriptions).toEqual([
      "source-control-discovery",
      { environmentId: "environment-1", input: { cwd: "/repo" } },
    ]);
  });

  it("reuses the plain Git full-status key without an extra local-only probe", async () => {
    root = createRoot(document.createElement("div"));
    act(() => root!.render(<Consumer />));
    await flush();

    expect(harness.statusSubscriptions.length).toBe(harness.renderCount);
    expect(harness.statusSubscriptions).toEqual(
      Array.from({ length: harness.renderCount }, () => ({
        environmentId: "environment-1",
        input: { cwd: "/repo" },
      })),
    );
    harness.statusSubscriptions = [];
    harness.renderCount = 0;
    harness.worktree = {
      selectedThreadCwd: "/repo/.t3/worktrees/feature",
      selectedThreadWorktreePath: null,
    };
    act(() => rerender());
    await flush();
    expect(harness.statusSubscriptions.length).toBe(harness.renderCount);
    expect(harness.statusSubscriptions).toEqual(
      Array.from({ length: harness.renderCount }, () => ({
        environmentId: "environment-1",
        input: { cwd: "/repo/.t3/worktrees/feature" },
      })),
    );
  });
});
