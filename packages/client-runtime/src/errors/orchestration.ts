import { GitCommandError, OrchestrationDispatchCommandError } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import type { MFunctionType } from "gt-i18n/types";
import { errorDisplayMessage } from "./translatable.ts";

const isOrchestrationDispatchCommandError = Schema.is(OrchestrationDispatchCommandError);
const isGitCommandError = Schema.is(GitCommandError);

export function wasBootstrapThreadDeleted(error: unknown): boolean {
  return (
    isOrchestrationDispatchCommandError(error) && error.bootstrapThreadDisposition === "deleted"
  );
}

export function wasBootstrapThreadNotCreated(error: unknown): boolean {
  return (
    isOrchestrationDispatchCommandError(error) && error.bootstrapThreadDisposition === "not-created"
  );
}

/** Prefer the server's unsupported-VCS reason without changing ordinary error copy. */
export function vcsOperationErrorMessage(
  error: unknown,
  fallback: string,
  resolve?: MFunctionType,
): string {
  if (isGitCommandError(error) && error.reason === "unsupported_repository") {
    return error.detail;
  }
  return errorDisplayMessage(error, resolve) ?? fallback;
}
