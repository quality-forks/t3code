import { useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { View } from "react-native";
import { vcsNoticeFingerprint, vcsNoticeStorageKey } from "@t3tools/shared/vcs";
import { Notice } from "../../components/ui/Notice";
import { mobilePreferencesAtom, saveMobilePreferences } from "../../state/preferences";
import { useThreadSelection } from "../../state/use-thread-selection";
import { useSelectedThreadWorktree } from "../../state/use-selected-thread-worktree";
import { useRepositoryVcs } from "../../state/vcs";
import { useAtomCommand } from "../../state/use-atom-command";

export function VcsFallbackNotice() {
  const { selectedThread } = useThreadSelection();
  const { selectedThreadCwd } = useSelectedThreadWorktree();
  const vcs = useRepositoryVcs(selectedThread?.environmentId ?? null, selectedThreadCwd);
  const preferences = useAtomValue(mobilePreferencesAtom);
  const updatePreferences = useAtomCommand(saveMobilePreferences);
  if (!selectedThread || !selectedThreadCwd || !AsyncResult.isSuccess(preferences)) return null;
  const key = vcsNoticeStorageKey(selectedThread.environmentId, selectedThreadCwd);
  const fingerprint = vcsNoticeFingerprint(
    vcs.fallbackNotice?.notice ?? null,
    vcs.fallbackNotice?.reason ?? null,
  );
  const message = vcs.unsupportedReason ?? vcs.fallbackNotice?.notice;
  if (
    !message ||
    (!vcs.unsupportedReason && preferences.value.dismissedVcsNotices?.[key] === fingerprint)
  )
    return null;
  return (
    <View className="px-4 pb-3">
      <Notice
        message={message}
        floating
        {...(vcs.unsupportedReason
          ? {}
          : {
              onDismiss: () => {
                void updatePreferences({
                  transform: (current) => ({
                    dismissedVcsNotices: { ...current.dismissedVcsNotices, [key]: fingerprint },
                  }),
                });
              },
            })}
      />
    </View>
  );
}
