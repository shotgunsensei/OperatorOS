import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";

const isProd = process.env["NODE_ENV"] === "production";

const baseOpts = {
  standardHeaders: "draft-7" as const,
  legacyHeaders: false,
  // In dev we relax limits for testing; in prod we lock them down.
  skip: () => !isProd && process.env["FORCE_RATE_LIMIT"] !== "1",
};

/** General read-limit: 300 req/min/IP — generous for normal browsing. */
export const readLimiter: RateLimitRequestHandler = rateLimit({
  ...baseOpts,
  windowMs: 60_000,
  max: 300,
  message: { error: "Too many requests" },
});

/** Write-limit: 60 req/min/IP for state-changing routes. */
export const writeLimiter: RateLimitRequestHandler = rateLimit({
  ...baseOpts,
  windowMs: 60_000,
  max: 60,
  message: { error: "Too many write requests" },
});

/** Heavy compute: 20 req/min/IP for kit generation/preview. */
export const generationLimiter: RateLimitRequestHandler = rateLimit({
  ...baseOpts,
  windowMs: 60_000,
  max: 20,
  message: { error: "Generation rate limit reached, slow down" },
});

/** Auth: 10 attempts/15min/IP for login/signup. */
export const authLimiter: RateLimitRequestHandler = rateLimit({
  ...baseOpts,
  windowMs: 15 * 60_000,
  max: 10,
  message: { error: "Too many authentication attempts, try again later" },
});
