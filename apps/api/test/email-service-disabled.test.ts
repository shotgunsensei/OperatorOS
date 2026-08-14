import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getEmailFromHealth, sendInviteEmail } from '../src/lib/email-service.js';

test('email is explicitly disabled when provider configuration is incomplete', async () => {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    appEnv: process.env.APP_ENV,
    apiKey: process.env.RESEND_API_KEY,
    emailFrom: process.env.EMAIL_FROM,
    inviteFrom: process.env.INVITE_FROM_EMAIL,
  };
  try {
    process.env.NODE_ENV = 'production';
    process.env.APP_ENV = 'production';
    process.env.RESEND_API_KEY = 'test-key-that-must-not-be-used';
    delete process.env.EMAIL_FROM;
    delete process.env.INVITE_FROM_EMAIL;

    assert.deepEqual(getEmailFromHealth(), { configured: false, provider: 'disabled' });
    const result = await sendInviteEmail({
      to: 'recipient@example.test',
      tenantName: 'Example',
      inviterName: 'Operator',
      inviterEmail: 'operator@example.test',
      role: 'member',
      acceptUrl: 'https://example.test/invites/redacted',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });
    assert.deepEqual(result, {
      ok: false,
      provider: 'disabled',
      error: 'EMAIL_PROVIDER_DISABLED',
    });
  } finally {
    for (const [key, value] of Object.entries({
      NODE_ENV: previous.nodeEnv,
      APP_ENV: previous.appEnv,
      RESEND_API_KEY: previous.apiKey,
      EMAIL_FROM: previous.emailFrom,
      INVITE_FROM_EMAIL: previous.inviteFrom,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
