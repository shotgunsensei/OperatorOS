interface RateLimitEntry {
  count: number;
  resetAt: number;
}

function makeStore() {
  return new Map<string, RateLimitEntry>();
}

const requestStore = makeStore();
const failureStore = makeStore();

function increment(store: Map<string, RateLimitEntry>, key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count += 1;
  return true;
}

export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  return increment(requestStore, key, maxRequests, windowMs);
}

export function recordAndCheckFailure(key: string, maxFailures: number, windowMs: number): boolean {
  return increment(failureStore, key, maxFailures, windowMs);
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of requestStore.entries()) {
    if (now > entry.resetAt) requestStore.delete(key);
  }
  for (const [key, entry] of failureStore.entries()) {
    if (now > entry.resetAt) failureStore.delete(key);
  }
}, 60_000);
