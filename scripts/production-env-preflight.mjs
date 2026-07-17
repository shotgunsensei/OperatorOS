import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CONTRACT_PATH = resolve(SCRIPT_DIR, '../config/production-environment.contract.json');

export const PRODUCTION_ENVIRONMENT_CONTRACT = Object.freeze(
  JSON.parse(readFileSync(CONTRACT_PATH, 'utf8')),
);

const PROFILE_ORDER = ['core', 'revenue', 'email', 'callcommand', 'ai'];

const PROFILE_FLAGS = new Map([
  ['--core', 'core'],
  ['--revenue-ready', 'revenue'],
  ['--email-ready', 'email'],
  ['--callcommand-ready', 'callcommand'],
  ['--ai-ready', 'ai'],
]);

const REVENUE_PRICE_VARS = [
  'STRIPE_PRICE_TRADEFLOWKIT_MONTHLY',
  'STRIPE_PRICE_PULSEDESK_MONTHLY',
  'STRIPE_PRICE_TECHDECK_MONTHLY',
  'STRIPE_PRICE_COMPANION_MODULE_MONTHLY',
  'STRIPE_PRICE_ADDITIONAL_SEAT_MONTHLY',
];

export const CANONICAL_MODULE_URLS = Object.freeze({
  ...PRODUCTION_ENVIRONMENT_CONTRACT.canonicalModuleUrls,
});

function isPresent(env, name) {
  return typeof env[name] === 'string' && env[name].trim().length > 0;
}

function addIssue(issues, profile, name, message) {
  issues.push({ profile, name, message });
}

function requirePresent(env, issues, profile, names) {
  for (const name of names) {
    if (!isPresent(env, name)) addIssue(issues, profile, name, 'is required');
  }
}

function checkCore(env, issues, warnings) {
  const contract = PRODUCTION_ENVIRONMENT_CONTRACT.core;
  requirePresent(env, issues, 'core', contract.required);

  if (isPresent(env, 'DATABASE_URL') && !/^postgres(?:ql)?:\/\//i.test(env.DATABASE_URL)) {
    addIssue(issues, 'core', 'DATABASE_URL', 'must be a PostgreSQL URL');
  }
  for (const [name, minimum] of Object.entries(contract.minimumLengths)) {
    if (isPresent(env, name) && env[name].length < minimum) {
      addIssue(issues, 'core', name, `must contain at least ${minimum} characters`);
    }
  }
  for (const [name, expected] of Object.entries(contract.exact)) {
    if (env[name] !== expected) {
      addIssue(issues, 'core', name, `must equal ${expected}`);
    }
  }
  for (const [name, expected] of Object.entries(CANONICAL_MODULE_URLS)) {
    if (!isPresent(env, name)) {
      addIssue(issues, 'core', name, `is required and must equal ${expected}`);
    } else if (env[name] !== expected) {
      addIssue(issues, 'core', name, `must equal ${expected}`);
    }
  }
  if (!['1', 'true'].includes(String(env.TRUST_PROXY).toLowerCase())) {
    addIssue(issues, 'core', 'TRUST_PROXY', 'must be explicitly enabled behind the Replit proxy');
  }
  for (const name of contract.unset) {
    if (isPresent(env, name)) {
      addIssue(issues, 'core', name, 'must be unset in the unified production runtime');
    }
  }
  for (const name of contract.internalOnly) {
    if (isPresent(env, name)) {
      addIssue(issues, 'core', name, 'is supervisor-owned and must not be configured externally');
    }
  }
  for (const name of contract.falseOrUnset) {
    if (['1', 'true'].includes(String(env[name]).toLowerCase())) {
      addIssue(issues, 'core', name, 'must be absent or false for the production release');
    }
  }
  if (isPresent(env, 'MODULE_SSO_SECRET')) {
    warnings.push({
      profile: 'core',
      name: 'MODULE_SSO_SECRET',
      message: 'is not used by SSO v1 and should be removed unless an emergency rollback is approved',
    });
  }

  if (isPresent(env, 'CORS_ALLOWED_ORIGINS')) {
    const values = env.CORS_ALLOWED_ORIGINS.split(',').map(value => value.trim()).filter(Boolean);
    let valid = values.length > 0;
    for (const value of values) {
      try {
        const parsed = new URL(value);
        valid = valid
          && value !== '*'
          && parsed.protocol === 'https:'
          && parsed.origin === value.replace(/\/$/, '')
          && !parsed.username
          && !parsed.password
          && !['localhost', '127.0.0.1', '::1'].includes(parsed.hostname.toLowerCase());
      } catch {
        valid = false;
      }
    }
    if (!valid) {
      addIssue(
        issues,
        'core',
        'CORS_ALLOWED_ORIGINS',
        'must contain comma-separated exact HTTPS origins without wildcards, credentials, paths, or loopback hosts',
      );
    }
  }
}

function checkRevenue(env, issues) {
  if (env.STRIPE_MODE !== 'live') {
    addIssue(issues, 'revenue', 'STRIPE_MODE', 'must equal live');
  }
  requirePresent(env, issues, 'revenue', ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', ...REVENUE_PRICE_VARS]);
  if (isPresent(env, 'STRIPE_SECRET_KEY') && !env.STRIPE_SECRET_KEY.startsWith('sk_live_')) {
    addIssue(issues, 'revenue', 'STRIPE_SECRET_KEY', 'must be a live Stripe secret key');
  }
  if (isPresent(env, 'STRIPE_WEBHOOK_SECRET') && !env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_')) {
    addIssue(issues, 'revenue', 'STRIPE_WEBHOOK_SECRET', 'must be a Stripe webhook signing secret');
  }
  for (const name of REVENUE_PRICE_VARS) {
    if (isPresent(env, name) && !env[name].startsWith('price_')) {
      addIssue(issues, 'revenue', name, 'must be a Stripe Price ID');
    }
  }
}

function checkEmail(env, issues) {
  requirePresent(env, issues, 'email', ['RESEND_API_KEY']);
  const senderName = isPresent(env, 'EMAIL_FROM')
    ? 'EMAIL_FROM'
    : isPresent(env, 'INVITE_FROM_EMAIL')
      ? 'INVITE_FROM_EMAIL'
      : null;
  if (!senderName) {
    addIssue(issues, 'email', 'EMAIL_FROM', 'or INVITE_FROM_EMAIL is required');
  } else if (!env[senderName].includes('@')) {
    addIssue(issues, 'email', senderName, 'must contain a sender email address');
  }
}

function checkCallCommand(env, issues) {
  if (env.TWILIO_PUBLIC_BASE_URL !== 'https://callcommand-ai.operatoros.net') {
    addIssue(
      issues,
      'callcommand',
      'TWILIO_PUBLIC_BASE_URL',
      'must equal https://callcommand-ai.operatoros.net',
    );
  }

  const envCredentials = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER']
    .every((name) => isPresent(env, name));
  const connectorCredentials = isPresent(env, 'REPLIT_CONNECTORS_HOSTNAME')
    && (isPresent(env, 'REPL_IDENTITY') || isPresent(env, 'WEB_REPL_RENEWAL'));
  if (!envCredentials && !connectorCredentials) {
    addIssue(
      issues,
      'callcommand',
      'TWILIO_CREDENTIALS',
      'require the three TWILIO_* credential variables or a bound Replit Twilio connector',
    );
  }
  if (envCredentials && !env.TWILIO_ACCOUNT_SID.startsWith('AC')) {
    addIssue(issues, 'callcommand', 'TWILIO_ACCOUNT_SID', 'must be a Twilio Account SID');
  }
  if (envCredentials && !/^\+[1-9]\d{7,14}$/.test(env.TWILIO_FROM_NUMBER)) {
    addIssue(issues, 'callcommand', 'TWILIO_FROM_NUMBER', 'must be an E.164 phone number');
  }
}

function checkAi(env, issues) {
  requirePresent(env, issues, 'ai', ['OPENAI_API_KEY']);
}

const CHECKS = {
  core: checkCore,
  revenue: checkRevenue,
  email: checkEmail,
  callcommand: checkCallCommand,
  ai: checkAi,
};

export function resolveProfiles(args = []) {
  const options = args.filter((arg) => arg !== '--');
  if (options.includes('--all')) return [...PROFILE_ORDER];
  const unknown = options.filter((arg) => !PROFILE_FLAGS.has(arg));
  if (unknown.length) throw new Error(`Unknown preflight option: ${unknown.join(', ')}`);
  const requested = new Set(['core']);
  for (const arg of options) requested.add(PROFILE_FLAGS.get(arg));
  return PROFILE_ORDER.filter((profile) => requested.has(profile));
}

export function evaluateProductionEnvironment(env = process.env, profiles = ['core']) {
  const normalizedProfiles = PROFILE_ORDER.filter((profile) => profiles.includes(profile));
  const invalid = profiles.filter((profile) => !PROFILE_ORDER.includes(profile));
  if (invalid.length) throw new Error(`Unknown readiness profile: ${invalid.join(', ')}`);

  const issues = [];
  const warnings = [];
  for (const profile of normalizedProfiles) CHECKS[profile](env, issues, warnings);
  const results = normalizedProfiles.map((profile) => ({
    profile,
    ok: !issues.some((issue) => issue.profile === profile),
  }));
  return { ok: issues.length === 0, profiles: results, issues, warnings };
}

export function formatReport(report) {
  const lines = ['OperatorOS production environment preflight'];
  for (const result of report.profiles) {
    lines.push(`${result.ok ? 'PASS' : 'FAIL'} ${result.profile}`);
    for (const issue of report.issues.filter((item) => item.profile === result.profile)) {
      lines.push(`  - ${issue.name}: ${issue.message}`);
    }
  }
  for (const warning of report.warnings) {
    lines.push(`WARN ${warning.profile} ${warning.name}: ${warning.message}`);
  }
  lines.push(report.ok ? 'Preflight passed.' : 'Preflight failed. No secret values were printed.');
  return lines.join('\n');
}

export function runCli(args = process.argv.slice(2), env = process.env) {
  const profiles = resolveProfiles(args);
  const report = evaluateProductionEnvironment(env, profiles);
  console.log(formatReport(report));
  return report.ok ? 0 : 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  try {
    process.exitCode = runCli();
  } catch (error) {
    console.error(`Preflight configuration error: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 2;
  }
}
