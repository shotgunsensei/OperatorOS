const DEV_LOCAL_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

export function parseCorsAllowedOrigins(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(raw.split(',').map((value) => value.trim()).filter(Boolean));
}

export function buildCorsOriginValidator(rawAllowedOrigins: string | undefined, nodeEnv: string | undefined) {
  const allowedOrigins = parseCorsAllowedOrigins(rawAllowedOrigins);
  return (origin: string | undefined, cb: (err: Error | null, origin: boolean | string) => void) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.has(origin)) return cb(null, true);
    if (nodeEnv === 'development' && DEV_LOCAL_ORIGINS.has(origin)) return cb(null, true);
    return cb(new Error('Origin not allowed by CORS'), false);
  };
}
