export function coalesceRefresh<T>(load: (options: T) => Promise<void>, merge: (left: T | undefined, right: T) => T) {
  let pending: T | undefined;
  let running: Promise<void> | undefined;
  return (options: T): Promise<void> => {
    pending = merge(pending, options);
    if (!running) running = (async () => {
      await Promise.resolve();
      while (pending) {
        const next = pending;
        pending = undefined;
        await load(next);
      }
    })().finally(() => { running = undefined; });
    return running;
  };
}
