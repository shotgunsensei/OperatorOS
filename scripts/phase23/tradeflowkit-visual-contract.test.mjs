import test from 'node:test';
import assert from 'node:assert/strict';
import { findLegacyPaletteLiterals, validateTradeFlowKitVisualContract } from './tradeflowkit-visual-contract.mjs';

const valid = {
  sourceCss: ':root { --primary: 25 95% 44%; --sidebar-primary: 25 95% 44%; --chart-1: 25 95% 48%; }',
  moduleCss: `.shell { --tfk-primary: hsl(25 95% 44%); --tfk-navy: hsl(220 45% 14%); --tfk-blue: hsl(214 88% 45%); }\n.iconButton { min-width: 44px; min-height: 44px; }\n@media (prefers-color-scheme: dark) { .shell { --tfk-primary: hsl(25 95% 52%); } }\n@media (prefers-reduced-motion: reduce) {}\n@media (max-width: 720px) {}`,
  shellSource: 'tradeflowkit-logo.png tradeflowkit-global-search-input',
  routeMapSource: "'/leads/demo' '/quotes/new' '/invoices/new' resource === 'quotes' resource === 'invoices'",
};

test('the complete Phase 23 visual contract accepts the source-faithful fixture', () => {
  assert.deepEqual(validateTradeFlowKitVisualContract(valid), []);
});

test('controlled negative: legacy green shell palette is rejected', () => {
  assert.deepEqual(findLegacyPaletteLiterals('color: #059669; background: rgba(52, 211, 153, 0.18)'), ['#059669', 'rgba(52, 211, 153']);
});

for (const [name, mutate, code] of [
  ['source token drift', value => ({ ...value, sourceCss: '' }), 'SOURCE_TOKEN_DRIFT'],
  ['module token loss', value => ({ ...value, moduleCss: value.moduleCss.replace('--tfk-primary: hsl(25 95% 44%);', '') }), 'MISSING_MODULE_TOKEN'],
  ['reduced-motion loss', value => ({ ...value, moduleCss: value.moduleCss.replace('@media (prefers-reduced-motion: reduce) {}', '') }), 'MISSING_REDUCED_MOTION_CONTRACT'],
  ['undersized touch target', value => ({ ...value, moduleCss: value.moduleCss.replaceAll('44px', '40px') }), 'UNDERSIZED_TOUCH_TARGET'],
  ['dead search control', value => ({ ...value, shellSource: value.shellSource.replace('tradeflowkit-global-search-input', '') }), 'DEAD_SEARCH_CONTROL'],
  ['compatibility route loss', value => ({ ...value, routeMapSource: value.routeMapSource.replace("'/quotes/new'", '') }), 'MISSING_COMPATIBILITY_ROUTE'],
  ['placeholder route', value => ({ ...value, shellSource: `${value.shellSource} coming soon` }), 'PLACEHOLDER_COMPLETION_PATTERN'],
]) {
  test(`controlled negative: ${name} is rejected`, () => {
    assert.ok(validateTradeFlowKitVisualContract(mutate(valid)).some(issue => issue.code === code));
  });
}
