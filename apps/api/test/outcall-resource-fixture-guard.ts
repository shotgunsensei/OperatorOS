import { assertDisposableDatabaseEnvironment } from '../../../scripts/parity/lib/database.mjs';

// Synthetic privileged approvals require both test signals as well as the
// same target guard used by the authoritative API release runner.
export function assertOutCallResourceFixtureEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  if (environment.APP_ENV !== 'test' || environment.NODE_ENV !== 'test') {
    throw new Error('OutCall resource fixtures require APP_ENV=test and NODE_ENV=test');
  }
  return assertDisposableDatabaseEnvironment(environment);
}
