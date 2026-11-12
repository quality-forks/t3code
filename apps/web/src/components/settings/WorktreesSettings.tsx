import { useMessages as useVcsMessages } from "gt-react";
import { msg as vcsMsg } from "gt-react";
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";

import { AdvancedSettings } from "./AdvancedSettings";
import { BranchNamingSettings } from "./BranchNamingSettings";
import { WorktreeSubmodulesRow } from "./ProjectDefaultsSettings";
import { ScopedSwitch } from "./ScopedSwitch";
import { useSettingsScope } from "./SettingsScopeContext";
import {
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import { useSearchableSetting } from "./settingsSearch";
import { useSettingsVcsTerminology } from "./useSettingsVcsTerminology";

import { WorktreeCleanupSection, WorktreesDirectoryRow } from "./StorageSettings";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";

function StartFromRemoteRow() {
  const vcsMessage = useVcsMessages();
  const gt = useGT();
  const searchableSetting = useSearchableSetting();
  const terminology = useSettingsVcsTerminology();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  return (
    <SettingsRow
      serverScoped
      settingKeys={["newWorktreesStartFromOrigin"]}
      {...searchableSetting("start-from-origin")}
      description={
        terminology.kind === "git"
          ? gt(
              "Uses the latest commit of the base branch’s tracked remote branch, even if its name differs. Otherwise uses the same-named branch on origin. Uses your local branch if that remote branch is missing.",
            )
          : vcsMessage(
              vcsMsg(
                "Uses the latest commit of the base {value0}’s tracked remote {value0}, even if its name differs. Otherwise uses the same-named {value0} on origin. Uses your local {value0} if that remote {value0} is missing.",
                { value0: terminology.refNoun },
              ),
            )
      }
      resetAction={
        settings.newWorktreesStartFromOrigin !==
        DEFAULT_UNIFIED_SETTINGS.newWorktreesStartFromOrigin ? (
          <SettingResetButton
            ariaLabel={
              terminology.kind === "git"
                ? gt("Reset new worktrees start from remote to default")
                : vcsMessage(
                    vcsMsg("new {value0} start from remote", {
                      value0: terminology.workspaceNounPlural,
                    }),
                  )
            }
            onClick={() =>
              updateSettings({
                newWorktreesStartFromOrigin: DEFAULT_UNIFIED_SETTINGS.newWorktreesStartFromOrigin,
              })
            }
          />
        ) : null
      }
      control={
        <ScopedSwitch
          settingKeys={["newWorktreesStartFromOrigin"]}
          checked={settings.newWorktreesStartFromOrigin}
          onCheckedChange={(checked) =>
            updateSettings({ newWorktreesStartFromOrigin: Boolean(checked) })
          }
          aria-label={
            terminology.kind === "git"
              ? gt("Start new worktrees from remote by default")
              : vcsMessage(
                  vcsMsg("Start new {value0} from remote by default", {
                    value0: terminology.workspaceNounPlural,
                  }),
                )
          }
        />
      }
    />
  );
}

export function WorktreesSettingsPanel() {
  const gt = useGT();
  const searchableSetting = useSearchableSetting();
  const terminology = useSettingsVcsTerminology();
  const { scope } = useSettingsScope();
  const isProjectScope = scope.kind === "project" || scope.kind === "checkout";

  return (
    <SettingsPageContainer>
      <SettingsSection
        id="worktree-creation"
        title={gt("Creation", { $context: "settings section about creating worktrees" })}
      >
        {!isProjectScope && <WorktreesDirectoryRow />}
        <StartFromRemoteRow />
        <AdvancedSettings targetIds={[searchableSetting("worktree-submodules").id]}>
          <WorktreeSubmodulesRow />
        </AdvancedSettings>
      </SettingsSection>
      <SettingsSection id="worktree-branches" title={terminology.refNounPluralTitle}>
        <BranchNamingSettings />
      </SettingsSection>
      <WorktreeCleanupSection />
    </SettingsPageContainer>
  );
}
import { useGT } from "gt-react";
