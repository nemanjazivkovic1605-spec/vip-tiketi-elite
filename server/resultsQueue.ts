// Never advance beyond due records that were not processed in this invocation.
export function resultQueueCursor(readIds: string[], dueIds: string[], processedId?: string, windowSize = 60) {
  if (dueIds.length && processedId !== dueIds.at(-1)) return processedId || readIds[0] || '';
  return readIds.length === windowSize ? readIds.at(-1)! : '';
}
