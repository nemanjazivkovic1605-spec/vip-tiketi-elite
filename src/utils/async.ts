export const withTimeout = async <T>(operation: Promise<T>, message: string, timeoutMs = 12000): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export type RequestOptions = { signal?: AbortSignal; timeoutMs?: number };

export const withRequestTimeout = async <T>(operation: (signal: AbortSignal) => Promise<T>, options: RequestOptions = {}): Promise<T> => {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let cancel: () => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    const abort = (reason: unknown) => { controller.abort(reason); reject(reason); };
    cancel = () => abort(options.signal?.reason ?? new DOMException('Zahtev je otkazan.', 'AbortError'));
    if (options.signal?.aborted) { cancel(); return; }
    options.signal?.addEventListener('abort', cancel, { once: true });
    timeoutId = setTimeout(() => abort(new Error('Ucitavanje traje predugo. Pokusajte ponovo.')), options.timeoutMs ?? 15000);
  });
  try {
    return await Promise.race([interrupted, Promise.resolve().then(() => {
      if (controller.signal.aborted) throw controller.signal.reason;
      return operation(controller.signal);
    })]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    options.signal?.removeEventListener('abort', cancel);
  }
};
