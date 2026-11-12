import { useVcsTerminology } from "../../state/vcs";
import { useOptionalSettingsScope } from "./SettingsScopeContext";

/** A mixed scope has no single checkout vocabulary. */
export function useSettingsVcsTerminology() {
  const scope = useOptionalSettingsScope()?.scope;
  const checkout =
    scope?.kind === "checkout"
      ? scope.checkout
      : scope?.kind === "project" && scope.members.length === 1
        ? scope.members[0]
        : null;
  return useVcsTerminology(checkout?.environmentId ?? null, checkout?.workspaceRoot ?? null);
}
