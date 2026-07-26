/**
 * Frontend safety net for promises that can hang indefinitely.
 *
 * Tauri IPC calls into blocking hardware operations (SPI/RFID) can stall past
 * any backend-side timeout, which would leave the kiosk stuck in a busy state.
 * Rejecting on the frontend keeps the UI recoverable.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise
      .then(result => {
        clearTimeout(timeoutHandle);
        resolve(result);
      })
      .catch((error: unknown) => {
        clearTimeout(timeoutHandle);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
  });
}
