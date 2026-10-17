import type { MessageId } from "@t3tools/contracts";

import {
  threadOutboxRevision,
  updateThreadOutboxMessage,
  type QueuedThreadMessage,
} from "./thread-outbox";

export function capturePendingTaskEditorWriteBaseline(messageId: MessageId): Promise<number> {
  return Promise.resolve(threadOutboxRevision(messageId));
}

export async function flushPendingTaskEditorWrite(input: {
  readonly message: QueuedThreadMessage;
  readonly baseline: Promise<number>;
  readonly draftKey: string;
}): Promise<boolean> {
  void input.draftKey;
  const baseline = await input.baseline;
  return updateThreadOutboxMessage(input.message, baseline);
}
