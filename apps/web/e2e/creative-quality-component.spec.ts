import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, sep } from 'node:path';
import { build } from 'esbuild';
import { generateDeterministicKit, generateVisualPromos, NINJA_LAUNCH_PLAN_LIMITS } from '../../api/src/lib/ninja-launch-kit-phase34';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'package.json'));
const output = resolve(root, '../../../output/playwright/quality-oct27/creative');
// Regression mode is the default. Historical baseline capture is explicit.
const phase = process.env.CREATIVE_QA_PHASE === 'before' ? 'before' : 'after';
let bundle: string;
let css: string;

// Exact primary navigation destinations plus additional legacy workspace tabs.
// Dashboard pairs are already captured separately; this closes remaining tabs.
const closureRoutes: Record<string, string[]> = {
  brandforgeos: ['/brands', '/personas', '/campaigns', '/content', '/calendar', '/approvals', '/ai-workflows', '/analytics', '/reports', '/integrations', '/settings', '/offers', '/strategy', '/templates', '/activity', '/admin'],
  snapproofos: ['/customers', '/projects', '/jobs', '/capture', '/work', '/costs', '/templates', '/cases', '/evidence', '/findings', '/review', '/reports', '/share', '/exports', '/custody', '/retention', '/team', '/activity', '/branding', '/settings'],
  'studyforge-ai': ['/sources', '/sets', '/flashcards', '/quizzes', '/sessions', '/studio', '/progress', '/settings'],
  'ninja-launch-kit': ['/projects', '/templates', '/brief', '/deliverables', '/review', '/exports', '/settings'],
  ninjamation: ['/library', '/sources', '/generate', '/review', '/runs', '/versions', '/settings', '/admin'],
};

test('BrandForge disabled provider remains idle and does not imply saving', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await mount(page, 'brandforgeos', '/ai-workflows');
  await expect(page.getByText('Setup needed', { exact: true })).toBeVisible();
  await page.screenshot({ path: resolve(output, 'provider-disabled-current.png'), fullPage: true });
  await expect(page.getByRole('button', { name: 'Generate material', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).fixture.calls.filter((call: any) => call.method === 'generate').length)).toBe(0);
});

for (const [module, routes] of Object.entries(closureRoutes)) for (const route of routes) for (const width of [1440, 390]) {
  test(`route closure ${module}${route} at ${width}px`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mount(page, module, route);
    await expect(page.locator('h1').first()).toBeVisible();
    // These two real SnapProof screens are static central-management guidance;
    // an API request is not a condition of successfully rendering them.
    if (!(module === 'snapproofos' && ['/team', '/settings'].includes(route))) {
      await expect.poll(() => page.evaluate(() => (window as any).fixture.calls.length)).toBeGreaterThan(0);
    }
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await expect(page.getByText(/Loading your evidence workspace|Loading complete StudyForge learning records|Loading your courses and study progress/)).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    const contrast = module === 'brandforgeos' && route === '/brands'
      ? await page.getByRole('button', { name: 'Create brand system', exact: true }).evaluate(element => {
        const style = getComputedStyle(element);
        const luminance = (channels: number[]) => channels.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
        const text = luminance(style.color.match(/[\d.]+/g)!.slice(0, 3).map(Number));
        return [...style.backgroundImage.matchAll(/rgb\(([^)]+)\)/g)].map(match => { const background = luminance(match[1].split(',').map(Number)); return (Math.max(text, background) + .05) / (Math.min(text, background) + .05); });
      }) : null;
    if (contrast) { expect(contrast).toHaveLength(2); for (const ratio of contrast) expect(ratio).toBeGreaterThanOrEqual(4.5); }
    const name = `closure-${module}-${route.slice(1)}-${width}`;
    await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true, animations: 'disabled' });
    const receipt = await page.evaluate(() => ({
      headings: [...document.querySelectorAll('h1,h2,h3')].map(item => item.textContent),
      alerts: [...document.querySelectorAll('[role="alert"]')].map(item => item.textContent),
      calls: (window as any).fixture.calls.map((call: any) => `${call.namespace}.${call.method}`),
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      synthetic: true,
    }));
    writeFileSync(resolve(output, `${name}.json`), JSON.stringify({ ...receipt, errors, contrast }, null, 2) + '\n');
    expect(errors).toEqual([]);
    expect(receipt.alerts).toEqual([]);
    expect(receipt.horizontalOverflow).toBeLessThanOrEqual(1);
  });
}

for (const width of [1440, 390]) test(`populated closure StudyForge nested learning surfaces at ${width}px`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width, height: 1000 });
  await mount(page, 'studyforge-ai', '/sets', false, false, true);
  await page.getByRole('button', { name: /Network fundamentals.*active/ }).click();
  const workspace = page.locator('#studyforge-set-workspace');
  await expect(workspace.getByRole('heading', { name: 'Network fundamentals', exact: true })).toBeVisible();
  for (const tab of ['overview', 'flashcards', 'quiz', 'review', 'plan']) {
    await workspace.getByRole('button', { name: tab, exact: true }).click();
    // Full-page capture starts at document origin; otherwise a fixed off-screen
    // skip-link can be captured at its old scrolled viewport coordinate.
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    const inspection = await page.evaluate(() => {
      const link = document.querySelector('.ops-skip-link') as HTMLElement;
      const style = getComputedStyle(link); const rect = link.getBoundingClientRect();
      return { scrollY: window.scrollY, activeTag: document.activeElement?.tagName, activeText: document.activeElement?.textContent?.slice(0, 80), skipLinkFocused: link.matches(':focus'), skipLink: { top: rect.top, bottom: rect.bottom, position: style.position, transform: style.transform }, synthetic: true };
    });
    writeFileSync(resolve(output, `populated-studyforge-${tab}-${width}.json`), JSON.stringify(inspection, null, 2) + '\n');
    await page.screenshot({ path: resolve(output, `populated-studyforge-${tab}-${width}.png`), fullPage: true, animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
});

for (const width of [1440, 390]) test(`populated closure Script Ops approved detail at ${width}px`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width, height: 1000 });
  await mount(page, 'ninjamation', '/scripts/script-a', false, false, true);
  await expect(page.getByTestId('code-ninjamation-source')).toHaveText('Get-ComputerInfo');
  await expect(page.getByRole('button', { name: 'Download verified version', exact: true })).toBeVisible();
  await page.screenshot({ path: resolve(output, `populated-ninjamation-detail-${width}.png`), fullPage: true, animations: 'disabled' });
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

for (const [module, route, marker] of [['brandforgeos', '/reports', 'Campaign review'], ['snapproofos', '/reports', 'Site work review'], ['ninja-launch-kit', '/deliverables', 'Support planning campaign']]) for (const width of [1440, 390]) {
  test(`populated records ${module}${route} at ${width}px`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await mount(page, module, route, false, false, true);
    if (module === 'ninja-launch-kit') await expect(page.getByRole('heading', { name: marker, exact: true })).toBeVisible();
    else await expect(page.getByText(marker, { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: resolve(output, `populated-${module}-${route.slice(1)}-${width}.png`), fullPage: true, animations: 'disabled' });
    if (module === 'ninja-launch-kit') await page.locator('#launchkit-outputs').screenshot({ path: resolve(output, `populated-deploy-copy-section-${width}.png`), animations: 'disabled' });
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });
}

test.beforeAll(async () => {
  mkdirSync(output, { recursive: true });
  const result = await build({
    stdin: { contents: `import '@fontsource-variable/inter/wght.css';import '@fontsource-variable/open-sans/wght.css';import React from 'react';import{createRoot}from'react-dom/client';import Brand from './src/components/module-shells/BrandForgeRouteShell';import Snap from './src/components/module-shells/SnapProofShell';import Study from './src/components/module-shells/StudyForgeRouteShell';import Deploy from './src/components/module-shells/NinjaLaunchKitRouteShell';import Script from './src/components/module-shells/NinjamationRouteShell';const views={brandforgeos:Brand,snapproofos:Snap,'studyforge-ai':Study,'ninja-launch-kit':Deploy,ninjamation:Script};createRoot(document.getElementById('root')).render(React.createElement(views[window.fixture.module],{routePath:window.fixture.route}));`, resolveDir: root, loader: 'tsx' },
    bundle: true, write: false, metafile: true, outdir: 'fixture', platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"' }, loader: { '.woff2': 'dataurl' },
    alias: { '@': resolve(root, 'src'), react: dirname(require.resolve('react')), 'react-dom': dirname(require.resolve('react-dom')) },
    plugins: [{ name: 'synthetic-creative-boundaries', setup(plugin) {
      plugin.onResolve({ filter: /^(next\/navigation|next\/link|next\/dynamic|next\/image|@\/lib\/auth)$/ }, args => ({ path: args.path, namespace: 'synthetic' }));
      plugin.onResolve({ filter: /(?:^|[\\/])(AuthProvider|TenantProvider|ModuleAccessContext)(?:\.tsx)?$/ }, args => ({ path: `@/components/${args.path.split(/[\\/]/).at(-1)!.replace(/\.tsx$/, '')}`, namespace: 'synthetic' }));
      plugin.onResolve({ filter: /ModuleDeepLinkTarget$/ }, () => ({ path: 'deep-link', namespace: 'synthetic' }));
      plugin.onLoad({ filter: /.*/, namespace: 'synthetic' }, args => {
        const modules: Record<string, string> = {
          'next/navigation': `export const usePathname=()=>'/modules/'+window.fixture.module+window.fixture.route;export const useSearchParams=()=>new URLSearchParams();export const useRouter=()=>({push:path=>window.fixture.navigation.push(path),replace:path=>window.fixture.navigation.push(path)});`,
          'next/link': `import React from'react';export default function Link({children,...props}){return React.createElement('a',props,children)}`,
          'next/image': `import React from'react';export default function Image({src,fill,priority,unoptimized,...props}){return React.createElement('img',{...props,src:typeof src==='string'?src:src.src})}`,
          'next/dynamic': `import React from'react';export default function dynamic(loader,options){const Component=React.lazy(loader);return props=>React.createElement(React.Suspense,{fallback:options?.loading?React.createElement(options.loading):null},React.createElement(Component,props))}`,
          '@/components/AuthProvider': `export const useAuth=()=>({user:{id:'qa-user',name:'Jordan Lee',platformRole:'user',currentTenantId:'qa-tenant'},loading:false,captureIdentity:()=>()=>true});`,
          '@/components/TenantProvider': `export const useTenant=()=>({activeTenant:{id:'qa-tenant',name:'Northstar Studio'},activeRole:window.fixture.viewer?'viewer':'owner',loading:false});`,
          '@/components/ModuleAccessContext': `export const useModuleAccessLevel=()=>window.fixture.viewer?'viewer':'manager';`,
          'deep-link': `export const useModuleDeepLinkTarget=()=>({routePath:window.fixture.route});`,
          '@/lib/auth': `const api=new Proxy({},{get:(_,namespace)=>new Proxy({},{get:(_,method)=>(...args)=>window.fixtureApi(namespace,method,args)})});const empty=new Proxy({},{get:()=>async()=>({organizations:[],items:[]})});export const moduleShellApi=api;export const getActiveTenantId=()=> 'qa-tenant';export const setActiveTenantId=()=>{};export const dataFabricApi=empty;export const businessDirectoryApi=empty;export const sharedCustomersApi={list:async()=>({customers:[],pagination:{hasMore:false},canWrite:!window.fixture.viewer})};export const sharedPlatformApi=empty;export const authApi=empty;export const meApi=empty;export const tenantApi=empty;export const moduleApi=empty;`,
        };
        return { contents: modules[args.path], loader: 'js' };
      });
    } }],
  });
  bundle = result.outputFiles.find(file => file.path.endsWith('.js'))!.text;
  css = readFileSync(resolve(root, 'src/app/globals.css'), 'utf8') + '\n' + (result.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '');
  const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
  const sources = Object.keys(result.metafile.inputs).map(path => resolve(root, path)).filter(path => existsSync(path));
  sources.push(resolve(root, 'src/app/globals.css'));
  const manifestPhase = process.env.CREATIVE_QA_SUITE === 'closure' ? 'closure' : phase;
  writeFileSync(resolve(output, `render-${manifestPhase}-manifest.json`), JSON.stringify({
    capturedAtUtc: new Date().toISOString(), scope: 'Actual components and styles; synthetic auth, tenant and API boundaries; external requests blocked',
    javascriptSha256: hash(bundle), cssSha256: hash(css),
    sources: [...new Set(sources)].sort().map(path => ({ path, sha256: hash(readFileSync(path)) })),
  }, null, 2) + '\n');
});

async function mount(page: Page, module: string, route = '/dashboard', fail = false, viewer = false, populated = false) {
  const launchInput = { businessName: 'Northstar Support', businessType: 'Technical support', targetCustomer: 'Local business owners', offer: 'A support planning appointment', tone: 'professional' as const, painPoint: 'Unclear support priorities', desiredAction: 'Request an appointment' };
  const content = generateDeterministicKit(launchInput);
  const launchFixture = { kit: { id: 'kit-a', title: 'Support planning campaign', status: 'draft', version: 1, content, visualPromos: generateVisualPromos(launchInput, content, 'agency'), input: launchInput }, capabilities: { ownedByCurrentUser: true, canManage: true }, access: { plan: 'agency', source: 'application_stack', limits: NINJA_LAUNCH_PLAN_LIMITS.agency } };
  await page.route('**/*', response => {
    const requested = new URL(response.request().url());
    if (requested.origin !== 'http://localhost:55497') return response.abort('blockedbyclient');
    const pathname = requested.pathname;
    const asset = resolve(root, 'public', pathname.slice(1));
    if (/\.(png|webp|svg)$/i.test(pathname) && asset.startsWith(resolve(root, 'public') + sep) && existsSync(asset)) return response.fulfill({ path: asset });
    return response.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="root"></div></body></html>' });
  });
  await page.goto('http://localhost:55497/');
  await page.evaluate(({ module, route, fail, viewer, populated, launchFixture }) => {
    const state = window as any;
    state.fixture = { module, route, fail, viewer, populated, navigation: [], calls: [], folders: [], delayedCase: null };
    const studySet = { id: 'study-set-a', title: 'Network fundamentals', course: 'NET-201', difficulty: 'medium', status: 'active', version: 1, qualityScore: 90, summary: 'Private synthetic notes about switches and local networks.', keyTerms: [{ term: 'Switch', definition: 'Connects devices within a local network.' }], cards: [{ id: 'card-a', question: 'What connects devices in a local network?', answer: 'A network switch.', sourceExcerpt: 'A switch connects devices within a local network.', state: 'new' }], questions: [{ id: 'question-a', question: 'Which device connects a local network?', choices: ['Switch', 'Printer', 'Keyboard', 'Monitor'], correctIndex: 0, explanation: 'The notes identify a switch.', sourceExcerpt: 'A switch connects devices within a local network.' }], shortAnswers: [{ id: 'answer-a', question: 'Describe a switch.', answer: 'It connects devices in a local network.' }], studyPlan: [{ id: 'plan-a', title: 'Review switching', focus: 'Recall the role of a local network switch.', position: 0, estimatedMinutes: 15, completedAt: null }], reviewSheet: { sections: [{ heading: 'Local networks', bullets: ['A switch connects local devices.'] }], cramSection: ['Recall the switch.'] }, attempts: [], generationProvenance: { effectiveMode: 'deterministic' } };
    const script = { id: 'script-a', name: 'Inventory overview', displayName: 'Inventory overview', description: 'Synthetic read-only inventory source for visual review.', language: 'powershell', category: 'Inventory', status: 'approved', source: 'manual', currentVersionNumber: 1, version: 1, safetyStatus: 'review_required', downloadCount: 0, content: 'Get-ComputerInfo', contentSha256: 'fixture-not-a-live-integrity-check', staticAnalysis: { findings: [] } };
    const cases = ['a', 'b'].map((letter, index) => ({ id: `case-${letter}`, reference: `PROOF-10${index}`, title: `Case ${letter.toUpperCase()}`, status: 'open', version: 1, createdAt: '2026-10-20T12:00:00Z' }));
    state.fixtureApi = async (namespace: string, method: string, args: any[]) => {
      state.fixture.calls.push({ namespace, method, args });
      if (state.fixture.fail) throw new Error('Temporary workspace failure');
      if (namespace === 'brandforgeos') {
        if (method === 'dashboard') return { counts: { brands: 0, personas: 0, campaigns: 0, copy_assets: 0, calendar_items: 0, generations: 0 } };
        if (method === 'listCampaigns') return { campaigns: [] };
        if (method === 'listCalendar') return { calendarItems: [] };
        if (method === 'listBrands') return { brands: [] };
        if (method === 'listPersonas') return { personas: [] };
        if (method === 'listCopyAssets') return { copyAssets: [] };
        if (method === 'listGenerations') return { generations: [], provider: { name: 'disabled', configured: false } };
        if (method === 'listRecommendations') return { recommendations: [] };
        if (method === 'listOffers') return { offers: [] };
        if (method === 'listWorkflows') return { workflows: [] };
        if (method === 'listLeads') return { leads: [] };
        if (method === 'listTemplates') return { templates: [] };
        if (method === 'listReports') return { reports: populated ? [{ id: 'report-a', name: 'Campaign review', report_type: 'campaign_summary', status: 'generated', snapshot_sha256: 'synthetic-not-a-live-file-verification', snapshot: { metrics: { impressions: 0, clicks: 0, conversions: 0 } } }] : [] };
        if (method === 'listExports') return { exports: [] };
        if (method === 'activity') return { activity: [] };
        if (method === 'notifications') return { notifications: [] };
        if (method === 'productOverview') return { metrics: {}, offers: [], workflows: [], recommendations: [] };
        if (method === 'workspace') return { profile: {}, version: 1 };
        if (method === 'planUsage') return { accessModel: 'application_stack', authority: 'operatoros', module: { status: 'enabled' }, credits: { used: 0, limit: null, unmetered: true } };
        if (method === 'listIntegrations') return { integrations: [], providerConfigurations: [] };
        if (method === 'productContract') return { capabilities: {}, providers: [] };
      }
      if (namespace === 'snapproofos') {
        if (method === 'dashboard') return { counts: { cases: 2, activeJobs: 0 } };
        if (method === 'listCases') return { items: cases };
        if (method === 'customers') return { customers: [] };
        if (method === 'jobs') return { jobs: [] };
        if (method === 'templates') return { templates: [] };
        if (method === 'team') return { members: [] };
        if (method === 'activity') return { events: [] };
        if (method === 'branding') return { branding: {} };
        if (method === 'listExports') return { exports: [] };
        if (method === 'listReports') return { items: populated ? [{ id: 'report-a', caseId: 'case-a', title: 'Site work review', status: 'approved', caseReference: 'PROOF-100', snapshotSha256: 'synthetic-not-a-live-file-verification' }] : [] };
        if (method === 'listEvidence') return { items: [] };
        if (method === 'getCase') return { case: cases.find(row => row.id === args[0]), evidence: [], findings: [] };
        if (method === 'custody') {
          if (state.fixture.emptyCustody) return { events: [] };
          if (state.fixture.delayedCase === args[0]) await new Promise(resolve => { state.releaseOldCase = resolve; });
          return { events: [{ id: args[0], previousHash: null, eventHash: args[0], eventType: `${args[0]}_capture`, sequenceNumber: 1, createdAt: '2026-10-20T12:00:00Z' }] };
        }
      }
      if (namespace === 'studyforge') {
        if (method === 'completeSet') return studySet;
        if (method === 'createFolder') { const folder = { id: 'local-folder', name: args[0].name }; state.fixture.folders.push(folder); return { folder }; }
        if (method === 'completeWorkspace') return { preferences: { onboardingComplete: true, defaultDifficulty: 'medium', timeZone: 'UTC' }, plan: { plan: 'pro', source: 'application_stack', limits: { flashcardsPerSet: 40, generationsPerMonth: 100, quizAttemptsPerMonth: 100, advancedExport: true } }, usage: { generationCount: 0, quizAttemptCount: 0 }, metrics: { activeSets: populated ? 1 : 0, totalStudyMinutes: 0, cardsReviewed: 0, averageQuizScore: null, currentStreak: 0, longestStreak: 0 }, folders: state.fixture.folders, sets: populated ? [studySet] : [], countdowns: [], activity: [], quizTrend: [] };
        if (method === 'workspace') return { dashboard: {}, subjects: [], sources: [], decks: [], cards: [], quizzes: [], questions: [], attempts: [], plans: [], sessions: [], progress: [], generations: [], ai: { name: 'disabled', configured: false } };
      }
      if (namespace === 'launchkit') {
        if (method === 'productOverview') return { metrics: { kits: populated ? 1 : 0, archived: 0, aiRefined: 0 }, kits: populated ? [launchFixture.kit] : [], exports: [], brands: [], usage: { generationCount: 0 }, access: populated ? launchFixture.access : { plan: 'pro', source: 'application_stack', limits: {} }, sourceCounts: { templates: 0, visualPromos: 0 } };
        if (method === 'productKit') return launchFixture;
        if (method === 'productTemplates') return { templates: [], visualPromos: [] };
        if (method === 'workspace') return { summary: { launches: 0, launched: 0, overdue: 0 }, launches: [] };
      }
      if (namespace === 'ninjamation') {
        if (method === 'productWorkspace') return { metrics: { scripts: 0, approved: 0, inReview: 0, favorites: 0, downloads: 0, generated: 0 }, categories: [], syncRuns: [], recentScripts: [], access: { plan: 'pro', source: 'application_stack' }, planUsage: {}, execution: {}, catalog: { repository: 'Approved organization library', branch: 'main', pinnedCommit: 'reviewed-fixture' } };
        if (method === 'productScripts') return { scripts: populated ? [script] : [], page: 1, total: populated ? 1 : 0, totalPages: 1 };
        if (method === 'productDetail') return { script, versions: [{ id: 'version-a', versionNumber: 1, contentSha256: script.contentSha256 }], syncHistory: [], favorite: false };
        if (method === 'account') return { profile: { name: 'Jordan Lee', email: 'jordan@example.test' }, usage: {}, access: { plan: 'pro', source: 'application_stack', limits: { monthlyDownloads: 100, monthlyGenerations: 100 } }, preferences: {}, generationHistory: [], billingManagementPath: '/app/billing' };
        if (method === 'admin') return { stats: {}, users: [], schedules: [], syncRuns: [], management: { users: '/app/platform/tenants/qa-tenant' } };
      }
      return {};
    };
  }, { module, route, fail, viewer, populated, launchFixture });
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: bundle });
}

const modules = [
  ['brandforgeos', 'brandforgeos-workspace'], ['snapproofos', 'snapproofos-overview-route'],
  ['studyforge-ai', 'studyforge-phase33-complete'], ['ninja-launch-kit', 'shell-ninja-launch-kit-complete'], ['ninjamation', 'shell-ninjamation'],
] as const;

for (const [module, testId] of modules) {
  for (const width of [1440, 390]) test(`${module} real rendered dashboard at ${width}px`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mount(page, module);
    await expect(page.getByTestId(testId)).toBeVisible();
    if (width === 1440) await expect(page.getByText('Northstar Studio', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Temporary workspace failure')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: resolve(output, `${phase}-${module}-${width}.png`), fullPage: true, animations: 'disabled' });
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });
}

test('StudyForge initial API failures recover without an endless loading state', async ({ page }) => {
  await mount(page, 'studyforge-ai', '/dashboard', true);
  await expect(page.getByText('Temporary workspace failure').first()).toBeVisible();
  if (phase === 'before') { await page.screenshot({ path: resolve(output, 'before-studyforge-error.png'), fullPage: true }); return; }
  await expect(page.getByText('Loading complete StudyForge learning records.')).toHaveCount(0);
  await page.screenshot({ path: resolve(output, 'after-studyforge-error.png'), fullPage: true });
  await page.evaluate(() => { (window as any).fixture.fail = false; });
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your study command center' })).toBeVisible();
  await expect(page.getByText('Temporary workspace failure')).toHaveCount(0);
  await page.screenshot({ path: resolve(output, 'after-studyforge-recovered.png'), fullPage: true });
});

test('SnapProof custody selection cannot be overwritten by a delayed prior case', async ({ page }) => {
  await mount(page, 'snapproofos', '/custody');
  const select = page.getByLabel('Case', { exact: true });
  await expect(page.getByText('case-a capture', { exact: true })).toBeVisible();
  await select.selectOption('case-b');
  await expect(page.getByText('case-b capture', { exact: true })).toBeVisible();
  await page.evaluate(() => { (window as any).fixture.delayedCase = 'case-a'; });
  await select.selectOption('case-a');
  await select.selectOption('case-b');
  await expect(page.getByText('case-b capture', { exact: true })).toBeVisible();
  await page.evaluate(() => (window as any).releaseOldCase());
  if (phase === 'before') { await expect(page.getByText('case-a capture', { exact: true })).toBeVisible(); await page.screenshot({ path: resolve(output, 'before-snapproof-stale-custody.png'), fullPage: true }); return; }
  await expect(page.getByText('case-a capture', { exact: true })).toHaveCount(0);
  await expect(page.getByText('case-b capture', { exact: true })).toBeVisible();
  await page.screenshot({ path: resolve(output, 'after-snapproof-current-custody.png'), fullPage: true });
});


test('StudyForge materials recover from an initial failure', async ({ page }) => {
  test.skip(phase === 'before', 'Added regression for the implemented error state.');
  await mount(page, 'studyforge-ai', '/sources', true);
  await expect(page.getByText('Temporary workspace failure').first()).toBeVisible();
  await expect(page.getByText('Loading your courses and study progress.')).toHaveCount(0);
  await page.evaluate(() => { (window as any).fixture.fail = false; });
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Subjects and courses', exact: true })).toBeVisible();
  await expect(page.getByText('Temporary workspace failure')).toHaveCount(0);
});

test('SnapProof never calls an empty custody trail verified', async ({ page }) => {
  test.skip(phase === 'before', 'Added regression for empty custody truthfulness.');
  await mount(page, 'snapproofos', '/custody');
  await expect(page.getByText('case-a capture', { exact: true })).toBeVisible();
  await page.evaluate(() => { (window as any).fixture.emptyCustody = true; });
  await page.getByLabel('Case', { exact: true }).selectOption('case-b');
  await expect(page.getByText('No custody events exist for this case.')).toBeVisible();
  await expect(page.getByText('No custody events to verify', { exact: true })).toBeVisible();
  await expect(page.getByText('Displayed custody links are continuous', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: resolve(output, 'after-snapproof-empty-custody.png'), fullPage: true });
});

for (const [module, marker] of [['brandforgeos', 'brandforgeos-dashboard'], ['ninja-launch-kit', 'launchkit-dashboard'], ['ninjamation', 'section-ninjamation-dashboard']]) {
  test(`${module} initial failure is recoverable without a false dashboard`, async ({ page }) => {
    await mount(page, module, '/dashboard', true);
    await expect(page.getByText('Temporary workspace failure').first()).toBeVisible();
    if (phase === 'before') { await page.screenshot({ path: resolve(output, `before-${module}-error.png`), fullPage: true }); return; }
    const dashboard = module === 'ninja-launch-kit' ? page.locator('#launchkit-dashboard') : page.getByTestId(marker);
    await expect(dashboard).toHaveCount(0);
    await page.screenshot({ path: resolve(output, `after-${module}-error.png`), fullPage: true });
    await page.evaluate(() => { (window as any).fixture.fail = false; });
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(dashboard).toBeVisible();
    await expect(page.getByText('Temporary workspace failure')).toHaveCount(0);
  });
}


const readOnlyRoutes = [
  ['brandforgeos', '/brands', 'brandforgeos-workspace', 'Create brand system'],
  ['snapproofos', '/retention', 'snapproofos-retention-route', 'Save retention'],
  ['studyforge-ai', '/sets', 'studyforge-phase33-complete', 'Add folder'],
  ['ninja-launch-kit', '/brief', 'shell-ninja-launch-kit-complete', 'Generate and persist full kit'],
  ['ninjamation', '/generate', 'shell-ninjamation', 'Generate unapproved draft'],
] as const;
for (const [module, route, marker, blockedAction] of readOnlyRoutes) test(`${module} retains read-only controls at its work surface`, async ({ page }) => {
  test.skip(phase === 'before', 'Targeted regression after responsive style and state changes.');
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 1000 });
  await mount(page, module, route, false, true);
  if (module === 'brandforgeos') await expect(page.getByTestId('brandforgeos-read-only')).toBeVisible();
  else if (module === 'ninjamation') await expect(page.getByTestId('ninjamation-generation-read-only')).toBeVisible();
  else await expect(page.getByTestId(marker)).toHaveAttribute('data-can-write', 'false');
  const action = page.getByRole('button', { name: blockedAction, exact: true });
  if (module === 'brandforgeos') {
    await expect(page.getByRole('heading', { name: 'Brand HQ', exact: true })).toBeVisible();
    await expect(page.getByText('No matching customers. Try another name or add a customer in your business directory.')).toBeVisible();
    await expect(action).toBeDisabled();
  } else if (module === 'studyforge-ai') {
    await page.getByLabel('New folder name', { exact: true }).fill('Read-only fixture');
    await expect(action).toBeDisabled();
  } else if (module === 'ninja-launch-kit') await expect(action).toBeDisabled();
  else await expect(action).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve(output, `after-${module}-viewer-390.png`), fullPage: true });
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => (window as any).fixture.calls.some((call: any) => /^(create|update|generate|approve|retire|sync)/i.test(call.method)))).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test('BrandForge brand form has a visible keyboard focus and comfortable mobile targets', async ({ page }) => {
  test.skip(phase === 'before', 'Targeted regression for the changed local styles.');
  await page.setViewportSize({ width: 390, height: 1000 });
  await mount(page, 'brandforgeos', '/brands');
  const name = page.getByLabel('Brand name', { exact: true });
  await expect(page.getByText('No matching customers. Try another name or add a customer in your business directory.')).toBeVisible();
  await name.fill('Local quality fixture');
  await name.focus();
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => { const element = document.activeElement as HTMLElement; const style = getComputedStyle(element); return { outline: style.outlineStyle, height: element.getBoundingClientRect().height }; });
  expect(focused.outline).not.toBe('none');
  expect(focused.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: resolve(output, 'after-brandforgeos-form-keyboard-390.png'), fullPage: true });
});

test('StudyForge folder creation refreshes the organizer using local fixtures', async ({ page }) => {
  test.skip(phase === 'before', 'Targeted existing workflow regression.');
  await mount(page, 'studyforge-ai', '/sets');
  await page.getByLabel('New folder name', { exact: true }).fill('Network fundamentals');
  await page.getByRole('button', { name: 'Add folder', exact: true }).click();
  await expect(page.locator('#studyforge-sets').getByText('Network fundamentals', { exact: true })).toBeVisible();
  await expect(page.getByLabel('New folder name', { exact: true })).toHaveValue('');
  expect(await page.evaluate(() => (window as any).fixture.calls.filter((call: any) => call.method === 'createFolder').length)).toBe(1);
  await page.screenshot({ path: resolve(output, 'after-studyforge-folder-created.png'), fullPage: true });
});
