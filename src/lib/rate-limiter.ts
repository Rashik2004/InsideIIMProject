// Simple in-memory sliding-window rate limiter.
// Not shared across processes — sufficient for single-instance or dev use.
// For multi-instance (Vercel), replace with Redis-based limiter.

interface Entry {
  timestamps: number[];
}

const store = new Map<string, Entry>();

const CLEANUP_INTERVAL = 60_000;
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < 60_000);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}, CLEANUP_INTERVAL);

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  let entry = store.get(key);

  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  entry.timestamps = entry.timestamps.filter((t) => now - t < config.windowMs);

  if (entry.timestamps.length >= config.maxRequests) {
    const oldest = entry.timestamps[0]!;
    const resetMs = oldest + config.windowMs - now;
    return { allowed: false, remaining: 0, resetMs };
  }

  entry.timestamps.push(now);
  const remaining = config.maxRequests - entry.timestamps.length;
  return { allowed: true, remaining, resetMs: 0 };
}

export function rateLimitMiddleware(config: RateLimitConfig) {
  return (request: Request): Response | null => {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "127.0.0.1";

    const result = checkRateLimit(ip, config);

    if (!result.allowed) {
      return Response.json(
        { error: "Too many requests. Please wait before trying again." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(result.resetMs / 1000)),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Date.now() + result.resetMs),
          },
        }
      );
    }

    return null;
  };
}
