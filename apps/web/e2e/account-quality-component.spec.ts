import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'package.json'));
const output = resolve(root, '../../../output/playwright/quality-oct27/core');
let bundle = '';
let css = '';

test.beforeAll(async () => {
  mkdirSync(output, { recursive: true });
  const palette = readFileSync(resolve(root, 'src/components/SaasLayout.tsx'), 'utf8').match(/const colors = \{[\s\S]*?\n\};/)?.[0];
  if (!palette) throw new Error('Canonical palette not found');
  const result = await build({
    stdin: { contents: `import '@fontsource-variable/inter/wght.css';import '@fontsource-variable/open-sans/wght.css';import React from 'react';import{createRoot}from'react-dom/client';import Register from './src/components/pages/RegisterPage';import Forgot from './src/components/pages/ForgotPasswordPage';import Reset from './src/components/pages/ResetPasswordPage';import Verify from './src/components/pages/VerifyEmailPage';const views={register:Register,forgot:Forgot,reset:Reset,verify:Verify};createRoot(document.getElementById('root')).render(React.createElement(views[window.fixture.mode],{onSwitch:mode=>window.fixture.navigation.push(mode)}));`, resolveDir: root, loader: 'tsx' },
    bundle: true, write: false, outdir: 'fixture', platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"' }, loader: { '.woff2': 'dataurl' },
    alias: { '@': resolve(root, 'src'), react: dirname(require.resolve('react')), 'react-dom': dirname(require.resolve('react-dom')) },
    plugins: [{ name: 'synthetic-account-boundaries', setup(plugin) {
      plugin.onResolve({ filter: /^\/media\// }, args => ({ path: args.path, external: true }));
      plugin.onResolve({ filter: /(?:^|[\\/])SaasLayout(?:\.tsx)?$/ }, () => ({ path: 'palette', namespace: 'fixture' }));
      plugin.onResolve({ filter: /(?:^|[\\/])AuthProvider(?:\.tsx)?$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
      plugin.onResolve({ filter: /^(next\/link|next\/image|@\/lib\/auth)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: {
        palette: `export ${palette}`,
        auth: `export const useAuth=()=>({register:async(...args)=>{window.fixture.calls.push({method:'register',args});throw {code:'REGISTRATION_SUBMITTED'};}});`,
        'next/link': `import React from'react';export default function Link({children,...props}){return React.createElement('a',props,children)}`,
        'next/image': `import React from'react';export default function Image({src,fill,priority,unoptimized,...props}){return React.createElement('img',{...props,src:typeof src==='string'?src:src.src})}`,
        '@/lib/auth': `export const authApi={forgotPassword:async(...args)=>{window.fixture.calls.push({method:'forgot',args});return{}},resetPassword:async(...args)=>{window.fixture.calls.push({method:'reset',args});return{}},confirmEmailVerification:async(...args)=>{window.fixture.calls.push({method:'verify',args});return{emailChanged:false}}};`,
      }[args.path]!, loader: 'js' }));
    } }],
  });
  bundle = result.outputFiles.find(file => file.path.endsWith('.js'))!.text;
  css = readFileSync(resolve(root, 'src/app/globals.css'), 'utf8') + '\n' + (result.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '');
});

async function mount(page: Page, mode: string, query = '') {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'localhost') return route.abort();
    const asset = resolve(root, 'public', url.pathname.slice(1));
    if (/\.(png|webp|svg|ico|woff2)$/i.test(url.pathname) && asset.startsWith(resolve(root, 'public')) && existsSync(asset)) return route.fulfill({ path: asset });
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;font-family:Inter Variable,Inter,sans-serif"><div id="root"></div></body></html>' });
  });
  await page.goto(`http://localhost:55498/login${query}`);
  await page.evaluate(mode => { (window as any).fixture = { mode, calls: [], navigation: [] }; }, mode);
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: bundle });
  await page.getByRole('heading', { level: 1 }).waitFor();
}

for (const width of [1440, 390]) {
  for (const mode of ['register', 'forgot', 'reset', 'verify']) {
    test(`${mode} readable and responsive at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await mount(page, mode);
      await page.evaluate(() => document.fonts.ready);
      await page.locator('img').evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode())));
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      const unlabeled = await page.locator('input').evaluateAll(inputs => inputs.filter(input => !(input as HTMLInputElement).labels?.length && !input.getAttribute('aria-label')).length);
      expect(unlabeled).toBe(0);
      await page.screenshot({ path: resolve(output, `${mode}-after-${width}.png`), fullPage: true });
    });
  }
}

test('registration preserves neutral verification result and keyboard labels', async ({ page }) => {
  await mount(page, 'register');
  await page.getByLabel('Full name', { exact: true }).fill('Synthetic Local User');
  await page.getByLabel('Email', { exact: true }).fill('local-fixture@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('SyntheticOnlyPassword123!');
  await page.getByTestId('button-register').click();
  await expect(page.getByTestId('register-success')).toBeVisible();
  await expect(page.getByTestId('register-success')).toContainText('If this email is new');
  expect(await page.evaluate(() => (window as any).fixture.calls.length)).toBe(1);
  await page.getByTestId('button-go-login').click();
  expect(await page.evaluate(() => (window as any).fixture.navigation)).toEqual(['login']);
});

test('password recovery validates matching passwords and keeps token out of URL', async ({ page }) => {
  await mount(page, 'reset');
  await page.getByLabel('Reset token', { exact: true }).fill('local-disposable-fixture');
  await page.getByLabel('New password', { exact: true }).fill('SyntheticOnlyPassword123!');
  await page.getByLabel('Confirm password', { exact: true }).fill('DifferentPassword123!');
  await page.getByTestId('button-reset-password').click();
  await expect(page.getByRole('alert')).toContainText('Passwords do not match');
  expect(await page.evaluate(() => (window as any).fixture.calls.length)).toBe(0);
  await page.getByLabel('Confirm password', { exact: true }).fill('SyntheticOnlyPassword123!');
  await page.getByTestId('button-reset-password').click();
  await expect(page.getByRole('status')).toContainText('Password reset successfully');
  await expect(page.getByLabel('Reset token', { exact: true })).toHaveValue('');
  expect(page.url()).not.toContain('local-disposable-fixture');
});

test('forgot request and one-use verification keep their original message contracts', async ({ page }) => {
  await mount(page, 'forgot');
  await page.getByLabel('Email', { exact: true }).fill('local-fixture@example.invalid');
  await page.getByTestId('button-reset').click();
  await expect(page.getByTestId('reset-sent')).toContainText('If that email exists');
  await page.getByTestId('link-reset-password').click();
  expect(await page.evaluate(() => (window as any).fixture.navigation)).toEqual(['reset-password']);
  await mount(page, 'verify', '?mode=verify-email&token=local-disposable-fixture');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Email verified');
  expect(page.url()).not.toContain('token=');
  expect(await page.evaluate(() => (window as any).fixture.calls.length)).toBe(1);
});
