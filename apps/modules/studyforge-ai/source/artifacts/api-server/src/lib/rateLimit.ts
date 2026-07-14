import type { Request, Response, NextFunction } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Lightweight in-memory rate limiter keyed by IP + route.
 *
 * Good enough for single-instance deployments. For multi-instance prod,
 * swap with a Redis-backed limiter such as `rate-limiter-flexible`.
 */
export function rateLimit(opts: { windowMs: number; max: number; key: string }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Relies on `app.set('trust proxy', true)` so req.ip is the real client IP
    // (not the loopback proxy) and cannot be trivially spoofed via x-forwarded-for.
    const ip = req.ip || "unknown";
    const bucketKey = `${opts.key}:${ip}`;
    const now = Date.now();
    const bucket = buckets.get(bucketKey);

    if (!bucket || bucket.resetAt < now) {
      buckets.set(bucketKey, { count: 1, resetAt: now + opts.windowMs });
      next();
      return;
    }

    if (bucket.count >= opts.max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({ error: "Too many requests. Please slow down." });
      return;
    }

    bucket.count += 1;
    next();
  };
}

// Periodic cleanup so the map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}, 60_000).unref();
