import type { VcsStatusResult } from "@t3tools/contracts";
import type { AppBarMenu, AppBarProps } from "../../components/ui/AppBar.types";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const harness = vi.hoisted(() => ({
  renderedMenus: [] as Array<ReadonlyArray<AppBarMenu>>,
  navigatedRoutes: [] as string[],
  openedPullRequests: [] as string[],
}));

vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({
    navigate: (route: string) => {
      harness.navigatedRoutes.push(route);
    },
  }),
}));
vi.mock("../layout/workspace/useAndroidWorkspaceNavigation", () => ({
  useWorkspaceBackNavigation: () => () => {},
}));
vi.mock("../../native/useOpenPullRequest", () => ({
  useOpenPullRequest: () => async (url: string) => {
    harness.openedPullRequests.push(url);
    return true;
  },
}));

vi.mock("../../state/session", () => ({ useEnvironmentScope: () => true }));
vi.mock("../../components/ui/AppBar", () => ({
  AppBar: (props: AppBarProps) => {
    harness.renderedMenus.push(props.menus ?? []);
    return null;
  },
}));
vi.mock("react-native", () => ({ Alert: { alert: () => {} }, Linking: {}, Platform: {} }));
vi.mock("../layout/AdaptiveWorkspaceLayout", () => ({
  useAdaptiveWorkspaceLayout: () => ({
    panes: { auxiliaryPaneVisible: false },
    toggleAuxiliaryPane: () => {},
    composerKeyboardActive: false,
    startNewTask: () => {},
  }),
}));

import { ThreadHeader } from "./ThreadHeader";

const projectScripts: never[] = [];

function status(
  files: ReadonlyArray<string>,
  overrides: Partial<VcsStatusResult> = {},
): VcsStatusResult {
  return {
    isRepo: true,
    hasPrimaryRemote: false,
    isDefaultRef: true,
    refName: "master",
    hasWorkingTreeChanges: files.length > 0,
    workingTree: {
      files: files.map((path) => ({ path, insertions: 0, deletions: 0 })),
      insertions: 0,
      deletions: 0,
    },
    hasUpstream: false,
    aheadCount: 0,
    behindCount: 0,
    pr: null,
    ...overrides,
  } as unknown as VcsStatusResult;
}

function Header(props: { readonly gitStatus: VcsStatusResult | null; readonly title?: string }) {
  return (
    <ThreadHeader
      title={props.title ?? "Thread"}
      subtitle=""
      gitControls={{
        environmentId: "environment-1",
        threadId: "thread-1",
        currentBranch: "master",
        gitStatus: props.gitStatus,
        gitOperationLabel: null,
        onPull: async () => {},
        onRunAction: async () => null,
        canOpenTerminal: true,
        canOperateTerminal: true,
        canOpenFiles: true,
        projectScripts,
        terminalSessions: [],
        onOpenTerminal: () => {},
        onOpenNewTerminal: () => {},
        onRunProjectScript: async () => {},
      }}
      hasThreadCwd
      inspectorMode={null}
      onOpenFilesInspector={() => {}}
    />
  );
}

function renderedGitMenuItems() {
  const menus = harness.renderedMenus.at(-1) ?? [];
  const git = menus.find((menu) => menu.items.some((item) => item.id === "git-quick-action"));
  return (git?.items ?? []).flatMap((item) => ("onPress" in item ? [item] : []));
}

let root: Root | null = null;

function render(element: React.ReactElement) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  root ??= createRoot(document.createElement("div"));
  act(() => root!.render(element));
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  harness.renderedMenus = [];
  harness.navigatedRoutes = [];
  harness.openedPullRequests = [];
});

describe("ThreadHeader", () => {
  it("opens the existing PR from the clean synced Git quick action", async () => {
    const url = "https://example.com/pr/1";
    render(
      <Header
        gitStatus={status([], {
          hasPrimaryRemote: true,
          hasUpstream: true,
          pr: { state: "open", url },
        } as Partial<VcsStatusResult>)}
      />,
    );
    expect(renderedGitMenuItems()[1]?.title).toBe("View PR");
    await act(async () => renderedGitMenuItems()[1]?.onPress?.());
    expect(harness.openedPullRequests).toEqual([url]);
    expect(harness.navigatedRoutes).toEqual([]);
  });
});
