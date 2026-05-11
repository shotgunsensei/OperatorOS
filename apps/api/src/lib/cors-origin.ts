const DEV_LOCAL_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

export function parseCorsAllowedOrigins(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function isDevelopmentMode(nodeEnv: string | undefined): boolean {
  return nodeEnv === 'development';
}

export function isCorsOriginAllowed(origin: string | undefined, allowedOrigins: Set<string>, nodeEnv: string | undefined): boolean {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;
  if (isDevelopmentMode(nodeEnv) && DEV_LOCAL_ORIGINS.has(origin)) return true;
  return false;
}

export function buildCorsOriginValidator(rawAllowedOrigins: string | undefined, nodeEnv: string | undefined) {
  const allowedOrigins = parseCorsAllowedOrigins(rawAllowedOrigins);
  return (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
    if (isCorsOriginAllowed(origin, allowedOrigins, nodeEnv)) {
      cb(null, true);
      return;
    }
    cb(new Error('Origin not allowed by CORS'));
  };
}
