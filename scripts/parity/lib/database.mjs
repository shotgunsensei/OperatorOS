const DISPOSABLE_NAME = /(?:test|phase21|ci|disposable)/iu;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

export function assertDisposableDatabaseEnvironment(environment = process.env) {
  if (environment.PARITY_DATABASE_IS_DISPOSABLE !== '1') {
    throw new Error('PARITY_DATABASE_IS_DISPOSABLE=1 is required');
  }
  if (!environment.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const parsed = new URL(environment.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('Disposable database URL must use PostgreSQL');
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(`Refusing non-loopback disposable database host: ${parsed.hostname}`);
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//u, ''));
  if (!database || !DISPOSABLE_NAME.test(database)) {
    throw new Error('Disposable database name must contain test, phase21, ci, or disposable');
  }
  return { url: parsed.toString(), host: parsed.hostname, database };
}
