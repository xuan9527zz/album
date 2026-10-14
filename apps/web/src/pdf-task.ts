export function pdfTask<T>(
  run: () => PromiseLike<T>,
  signal: AbortSignal | undefined,
  message: string,
  timeout = 30000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      action();
    };
    const abort = () =>
      finish(() => reject(new DOMException("已取消制作 PDF", "AbortError")));
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => finish(() => reject(new Error(message))), timeout);
    try {
      Promise.resolve(run()).then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error)),
      );
    } catch (error) {
      finish(() => reject(error));
    }
  });
}
