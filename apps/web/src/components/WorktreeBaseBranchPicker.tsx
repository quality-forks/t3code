import { useGT } from "gt-react";
import { useMessages as useVcsMessages } from "gt-react";
import { msg as vcsMsg } from "gt-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { useMessages } from "gt-react";
import { ChevronDownIcon, GitBranchIcon } from "lucide-react";
import { useState } from "react";

import { usePaginatedBranches } from "../state/queries";
import { useEnvironmentQuery } from "../state/query";
import { useAtomCommand } from "../state/use-atom-command";
import { useVcsTerminology, VcsTerminologyContext, vcsEnvironment } from "../state/vcs";
import { BranchPicker, BranchPickerRefItem } from "./BranchPicker";
import { resolveBranchTriggerLabel, sanitizeNewRefName } from "./BranchToolbar.logic";
import { MiddleTruncate } from "./ui/middle-truncate";
import { Button } from "./ui/button";
import { ComboboxTrigger } from "./ui/combobox";

export function WorktreeBaseBranchPicker({
  environmentId,
  cwd,
  value,
  onValueChange,
  startFromOrigin,
  onStartFromOriginChange,
  disabled = false,
  id,
}: {
  environmentId: EnvironmentId;
  cwd: string | null;
  value: string;
  onValueChange: (branch: string) => void;
  startFromOrigin: boolean;
  onStartFromOriginChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
}) {
  const vcsMessage = useVcsMessages();
  const gt = useGT();
  const messages = useMessages();
  const terminology = useVcsTerminology(environmentId, cwd);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const refreshLocalStatusForPicker = useAtomCommand(vcsEnvironment.refreshLocalStatusForPicker, {
    reportFailure: false,
  });
  const branches = usePaginatedBranches(
    {
      environmentId,
      cwd,
      query: sanitizeNewRefName(query.trim()),
    },
    messages,
  );
  const selectedRefQuery = useEnvironmentQuery(
    cwd && value
      ? vcsEnvironment.listRefs({
          environmentId,
          input: { cwd, query: value, limit: 10 },
        })
      : null,
  );
  const selectedRef =
    branches.refs.find((branch) => branch.name === value) ??
    selectedRefQuery.data?.refs.find((branch) => branch.name === value);
  const label = resolveBranchTriggerLabel(
    {
      activeWorktreePath: null,
      effectiveEnvMode: "worktree",
      resolvedActiveBranch: value || null,
      resolvedActiveBranchIsRemote: selectedRef ? selectedRef.isRemote === true : null,
      startFromOrigin,
    },
    messages,
  );
  const branchByName = new Map(branches.refs.map((branch) => [branch.name, branch]));
  const items = [...branchByName.keys()];
  const hasNextPage = branches.data?.nextCursor != null;
  const statusText =
    branches.error ??
    (branches.isPending && branches.data === null
      ? terminology.kind === "git"
        ? gt("Loading refs...")
        : vcsMessage(vcsMsg("Loading {value0}...", { value0: terminology.genericRefNounPlural }))
      : branches.isFetchingNextPage
        ? terminology.kind === "git"
          ? gt("Loading more refs...")
          : vcsMessage(
              vcsMsg("Loading more {value0}...", { value0: terminology.genericRefNounPlural }),
            )
        : hasNextPage
          ? terminology.kind === "git"
            ? gt(
                "{total, plural, one {Showing {shown} of {total} refs} other {Showing {shown} of {total} refs}}",
                {
                  shown: branches.refs.length,
                  total: String(branches.data?.totalCount),
                },
              )
            : vcsMessage(
                vcsMsg("Showing {value0} of {value1} {value2}", {
                  value0: branches.refs.length,
                  value1: branches.data?.totalCount,
                  value2: terminology.genericRefNounPlural,
                }),
              )
          : null);
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && !open && cwd !== null) {
      void refreshLocalStatusForPicker({ environmentId, input: { cwd } });
    }
    if (!next) setQuery("");
  };
  return (
    <VcsTerminologyContext value={terminology}>
      <BranchPicker
        items={items}
        filteredItems={items}
        value={value || null}
        query={query}
        onQueryChange={setQuery}
        open={open && !disabled}
        onOpenChange={handleOpenChange}
        onSelectItem={(name) => {
          onValueChange(name);
          handleOpenChange(false);
        }}
        hasNextPage={hasNextPage}
        isFetchingNextPage={branches.isFetchingNextPage}
        onLoadNext={branches.loadNext}
        statusText={statusText}
        originControl={{ checked: startFromOrigin, onCheckedChange: onStartFromOriginChange }}
        popupProps={{ align: "start", side: "bottom", className: "flex w-80 flex-col" }}
        renderItem={(name, index) => {
          const branch = branchByName.get(name);
          return branch ? (
            <BranchPickerRefItem
              branch={branch}
              projectCwd={cwd}
              index={index}
              onClick={() => {
                onValueChange(branch.name);
                handleOpenChange(false);
              }}
            />
          ) : null;
        }}
      >
        <ComboboxTrigger
          id={id}
          disabled={disabled || !cwd}
          render={<Button variant="outline" size="sm" />}
          className="w-full justify-between "
        >
          <GitBranchIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <MiddleTruncate value={label} className="flex-1 text-left" />
          <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
        </ComboboxTrigger>
      </BranchPicker>
    </VcsTerminologyContext>
  );
}
