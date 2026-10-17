import * as Schema from "effect/Schema";
import { GitCommandFailureReason, VcsProcessExitError } from "@t3tools/contracts";

export class JjProcessExitError extends VcsProcessExitError.extend<JjProcessExitError>(
  "JjProcessExitError",
)({
  reason: Schema.optional(GitCommandFailureReason),
}) {}
