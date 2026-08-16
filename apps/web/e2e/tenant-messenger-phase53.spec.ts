import { expect, test, type Browser, type Page } from '@playwright/test';

const ROOT = process.env.E2E_MESSENGER_ROOT_URL || 'http://127.0.0.1:3001';
const OWNER_EMAIL = process.env.E2E_MESSENGER_OWNER_EMAIL;
const OWNER_PASSWORD = process.env.E2E_MESSENGER_OWNER_PASSWORD;
const MEMBER_EMAIL = process.env.E2E_MESSENGER_MEMBER_EMAIL;
const MEMBER_PASSWORD = process.env.E2E_MESSENGER_MEMBER_PASSWORD;

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required for the tenant messenger browser gate`);
  return value;
}

async function login(browser: Browser, email: string, password: string, viewport?: { width: number; height: number }) {
  const context = await browser.newContext({ permissions: [], ...(viewport ? { viewport } : {}) });
  const page = await context.newPage();
  // Enter through the auth route directly for local-loopback verification.
  // Deployed exact-host acceptance still uses the normal PKCE middleware hop.
  await page.goto(`${ROOT}/login?next=%2Fapp`);
  await page.getByTestId('input-email').fill(email);
  await page.getByTestId('input-password').fill(password);
  await page.getByTestId('button-login').click();
  await expect(page.getByTestId('tenant-messenger-toggle')).toBeVisible();
  return { context, page };
}

async function openMessenger(page: Page) {
  await page.getByTestId('tenant-messenger-toggle').click();
  await expect(page.getByTestId('tenant-messenger-panel')).toBeVisible();
  await expect(page.getByText(/Live and tenant-private|Connecting securely/)).toBeVisible();
}

test('P53-E2E-001: two same-tenant users message, receive presence/alerts, edit, and delete durable history', async ({ browser }) => {
  test.setTimeout(120_000);
  const ownerEmail = required(OWNER_EMAIL, 'E2E_MESSENGER_OWNER_EMAIL');
  const ownerPassword = required(OWNER_PASSWORD, 'E2E_MESSENGER_OWNER_PASSWORD');
  const memberEmail = required(MEMBER_EMAIL, 'E2E_MESSENGER_MEMBER_EMAIL');
  const memberPassword = required(MEMBER_PASSWORD, 'E2E_MESSENGER_MEMBER_PASSWORD');
  const unique = Date.now().toString(36);
  const originalMessage = `Phase 53 live message ${unique}`;
  const editedMessage = `Phase 53 edited message ${unique}`;
  const replyMessage = `Phase 53 reply ${unique}`;

  const owner = await login(browser, ownerEmail, ownerPassword);
  const member = await login(browser, memberEmail, memberPassword);
  try {
    await openMessenger(owner.page);
    await owner.page.getByRole('button', { name: 'Start a conversation' }).click();
    await owner.page.getByLabel('Find a tenant member').fill(memberEmail);
    await owner.page.getByRole('button', { name: new RegExp(memberEmail, 'i') }).click();
    await owner.page.getByRole('button', { name: 'Start conversation' }).click();
    await expect(owner.page.getByText(/Online · same organization only/)).toBeVisible();
    await owner.page.getByLabel('Message').fill(originalMessage);
    await owner.page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(owner.page.getByText(originalMessage, { exact: true })).toBeVisible();

    await expect(member.page.getByTestId('tenant-messenger-toggle')).toHaveAttribute('aria-label', /1 unread/);
    await openMessenger(member.page);
    await member.page.getByRole('button', { name: /Messenger Owner/ }).click();
    await expect(member.page.getByText(originalMessage, { exact: true })).toBeVisible();
    await expect(member.page.getByText(/Online · same organization only/)).toBeVisible();

    await owner.page.getByRole('button', { name: 'Close messenger' }).last().click();
    await member.page.getByLabel('Message').fill(replyMessage);
    await member.page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(owner.page.getByText(new RegExp(replyMessage))).toBeVisible();
    await expect(owner.page.getByTestId('tenant-messenger-toggle')).toHaveAttribute('aria-label', /1 unread/);

    await openMessenger(owner.page);
    await owner.page.getByRole('button', { name: /Messenger Member/ }).click();
    const ownerMessage = owner.page.locator('article').filter({ hasText: originalMessage });
    await ownerMessage.getByRole('button', { name: 'Edit' }).click();
    await ownerMessage.getByLabel('Edit message').fill(editedMessage);
    await owner.page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(member.page.getByText(editedMessage, { exact: true })).toBeVisible();
    const memberEditedMessage = member.page.locator('article').filter({ hasText: editedMessage });
    const memberMessageTestId = await memberEditedMessage.getAttribute('data-testid');
    expect(memberMessageTestId).not.toBeNull();

    const editedOwnerMessage = owner.page.locator('article').filter({ hasText: editedMessage });
    await editedOwnerMessage.getByRole('button', { name: 'Delete' }).click();
    await editedOwnerMessage.getByRole('button', { name: 'Confirm delete' }).click();
    await expect(
      member.page.getByTestId(memberMessageTestId!).getByText('Message deleted', { exact: true }),
    ).toBeVisible();
  } finally {
    await owner.context.close();
    await member.context.close();
  }
});

test('P53-E2E-002: messenger remains usable as a full-screen title-bar surface on mobile', async ({ browser }) => {
  const session = await login(
    browser,
    required(OWNER_EMAIL, 'E2E_MESSENGER_OWNER_EMAIL'),
    required(OWNER_PASSWORD, 'E2E_MESSENGER_OWNER_PASSWORD'),
    { width: 390, height: 844 },
  );
  try {
    await openMessenger(session.page);
    const box = await session.page.getByTestId('tenant-messenger-panel').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBe(0);
    expect(box!.y).toBe(0);
    expect(box!.width).toBe(390);
    expect(box!.height).toBe(844);
    const overflow = await session.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  } finally {
    await session.context.close();
  }
});
