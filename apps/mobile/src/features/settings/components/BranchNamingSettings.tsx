import { useMessages as useVcsMessages } from "gt-react-native";
import { msg as vcsMsg } from "gt-react-native";
import { msg, T, useGT, useMessages } from "gt-react-native";
import { BranchNamingMode, type ServerSettingsPatch } from "@t3tools/contracts";
import { DEFAULT_VCS_TERMINOLOGY, type VcsTerminology } from "@t3tools/shared/vcs";
import { useEffect, useEffectEvent, useRef } from "react";
import { View } from "react-native";

import { AppText as Text, AppTextInput } from "../../../components/ui/AppText";
import { ListChoiceRow as SettingsChoiceRow } from "../../../components/ui/ListChoiceRow";
import { SettingsSection } from "./SettingsSection";

const MODES = {
  static: {
    label: msg("Static prefix"),
    description: msg("Add your prefix to the generated name."),
  },
  semantic: {
    label: msg("Semantic prefix"),
    description: msg("Let the model choose {examples}, or another prefix.", {
      examples: "feat/, fix/, refactor/",
    }),
  },
  custom: {
    label: msg("Custom instructions"),
    description: msg("Generate the complete name with no added prefix or suffix."),
  },
} satisfies Record<BranchNamingMode, { label: string; description: string }>;

export function BranchNamingSettings(props: {
  terminology?: VcsTerminology;
  mode: BranchNamingMode | null;
  prefix: string | null;
  instructions: string | null;
  /** Per setting, since a policy can lock one and leave the others to the user. */
  disabled: Readonly<Record<"mode" | "prefix" | "instructions", boolean>>;
  onChange: (patch: ServerSettingsPatch) => void;
}) {
  const vcsMessage = useVcsMessages();
  const gt = useGT();
  const m = useMessages();
  const vcs = props.terminology ?? DEFAULT_VCS_TERMINOLOGY;
  // Save on exit too: Android Back hides the keyboard without ending editing.
  type Field = "branchNamePrefix" | "branchNameInstructions";
  const drafts = useRef<Partial<Record<Field, { text: string; over: string | null }>>>({});
  const savedValue = (field: Field) =>
    field === "branchNamePrefix" ? props.prefix : props.instructions;
  const edit = (field: Field, text: string) => {
    drafts.current[field] = { text, over: savedValue(field) };
  };
  // Drop a draft typed over an older saved value: the updated value has already remounted its input.
  const take = (field: Field): ServerSettingsPatch => {
    const draft = drafts.current[field];
    delete drafts.current[field];
    const saved = savedValue(field);
    // Save even while disabled; the route queues behind pending writes and checks access.
    if (draft === undefined || draft.over !== saved) return {};
    const value = draft.text.trim();
    return saved === null || value !== saved ? { [field]: value } : {};
  };
  const send = (patch: ServerSettingsPatch) => {
    if (Object.keys(patch).length > 0) props.onChange(patch);
  };
  // One patch, because the screen drops writes while another is in flight.
  const saveDrafts = useEffectEvent(() =>
    send({ ...take("branchNamePrefix"), ...take("branchNameInstructions") }),
  );
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- saves unsent branch naming drafts to server settings when the section unmounts
  useEffect(() => () => saveDrafts(), []);
  return (
    <SettingsSection
      title={
        vcs.kind === "git"
          ? gt("Worktree branch naming")
          : vcsMessage(
              vcsMsg("{value0} {value1} naming", {
                value0: vcs.workspaceNounTitle,
                value1: vcs.refNoun,
              }),
            )
      }
      trailing={
        props.mode === null ? (
          <Text className="text-xs text-foreground-muted">
            <T>Mixed</T>
          </Text>
        ) : null
      }
    >
      {BranchNamingMode.literals.map((mode, index) => (
        <SettingsChoiceRow
          key={mode}
          label={m(MODES[mode].label)}
          description={
            mode === "static" && vcs.kind === "git"
              ? gt("Add your prefix to the generated branch name.")
              : m(MODES[mode].description)
          }
          selected={props.mode === mode}
          separated={index > 0}
          disabled={props.disabled.mode}
          onPress={() => props.onChange({ branchNamingMode: mode })}
        />
      ))}
      {props.mode === "static" ? (
        <View className="gap-2 px-4 py-3">
          <Text className="text-sm text-foreground-muted">
            {gt("Use {short} or {slash} for {example}. Leave empty for no prefix.", {
              short: "t3",
              slash: "t3/",
              example: "t3/add-search",
            })}
          </Text>
          <AppTextInput
            key={props.prefix}
            accessibilityLabel={
              vcs.kind === "git"
                ? gt("Branch prefix")
                : vcsMessage(vcsMsg("{value0} prefix", { value0: vcs.refNounTitle }))
            }
            onChangeText={(text) => edit("branchNamePrefix", text)}
            defaultValue={props.prefix ?? ""}
            placeholder={props.prefix === null ? gt("Mixed") : gt("No prefix")}
            editable={!props.disabled.prefix}
            autoCapitalize="none"
            autoCorrect={false}
            className="min-h-10 rounded-xl px-3 py-2 text-base text-foreground"
            onEndEditing={() => send(take("branchNamePrefix"))}
          />
        </View>
      ) : null}
      {props.mode === "custom" ? (
        <View className="gap-2 px-4 py-3">
          <Text className="text-sm text-foreground-muted">
            <T>Append instructions to the naming prompt.</T>
          </Text>
          <AppTextInput
            key={props.instructions}
            accessibilityLabel={
              vcs.kind === "git"
                ? gt("Branch naming instructions")
                : vcsMessage(vcsMsg("{value0} naming instructions", { value0: vcs.refNounTitle }))
            }
            onChangeText={(text) => edit("branchNameInstructions", text)}
            defaultValue={props.instructions ?? ""}
            placeholder={
              props.instructions === null
                ? gt("Mixed. Enter instructions for all selected targets.")
                : gt("Use {prefix} followed by the issue ID and a short description.", {
                    prefix: "julius/",
                  })
            }
            editable={!props.disabled.instructions}
            multiline
            autoCapitalize="sentences"
            className="min-h-24 rounded-xl px-3 py-2 text-base text-foreground"
            onEndEditing={() => send(take("branchNameInstructions"))}
          />
        </View>
      ) : null}
    </SettingsSection>
  );
}
