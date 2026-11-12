import { useThreadSelection } from "./use-thread-selection";
import { useSelectedThreadWorktree } from "./use-selected-thread-worktree";
import { useRepositoryVcs } from "./vcs";

export function useSelectedThreadVcs() {
  const { selectedThread } = useThreadSelection();
  const { selectedThreadCwd } = useSelectedThreadWorktree();
  return useRepositoryVcs(selectedThread?.environmentId ?? null, selectedThreadCwd);
}
