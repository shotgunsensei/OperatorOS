import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('reviewer routes are public marketing pages with required titles and links', () => {
  const routes = [
    ['privacy', 'Privacy Policy'],
    ['terms', 'Terms and Conditions'],
    ['sms-consent', 'OperatorOS SMS Communications'],
    ['messaging', 'OperatorOS Messaging Program'],
  ] as const;
  for (const [route, title] of routes) {
    const path = `apps/web/src/app/${route}/page.tsx`;
    assert.ok(existsSync(resolve(root, path)), `${path} must exist`);
    const source = read(path);
    assert.match(source, /MarketingLayout|OperatorOsPolicyPage/, `${route} must use the public marketing shell`);
    assert.match(source, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(source, /requireTenant|SaasLayout|LoginPage/);
  }
  assert.match(read('apps/web/src/components/marketing/OperatorOsPolicyPage.tsx'), /MarketingLayout/);
});

test('privacy, terms, footer, and messaging copy meet the SMS disclosure contract', () => {
  const policy = read('apps/web/src/components/marketing/OperatorOsPolicyPage.tsx');
  assert.match(policy, /SMS and Mobile Messaging Privacy/);
  assert.match(policy, /All the above categories exclude text messaging originator opt-in data and consent; this information won’t be shared with any third parties\./);
  assert.match(policy, /SMS and Messaging Terms/);
  assert.match(policy, /not a condition/);
  assert.match(policy, /Message and data rates may apply/);
  assert.match(policy, /Reply <strong>STOP<\/strong>/);
  assert.match(policy, /<strong>HELP<\/strong>/);
  const footer = read('apps/web/src/components/marketing/MarketingFooter.tsx');
  assert.match(footer, /href: '\/privacy', label: 'Privacy'/);
  assert.match(footer, /href: '\/terms', label: 'Terms'/);
  assert.match(footer, /href: '\/messaging', label: 'SMS Communications'/);
});

test('SMS form uses an associated, controlled checkbox that starts false', () => {
  const form = read('apps/web/src/components/marketing/SmsConsentForm.tsx');
  assert.match(form, /useState\(false\)/);
  assert.match(form, /id="sms-explicit-consent"/);
  assert.match(form, /htmlFor="sms-explicit-consent"/);
  assert.match(form, /checked=\{smsConsent\}/);
  assert.doesNotMatch(form, /defaultChecked/);
  assert.match(form, /Privacy Policy/);
  assert.match(form, /Terms and Conditions/);
  assert.match(form, /Opt In to SMS/);
  assert.doesNotMatch(form, /TWILIO_AUTH_TOKEN|TWILIO_ACCOUNT_SID|SHARED_SECRET_ENCRYPTION_KEY/);
});

test('signed OutCall SMS ingress handles provider keywords before exact private triggers', () => {
  const route = read('apps/api/src/routes/outcall-routes.ts');
  const keyword = route.indexOf('recordOperatorOsMessagingKeyword');
  const trigger = route.indexOf('const phoneDigest', keyword);
  assert.ok(keyword >= 0 && trigger > keyword, 'keyword handling must run before trigger matching');
  assert.match(route, /body\.OptOutType/);
  assert.match(route, /if \(keyword\.handled\)/);
  assert.match(route, /verifyOutCallTwilioSignature/);
});
