import { Var } from "gt-react";
import { T } from "gt-react";
import { useContext } from "react";
import { VcsTerminologyContext } from "../state/vcs";
import { HistoryIcon } from "lucide-react";

import { MiddleTruncate } from "./ui/middle-truncate";

export function PreviousWorktreeItemContent({ branch }: { branch: string | null }) {
  const terminology = useContext(VcsTerminologyContext);
  return (
    <span className="flex min-w-0 items-start gap-1.5">
      <HistoryIcon className="mt-1 size-3" />
      <span className="flex min-w-0 flex-col">
        <span>
          <>
            {terminology.kind === "git" ? (
              <T>Previous worktree</T>
            ) : (
              <T>
                Previous <Var>{terminology.workspaceNoun}</Var>
              </T>
            )}
          </>
        </span>
        {branch ? (
          <span className="min-w-0 text-xs text-muted-foreground">
            <MiddleTruncate value={branch} />
          </span>
        ) : null}
      </span>
    </span>
  );
}
