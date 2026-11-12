import { useMessages as useVcsMessages } from "gt-react-native";
import { localizedVcsTerminology } from "@t3tools/client-runtime/state/vcs";
import { msg as vcsMsg } from "gt-react-native";
import { uuidv4 } from "../../lib/uuid";
import * as Dialog from "../../components/ui/Dialog";
import { useNavigation } from "@react-navigation/native";
import { vcsActionLabelText } from "@t3tools/client-runtime/state/vcs";
import { useGT, useMessages } from "gt-react-native";
import { AsyncResult } from "effect/reactivity";
import * as Cause from "effect/Cause";
import { AuthFilesystemReadScope, AuthSourceControlWriteScope } from "@t3tools/contracts";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import { useEnvironmentQuery } from "../../state/query";
import { useEnvironmentScope } from "../../state/session";
import { useAtomCommand } from "../../state/use-atom-command";
import { vcsActionManager, vcsEnvironment } from "../../state/vcs";
import { useVcsActionState } from "../../state/use-vcs-action-state";
import { ThreadHeader } from "./ThreadHeader";
import { supportsVcsActions } from "@t3tools/shared/vcs";
import { vcsOperationErrorMessage } from "@t3tools/client-runtime/errors";
import { workspaceBaseLabel } from "@t3tools/client-runtime/worktree-setup";

export function DraftThreadHeader(props: {
  readonly thread: EnvironmentThreadShell;
  readonly project: EnvironmentProject;
  readonly cwd: string | null;
}) {
  const vcsMessage = useVcsMessages();
  const gt = useGT();
  const messages = useMessages();
  const navigation = useNavigation();
  const environmentId = props.thread.environmentId;
  const canReadFiles = useEnvironmentScope(environmentId, AuthFilesystemReadScope);
  const canWriteGit = useEnvironmentScope(environmentId, AuthSourceControlWriteScope);
  const status = useEnvironmentQuery(
    props.cwd ? vcsEnvironment.status({ environmentId, input: { cwd: props.cwd } }) : null,
  );
  const target = { environmentId, cwd: props.cwd };
  const progress = useVcsActionState(target);
  const runAction = useAtomCommand(vcsActionManager.runStackedAction(target), {
    reportFailure: false,
  });
  const pull = useAtomCommand(vcsEnvironment.pull, { reportFailure: false });
  const openFiles = () => {
    if (!props.cwd || !canReadFiles) return;
    navigation.navigate("NewTaskFiles", {
      environmentId,
      cwd: props.cwd,
      projectName: props.project.title,
    });
  };
  const requiresThread = () =>
    Dialog.alert(gt("Available after the first message"), gt("This action needs a saved thread."));
  return (
    <ThreadHeader
      draft
      title={gt("New thread")}
      subtitle=""
      hasThreadCwd={props.cwd !== null}
      inspectorMode={null}
      onOpenFilesInspector={openFiles}
      gitControls={{
        environmentId,
        threadId: props.thread.id,
        hasThread: false,
        tracksRepositories: (props.project.trackedFolders?.length ?? 0) > 0,
        currentBranch:
          props.thread.branch === null
            ? null
            : workspaceBaseLabel(props.thread.branch, status.data?.vcs?.kind === "jj", messages),
        gitStatus: status.data,
        gitOperationLabel: vcsActionLabelText(progress, messages),
        canOpenTerminal: false,
        canOperateTerminal: false,
        canOpenFiles: canReadFiles && props.cwd !== null,
        projectScripts: [],
        terminalSessions: [],
        onOpenFilesInspector: openFiles,
        onOpenGitInspector: requiresThread,
        onOpenTerminal: requiresThread,
        onOpenNewTerminal: requiresThread,
        onRunProjectScript: async () => {
          requiresThread();
        },
        onPull: async () => {
          if (!canWriteGit || !props.cwd || !supportsVcsActions(status.data)) return;
          const result = await pull({ environmentId, input: { cwd: props.cwd } });
          if (AsyncResult.isFailure(result))
            Dialog.alert(
              gt("Could not pull"),
              vcsOperationErrorMessage(Cause.squash(result.cause), gt("Could not pull."), messages),
            );
        },
        onRunAction: async (input) => {
          if (!canWriteGit || !props.cwd || !supportsVcsActions(status.data)) return null;
          const result = await runAction({
            ...input,
            projectId: props.project.id,
            actionId: uuidv4(),
          });
          if (AsyncResult.isFailure(result)) {
            Dialog.alert(
              localizedVcsTerminology(status.data, messages).kind === "git"
                ? gt("Git action failed")
                : vcsMessage(
                    vcsMsg("{value0} action failed", {
                      value0: localizedVcsTerminology(status.data, messages).systemName,
                    }),
                  ),
              vcsOperationErrorMessage(
                Cause.squash(result.cause),
                gt("Source control action failed."),
                messages,
              ),
            );
            return null;
          }
          return result.value;
        },
      }}
    />
  );
}
