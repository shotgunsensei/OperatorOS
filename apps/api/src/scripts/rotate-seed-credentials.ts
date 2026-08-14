import { eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { users } from '../schema.js';
import { hashPassword } from '../lib/auth.js';
import { resolveSeedPassword } from '../lib/seed-credential-policy.js';
import { normalizeEmail, ROOT_SUPER_ADMIN_EMAIL } from '../../../../packages/auth/index.js';

async function rotateCredential(email: string, password: string, label: string): Promise<void> {
  const [account] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!account) throw new Error(`[security] ${label} account ${email} was not found; no credential changed.`);

  const passwordHash = await hashPassword(password);
  await db.update(users).set({
    passwordHash,
    tokenVersion: sql`token_version + 1`,
    failedLoginCount: 0,
    lockedUntil: null,
    updatedAt: new Date(),
  }).where(eq(users.id, account.id));
  console.info(`[security] ${label} credential rotated and existing sessions revoked for ${email}.`);
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error('[security] DATABASE_URL is required.');

  const adminPassword = resolveSeedPassword({
    envName: 'ADMIN_PASSWORD',
    value: process.env.ADMIN_PASSWORD,
    requiredInProduction: true,
    production: true,
  });
  const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL || ROOT_SUPER_ADMIN_EMAIL);
  await rotateCredential(adminEmail, adminPassword!, 'admin');

  const demoPassword = resolveSeedPassword({
    envName: 'DEMO_PASSWORD',
    value: process.env.DEMO_PASSWORD,
    requiredInProduction: false,
    production: true,
  });
  if (demoPassword) {
    const demoEmail = normalizeEmail(process.env.DEMO_EMAIL || 'demo@operatoros.com');
    await rotateCredential(demoEmail, demoPassword, 'demo');
  } else {
    console.info('[security] DEMO_PASSWORD is unset; demo credential was not changed.');
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : '[security] credential rotation failed');
  process.exitCode = 1;
});
