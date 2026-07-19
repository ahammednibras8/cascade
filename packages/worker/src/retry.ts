export type RetryDelayConfig = {
  delayMs: number;
  exponentialBackoff: boolean;
};

export function getRetryDelayMs(attemptNumber: number, retry: RetryDelayConfig) {
  if (!retry.exponentialBackoff) {
    return retry.delayMs;
  }

  return retry.delayMs * 2 ** (attemptNumber - 1);
}
