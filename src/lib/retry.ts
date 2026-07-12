// Retry with exponential backoff + jitter for external API calls.

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

const defaultOptions: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10_000,
};

export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const { maxAttempts, baseDelayMs, maxDelayMs } = {
    ...defaultOptions,
    ...options,
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      const msg = (err as Error).message ?? "";
      const isRateLimit =
        msg.includes("429") ||
        msg.includes("rate limit") ||
        msg.includes("Too Many Requests") ||
        msg.includes("quota exceeded") ||
        msg.includes("RESOURCE_EXHAUSTED") ||
        msg.includes("Quota exceeded");

      if (attempt === maxAttempts || !isRateLimit) {
        throw err;
      }

      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * baseDelayMs,
        maxDelayMs
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("Unreachable");
}
