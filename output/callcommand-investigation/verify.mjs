import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { resolve } from 'node:path';
import { stripExternalProviderEnvironment, assertDisposableDatabaseEnvironment } from '../../scripts/parity/lib/database.mjs';
const env = { ...stripExternalProviderEnvironment(process.env), APP_ENV:'test', NODE_ENV:'test',
  SESSION_SECRET:'callcommand-isolated-test-session-secret-2026', SSO_CODE_ENCRYPTION_SECRET:'callcommand-isolated-sso-secret-2026',
  DATABASE_URL:process.env.CALLCOMMAND_CLEAN_REHEARSAL === '1' ? 'postgresql://postgres@127.0.0.1:55438/operatoros_callcommand_clean_test' : 'postgresql://postgres@127.0.0.1:55438/operatoros_callcommand_test', PARITY_DATABASE_IS_DISPOSABLE:'1',
  INTERNAL_API_URL:'http://127.0.0.1:5001', OPERATOROS_DATABASE_RELEASE_MODE:'apply',
  PATH:`${resolve('output/callcommand-investigation/bin')};${process.env.PATH}` };
assertDisposableDatabaseEnvironment(env);
const args = process.argv.slice(2);
const log = createWriteStream(resolve('output/callcommand-investigation', `${args[0] || 'test'}.log`));
const name = args.shift();
const child = spawn(process.execPath, args, { env, stdio:['ignore','pipe','pipe'] });
for (const stream of [child.stdout,child.stderr]) stream.on('data', data => { log.write(data); process.stdout.write(data); });
child.on('exit', code => { log.end(); process.exitCode = code ?? 1; });
