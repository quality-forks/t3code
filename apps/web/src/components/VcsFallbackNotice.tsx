import * as Schema from "effect/Schema";
import { vcsNoticeFingerprint, vcsNoticeStorageKey } from "@t3tools/shared/vcs";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { T, useGT } from "gt-react";

export function VcsFallbackNotice(props: {
  environmentId: string;
  repository: string;
  notice: string | null;
  reason: string | null;
}) {
  const gt = useGT();
  const [dismissed, setDismissed] = useLocalStorage(
    vcsNoticeStorageKey(props.environmentId, props.repository),
    "",
    Schema.String,
  );
  const fingerprint = vcsNoticeFingerprint(props.notice, props.reason);
  if (!props.notice || dismissed === fingerprint) return null;
  return (
    <div
      role="status"
      className="pointer-events-auto flex items-start gap-3 border-b border-border bg-background px-4 py-2 text-xs text-muted-foreground"
    >
      <span className="flex-1">{props.notice}</span>
      <button
        type="button"
        aria-label={gt("Dismiss repository fallback notice")}
        className="shrink-0 underline underline-offset-2"
        onClick={() => setDismissed(fingerprint)}
      >
        <T>Dismiss</T>
      </button>
    </div>
  );
}
