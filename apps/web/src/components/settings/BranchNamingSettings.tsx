import { useMessages as useVcsMessages } from "gt-react";
import { msg as vcsMsg } from "gt-react";
import { msg, useGT, useMessages } from "gt-react";
import { useSettingsVcsTerminology } from "./useSettingsVcsTerminology";
import { useRef } from "react";
import { BranchNamingMode, DEFAULT_SERVER_SETTINGS } from "@t3tools/contracts";

import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { SettingsRow, SettingResetButton } from "./settingsLayout";
import { useSettingsScope } from "./SettingsScopeContext";
import { useSearchableSetting } from "./settingsSearch";
import {
  useScopedSettings,
  useScopedSettingsMixed,
  useUpdateScopedSettings,
} from "./useScopedSettings";

const MODES = {
  static: msg("Static prefix"),
  semantic: msg("Semantic prefix"),
  custom: msg("Custom instructions"),
} satisfies Record<BranchNamingMode, string>;

export function BranchNamingSettings() {
  const vcsMessage = useVcsMessages();
  const searchableSetting = useSearchableSetting();
  const gt = useGT();
  const m = useMessages();
  const terminology = useSettingsVcsTerminology();
  const settings = useScopedSettings();
  const { targets } = useSettingsScope();
  const scopeKey = targets.map((target) => `${target.environmentId}:${target.projectId}`).join(",");
  const prefixEdited = useRef(false);
  const instructionsEdited = useRef(false);
  const updateSettings = useUpdateScopedSettings();
  const modeMixed = useScopedSettingsMixed(["branchNamingMode"]);
  const prefixMixed = useScopedSettingsMixed(["branchNamePrefix"]);
  const instructionsMixed = useScopedSettingsMixed(["branchNameInstructions"]);

  return (
    <>
      <SettingsRow
        serverScoped
        settingKeys={["branchNamingMode"]}
        {...searchableSetting("worktree-branch-naming")}
        title={
          terminology.kind === "git"
            ? gt("Worktree branch naming")
            : vcsMessage(
                vcsMsg("{value0} {value1} naming", {
                  value0: terminology.workspaceNounTitle,
                  value1: terminology.refNoun,
                }),
              )
        }
        description={
          terminology.kind === "git"
            ? gt("Choose how new worktree branches are named from your first message.")
            : vcsMessage(
                vcsMsg("Choose how new {value0} {value1} are named from your first message.", {
                  value0: terminology.workspaceNoun,
                  value1: terminology.refNounPlural,
                }),
              )
        }
        status={
          !modeMixed && settings.branchNamingMode === "semantic"
            ? gt(
                "The model chooses a prefix that describes the work, such as feat/add-search, fix/login-timeout, or refactor/auth.",
              )
            : undefined
        }
        resetAction={
          settings.branchNamingMode !== DEFAULT_SERVER_SETTINGS.branchNamingMode || modeMixed ? (
            <SettingResetButton
              ariaLabel={
                terminology.kind === "git"
                  ? gt("Reset branch naming to default")
                  : vcsMessage(vcsMsg("{value0} naming", { value0: terminology.refNoun }))
              }
              onClick={() =>
                updateSettings({ branchNamingMode: DEFAULT_SERVER_SETTINGS.branchNamingMode })
              }
            />
          ) : null
        }
        control={
          <Select
            value={modeMixed ? null : settings.branchNamingMode}
            onValueChange={(value) => {
              if (BranchNamingMode.literals.includes(value as BranchNamingMode)) {
                updateSettings({ branchNamingMode: value as BranchNamingMode });
              }
            }}
          >
            <SelectTrigger
              size="sm"
              aria-label={
                terminology.kind === "git"
                  ? gt("Worktree branch naming")
                  : vcsMessage(
                      vcsMsg("{value0} {value1} naming", {
                        value0: terminology.workspaceNounTitle,
                        value1: terminology.refNoun,
                      }),
                    )
              }
            >
              <SelectValue>
                {(value: BranchNamingMode | null) =>
                  value === null
                    ? gt("Mixed", { $context: "values differ across targets" })
                    : m(MODES[value])
                }
              </SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {BranchNamingMode.literals.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {m(MODES[mode])}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        }
      />
      {!modeMixed && settings.branchNamingMode === "static" ? (
        <SettingsRow
          serverScoped
          settingKeys={["branchNamePrefix"]}
          title={
            terminology.kind === "git"
              ? gt("Branch prefix")
              : vcsMessage(vcsMsg("{value0} prefix", { value0: terminology.refNounTitle }))
          }
          description={gt(
            "For example, t3 or t3/ produces t3/add-search. Leave empty for no prefix.",
          )}
          resetAction={
            prefixMixed ||
            settings.branchNamePrefix !== DEFAULT_SERVER_SETTINGS.branchNamePrefix ? (
              <SettingResetButton
                ariaLabel={
                  terminology.kind === "git"
                    ? gt("Reset branch prefix to default")
                    : vcsMessage(vcsMsg("{value0} prefix", { value0: terminology.refNoun }))
                }
                onClick={() =>
                  updateSettings({ branchNamePrefix: DEFAULT_SERVER_SETTINGS.branchNamePrefix })
                }
              />
            ) : null
          }
          control={
            <Input
              key={`${scopeKey}:${prefixMixed}:${settings.branchNamePrefix}`}
              aria-label={
                terminology.kind === "git"
                  ? gt("Branch prefix")
                  : vcsMessage(vcsMsg("{value0} prefix", { value0: terminology.refNounTitle }))
              }
              autoCapitalize="none"
              spellCheck={false}
              onChange={() => {
                prefixEdited.current = true;
              }}
              placeholder={
                prefixMixed
                  ? gt("Mixed", { $context: "values differ across targets" })
                  : gt("No prefix")
              }
              defaultValue={prefixMixed ? "" : settings.branchNamePrefix}
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (prefixEdited.current && (prefixMixed || value !== settings.branchNamePrefix))
                  updateSettings({ branchNamePrefix: value });
                prefixEdited.current = false;
              }}
            />
          }
        />
      ) : null}
      {!modeMixed && settings.branchNamingMode === "custom" ? (
        <SettingsRow
          serverScoped
          settingKeys={["branchNameInstructions"]}
          title={
            terminology.kind === "git"
              ? gt("Branch naming instructions")
              : vcsMessage(
                  vcsMsg("{value0} naming instructions", { value0: terminology.refNounTitle }),
                )
          }
          description={
            terminology.kind === "git"
              ? gt(
                  "Appended to the naming prompt. The model returns the complete branch name; no prefix or suffix is added.",
                )
              : vcsMessage(
                  vcsMsg(
                    "Appended to the naming prompt. The model returns the complete {value0} name; no prefix or suffix is added.",
                    { value0: terminology.refNoun },
                  ),
                )
          }
          resetAction={
            instructionsMixed || settings.branchNameInstructions !== "" ? (
              <SettingResetButton
                ariaLabel={
                  terminology.kind === "git"
                    ? gt("Reset branch naming instructions to default")
                    : vcsMessage(
                        vcsMsg("{value0} naming instructions", { value0: terminology.refNoun }),
                      )
                }
                onClick={() => updateSettings({ branchNameInstructions: "" })}
              />
            ) : null
          }
        >
          <div className="mt-3 max-w-2xl pb-3.5">
            <Textarea
              key={`${scopeKey}:${instructionsMixed}:${settings.branchNameInstructions}`}
              aria-label={
                terminology.kind === "git"
                  ? gt("Branch naming instructions")
                  : vcsMessage(
                      vcsMsg("{value0} naming instructions", { value0: terminology.refNounTitle }),
                    )
              }
              onChange={() => {
                instructionsEdited.current = true;
              }}
              rows={4}
              defaultValue={instructionsMixed ? "" : settings.branchNameInstructions}
              placeholder={
                instructionsMixed
                  ? gt("Mixed. Enter instructions to apply to all selected targets.")
                  : gt("Use julius/ followed by the issue ID and a short description.")
              }
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (
                  instructionsEdited.current &&
                  (instructionsMixed || value !== settings.branchNameInstructions)
                )
                  updateSettings({ branchNameInstructions: value });
                instructionsEdited.current = false;
              }}
            />
          </div>
        </SettingsRow>
      ) : null}
    </>
  );
}
