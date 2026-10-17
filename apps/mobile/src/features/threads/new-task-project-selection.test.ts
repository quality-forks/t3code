import { DEFAULT_SERVER_SETTINGS, EnvironmentId, ProjectId } from "@t3tools/contracts";
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { AsyncResult } from "effect/reactivity";
import { describe, expect, it, vi } from "vite-plus/test";
import type { ComposerDraft, ComposerDraftSettingsUpdate } from "../../state/use-composer-drafts";
import type { QueuedThreadMessage } from "../../state/thread-outbox";

import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import type { HomeProjectScope } from "../home/homeThreadList";
import {
  getProjectScopeSelectionTarget,
  newTaskDestination,
  resolveDraftProjectSelection,
  resolveEnvironmentProjectMatch,
} from "./new-task-project-selection";

const flowState = vi.hoisted(() => {
  Reflect.set(globalThis, "__DEV__", false);
  const draft: ComposerDraft = { text: "Keep chatting", attachments: [] };
  return {
    draft,
    status: {
      branchName: "main",
      vcs: { kind: "jj", unsupportedReason: "This workspace is unsupported" },
    },
    model: { instanceId: "codex", model: "gpt-5" },
  };
});

vi.mock("react-native", () => ({
  ActivityIndicator: () => null,
  Platform: { OS: "android" },
  Pressable: ({
    children,
    disabled,
    onPress,
  }: {
    children?: import("react").ReactNode;
    disabled?: boolean;
    onPress?: () => void;
  }) => createElement("button", { disabled, onClick: onPress }, children),
  ScrollView: "div",
  StyleSheet: { create: (styles: unknown) => styles },
  Text: "span",
  TextInput: () => null,
  View: "div",
}));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock("../../state/olderSettledShelf", () => ({ useOlderSettledCount: () => 0 }));
vi.mock("../../components/ui/Dialog", () => ({ alert: vi.fn() }));
vi.mock("../../components/ui/AppActivityIndicator", () => ({ AppActivityIndicator: () => null }));
vi.mock("expo", () => ({
  CodedError: class CodedError extends Error {},
  Platform: { OS: "android" },
  UnavailabilityError: class UnavailabilityError extends Error {},
  requireNativeModule: () => ({}),
  requireNativeView: () => () => null,
  requireOptionalNativeModule: () => null,
}));
vi.mock("expo-crypto", () => ({
  getRandomBytes: () => new Uint8Array(32),
}));
vi.mock("expo-secure-store", () => ({}));
vi.mock("expo-constants", () => ({ default: { expoConfig: null, manifest2: null } }));
vi.mock("../../state/presentation", () => ({
  environmentPresentations: { presentationsAtom: {} },
  useEnvironmentPresentation: () => ({ isReady: true, presentation: null }),
}));
vi.mock("../../state/environments", () => ({
  useEnvironments: () => ({ environments: [], presentationById: new Map() }),
}));
vi.mock("../../state/session", () => ({
  environmentSession: { sessionStateAtom: () => null },
}));
vi.mock("../../state/entities", () => ({
  useProjects: () => [makeProject("project")],
  useThreadShells: () => [],
  useEnvironmentServerConfig: () => ({
    providers: [],
    settings: { ...DEFAULT_SERVER_SETTINGS, defaultThreadEnvMode: "worktree" },
  }),
  useServerConfigs: () => new Map(),
}));
vi.mock("../../lib/modelOptions", () => ({
  buildModelOptions: () => [],
  groupByProvider: () => [],
  resolveDefaultableModelSelection: () => null,
  resolveNewTaskModelSelection: () => flowState.model,
  resolveSelectableModelSelection: () => flowState.model,
}));
vi.mock("../../state/atom-registry", () => ({
  appAtomRegistry: { get: () => AsyncResult.success(flowState.status) },
}));
vi.mock("../../state/projects", () => ({
  projectEnvironment: { readFile: vi.fn(), openScratch: vi.fn() },
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (target: unknown) => ({
    data: target === "status" ? flowState.status : null,
    error: null,
    isPending: false,
  }),
}));
vi.mock("../../state/use-composer-drafts", () => ({
  createNewTaskDraft: () => "new-task:test",
  useComposerDraft: () => flowState.draft,
  getComposerDraftSnapshot: () => flowState.draft,
  updateComposerDraftSettings: (_key: string, settings: ComposerDraftSettingsUpdate) => {
    flowState.draft = { ...flowState.draft, ...settings };
  },
  useStickyComposerModelSelection: () => null,
}));
vi.mock("../../state/queries", () => ({
  useBranches: () => ({ data: { isRepo: true }, isPending: false }),
  useDebouncedValue: (value: string) => value,
  usePaginatedBranches: () => ({
    refs: [{ name: "main", current: true, isDefault: true, worktreePath: null }],
    data: { nextCursor: null },
    isPending: false,
    isFetchingNextPage: false,
    refresh: vi.fn(),
    loadNext: vi.fn(),
  }),
}));
vi.mock("../../state/vcs", () => ({ vcsEnvironment: { status: () => "status" } }));
vi.mock("../../state/thread-outbox", () => ({
  flattenQueuedThreadMessages: () => [],
  threadOutboxManager: {},
}));
vi.mock("../../state/use-thread-outbox", () => ({
  useThreadOutboxMessages: () => ({}),
  holdEditingQueuedMessage: vi.fn(),
  releaseEditingQueuedMessage: vi.fn(),
}));
vi.mock("../../state/use-remote-environment-registry", () => ({
  useSavedRemoteConnections: () => ({ savedConnectionsById: {} }),
  useRemoteConnectionStatus: () => ({ connectedEnvironments: [] }),
  setPendingConnectionError: vi.fn(),
}));
vi.mock("../../state/project-grouping", () => ({
  useMobileProjectGroupingSettings: () => ({ sidebarProjectGroupingMode: "repository" }),
}));
vi.mock("./use-legacy-plan-mode-enabled", () => ({
  useLegacyPlanModeState: () => ({ enabled: false, loaded: true }),
}));

import { NewTaskFlowProvider, useNewTaskFlow } from "./new-task-flow-provider";

describe("unsupported new-task workspace recovery", () => {
  it.each(["saved", "default"])(
    "can leave an unsupported %s worktree choice and build a local chat task",
    async (source) => {
      Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
      flowState.draft = {
        text: "Keep chatting",
        attachments: [],
        ...(source === "saved"
          ? { workspaceSelection: { mode: "worktree", branch: "main", worktreePath: null } }
          : {}),
      };
      const container = document.createElement("div");
      const root = createRoot(container);
      const metadata = {
        threadId: "thread",
        commandId: "command",
        messageId: "message",
        createdAt: "2026-07-01T00:00:00.000Z",
      };
      function CaptureFlow() {
        const flow = useNewTaskFlow();
        const [message, setMessage] = useState<QueuedThreadMessage | null>(null);
        return createElement(
          "div",
          null,
          createElement("output", { "data-mode": true }, flow.workspaceMode),
          createElement("output", { "data-supported": true }, String(flow.vcsActionsSupported)),
          createElement(
            "button",
            { "data-local": true, onClick: () => flow.setWorkspaceMode("local") },
            "Use local",
          ),
          createElement(
            "button",
            { "data-worktree": true, onClick: () => flow.setWorkspaceMode("worktree") },
            "Use worktree",
          ),
          createElement(
            "button",
            {
              "data-create": true,
              onClick: () => setMessage(flow.buildPendingTaskMessage(metadata)),
            },
            "Create task",
          ),
          createElement("output", { "data-message": true }, message?.text ?? "blocked"),
          createElement("output", { "data-created-mode": true }, message?.creation?.workspaceMode),
        );
      }
      try {
        await act(async () =>
          root.render(createElement(NewTaskFlowProvider, null, createElement(CaptureFlow))),
        );
        expect(container.querySelector("[data-mode]")?.textContent).toBe("worktree");
        expect(container.querySelector("[data-supported]")?.textContent).toBe("false");
        await act(async () => container.querySelector<HTMLButtonElement>("[data-create]")!.click());
        expect(container.querySelector("[data-message]")?.textContent).toBe("blocked");
        await act(async () => {
          container.querySelector<HTMLButtonElement>("[data-local]")!.click();
          root.render(createElement(NewTaskFlowProvider, null, createElement(CaptureFlow)));
        });
        expect(container.querySelector("[data-mode]")?.textContent).toBe("local");
        await act(async () => container.querySelector<HTMLButtonElement>("[data-create]")!.click());
        expect(container.querySelector("[data-message]")?.textContent).toBe("Keep chatting");
        expect(container.querySelector("[data-created-mode]")?.textContent).toBe("local");
        await act(async () => {
          container.querySelector<HTMLButtonElement>("[data-worktree]")!.click();
          root.render(createElement(NewTaskFlowProvider, null, createElement(CaptureFlow)));
        });
        expect(container.querySelector("[data-mode]")?.textContent).toBe("local");
      } finally {
        await act(async () => root.unmount());
      }
    },
  );
});

function makeProject(
  id: string,
  environmentId = "environment",
  options: {
    readonly title?: string;
    readonly workspaceRoot?: string;
    readonly repositoryKey?: string;
  } = {},
): EnvironmentProject {
  return {
    environmentId: EnvironmentId.make(environmentId),
    id: ProjectId.make(id),
    title: options.title ?? id,
    workspaceRoot: options.workspaceRoot ?? `/work/${id}`,
    repositoryIdentity: options.repositoryKey
      ? {
          canonicalKey: options.repositoryKey,
          locator: {
            source: "git-remote",
            remoteName: "origin",
            remoteUrl: `https://${options.repositoryKey}.git`,
          },
        }
      : null,
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

function makeScope(projects: ReadonlyArray<EnvironmentProject>): HomeProjectScope {
  return {
    key: "github.com/t3tools/t3code",
    title: "T3 Code",
    representative: projects[0]!,
    projects,
    projectRefs: projects.map((project) => ({
      environmentId: project.environmentId,
      projectId: project.id,
    })),
  };
}

describe("getProjectScopeSelectionTarget", () => {
  it("prefers a connected copy of a project that spans environments", () => {
    const mac = makeProject("t3code", "mac");
    const server = makeProject("t3code", "server");
    const target = (connected: ReadonlyArray<string>, preferred: string | null = null) =>
      getProjectScopeSelectionTarget(
        makeScope([mac, server]),
        preferred === null ? null : EnvironmentId.make(preferred),
        new Set(connected.map((id) => EnvironmentId.make(id))),
      );
    expect(target(["server"])).toBe(server);
    expect(target(["server"], "mac")).toBe(server);
    expect(target(["mac", "server"], "server")).toBe(server);
    expect(target(["mac", "server"])).toBe(mac);
    // With nothing connected, the usual order still applies.
    expect(target([], "server")).toBe(server);
    expect(target([])).toBe(mac);
  });
});

describe("resolveEnvironmentProjectMatch", () => {
  it("follows the same repository onto the target machine", () => {
    const selected = makeProject("t3code", "mac", { repositoryKey: "github.com/t3tools/t3code" });
    const target = [
      makeProject("other", "server", { repositoryKey: "github.com/t3tools/other" }),
      makeProject("t3code-clone", "server", { repositoryKey: "github.com/t3tools/t3code" }),
    ];
    expect(resolveEnvironmentProjectMatch(target, selected)).toBe(target[1]);
  });

  it("falls back to workspace basename, then title, for unindexed projects", () => {
    const selected = makeProject("t3code", "mac", { workspaceRoot: "/Users/me/t3code" });
    const byBasename = [
      makeProject("other", "server"),
      makeProject("srv", "server", { workspaceRoot: "/home/me/t3code" }),
    ];
    expect(resolveEnvironmentProjectMatch(byBasename, selected)).toBe(byBasename[1]);

    const byTitle = [
      makeProject("other", "server"),
      makeProject("srv", "server", { title: "t3code" }),
    ];
    expect(resolveEnvironmentProjectMatch(byTitle, selected)).toBe(byTitle[1]);
  });

  it("does not treat a known different repository as a basename or title match", () => {
    const selected = makeProject("t3code", "mac", {
      repositoryKey: "github.com/t3tools/t3code",
      workspaceRoot: "/Users/me/t3code",
    });
    const fork = makeProject("fork", "server", {
      repositoryKey: "github.com/someone/t3code",
      title: "t3code",
      workspaceRoot: "/home/me/t3code",
    });
    const unindexed = makeProject("unindexed", "server", { workspaceRoot: "/srv/t3code" });
    expect(resolveEnvironmentProjectMatch([fork, unindexed], selected)).toBe(unindexed);
    expect(resolveEnvironmentProjectMatch([fork], selected)).toBe(fork);
  });
});

describe("resolveDraftProjectSelection", () => {
  const projects = [makeProject("t3code"), makeProject("t3code-2")];
  const draft = { incomingShareId: undefined, pickerClosed: false };

  it("opens the picker instead of auto-selecting the only project", () => {
    expect(resolveDraftProjectSelection(null, projects, [makeScope(projects)], draft)).toEqual({
      kind: "pick",
    });
  });

  it("selects the only logical project for shared content", () => {
    expect(
      resolveDraftProjectSelection(null, projects, [makeScope(projects)], {
        ...draft,
        incomingShareId: "share",
      }),
    ).toEqual({ kind: "select", project: projects[0] });
  });

  it("dismisses the draft when the first picker closes without a choice", () => {
    expect(
      resolveDraftProjectSelection(null, projects, [makeScope(projects)], {
        ...draft,
        pickerClosed: true,
      }),
    ).toEqual({ kind: "dismiss" });
  });

  it("keeps the draft when the picker closes after a choice", () => {
    expect(
      resolveDraftProjectSelection("environment:t3code-2", projects, [makeScope(projects)], {
        ...draft,
        pickerClosed: true,
      }),
    ).toEqual({ kind: "preserve" });
  });

  it("keeps a share draft asking for a project when its picker closes without a choice", () => {
    const scopes = [makeScope([projects[0]!]), makeScope([projects[1]!])];
    expect(
      resolveDraftProjectSelection(null, projects, scopes, {
        incomingShareId: "share",
        pickerClosed: true,
      }),
    ).toEqual({ kind: "pick" });
  });
});

describe("newTaskDestination", () => {
  const picker = { draft: { requestId: "request" } };

  function destination(options: {
    readonly useLastProject: boolean | undefined;
    readonly projects: ReadonlyArray<EnvironmentProject>;
    readonly current?: EnvironmentProject;
    readonly last?: { readonly environmentId: string; readonly projectId: string };
  }) {
    return newTaskDestination({
      projects: options.projects,
      requestId: "request",
      useLastProject: options.useLastProject,
      currentProject: options.current && {
        environmentId: options.current.environmentId,
        projectId: options.current.id,
      },
      lastProject: options.last,
    });
  }

  it("starts in the current thread's project ahead of the remembered one", () => {
    const projects = [makeProject("remembered"), makeProject("current", "other-environment")];
    expect(
      destination({
        useLastProject: true,
        projects,
        current: projects[1],
        last: { environmentId: "environment", projectId: "remembered" },
      }),
    ).toEqual({
      draft: { requestId: "request", environmentId: "other-environment", projectId: "current" },
    });
  });

  it("treats an unset preference as on", () => {
    const projects = [makeProject("first"), makeProject("current")];
    expect(destination({ useLastProject: undefined, projects, current: projects[1] })).toEqual({
      draft: { requestId: "request", environmentId: "environment", projectId: "current" },
    });
  });

  it("starts in the remembered project of its own environment when there is no current one", () => {
    const projects = [makeProject("chosen"), makeProject("chosen", "other-environment")];
    expect(
      destination({
        useLastProject: true,
        projects,
        last: { environmentId: "other-environment", projectId: "chosen" },
      }),
    ).toEqual({
      draft: { requestId: "request", environmentId: "other-environment", projectId: "chosen" },
    });
  });

  it("ignores a remembered project id from another environment", () => {
    expect(
      destination({
        useLastProject: true,
        projects: [makeProject("chosen")],
        last: { environmentId: "removed-environment", projectId: "chosen" },
      }),
    ).toEqual(picker);
  });

  it("opens the picker rather than the first project when nothing matches", () => {
    expect(
      destination({
        useLastProject: true,
        projects: [makeProject("first"), makeProject("second")],
        current: makeProject("removed"),
      }),
    ).toEqual(picker);
  });

  it("always opens the picker when the preference is off", () => {
    const only = makeProject("only");
    expect(
      destination({
        useLastProject: false,
        projects: [only],
        current: only,
        last: { environmentId: "environment", projectId: "only" },
      }),
    ).toEqual(picker);
  });
});
