export const REQUIRED_SOURCE_TOKENS = Object.freeze([
  '--primary: 25 95% 44%',
  '--sidebar-primary: 25 95% 44%',
  '--chart-1: 25 95% 48%',
]);

export const REQUIRED_MODULE_TOKENS = Object.freeze([
  '--tfk-primary: hsl(25 95% 44%)',
  '--tfk-primary: hsl(25 95% 52%)',
  '--tfk-navy: hsl(220 45% 14%)',
  '--tfk-blue: hsl(214 88% 45%)',
]);

export const REQUIRED_ROUTE_PATTERNS = Object.freeze([
  "'/leads/demo'",
  "'/quotes/new'",
  "'/invoices/new'",
  "resource === 'quotes'",
  "resource === 'invoices'",
]);

const LEGACY_GREEN_PATTERN = /#(?:34d399|059669|047857|10b981|a7f3d0|ecfdf5|eef8f2|f0fdf4|f3faf6|f4fbf7|f6fbf8|f8fcfa|fbfefc)|rgba\((?:5\s*,\s*150\s*,\s*105|22\s*,\s*101\s*,\s*52|52\s*,\s*211\s*,\s*153|134\s*,\s*239\s*,\s*172)/gi;

export function findLegacyPaletteLiterals(source) {
  return [...String(source).matchAll(new RegExp(LEGACY_GREEN_PATTERN.source, LEGACY_GREEN_PATTERN.flags))]
    .map(match => match[0]);
}

export function validateTradeFlowKitVisualContract({ sourceCss, moduleCss, shellSource, routeMapSource }) {
  const issues = [];
  for (const token of REQUIRED_SOURCE_TOKENS) {
    if (!sourceCss.includes(token)) issues.push({ code: 'SOURCE_TOKEN_DRIFT', detail: token });
  }
  for (const token of REQUIRED_MODULE_TOKENS) {
    if (!moduleCss.includes(token)) issues.push({ code: 'MISSING_MODULE_TOKEN', detail: token });
  }
  if (!moduleCss.includes('.shell {')) issues.push({ code: 'UNSCOPED_MODULE_TOKENS', detail: '.shell' });
  if (!moduleCss.includes('@media (prefers-reduced-motion: reduce)')) issues.push({ code: 'MISSING_REDUCED_MOTION_CONTRACT' });
  if (!moduleCss.includes('@media (max-width: 720px)')) issues.push({ code: 'MISSING_MOBILE_CONTRACT' });
  if (!/\.iconButton\s*\{[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;/.test(moduleCss)) {
    issues.push({ code: 'UNDERSIZED_TOUCH_TARGET', detail: '.iconButton' });
  }
  if (!shellSource.includes('tradeflowkit-logo.png')) issues.push({ code: 'MISSING_SOURCE_LOGO' });
  if (!shellSource.includes('tradeflowkit-global-search-input')) issues.push({ code: 'DEAD_SEARCH_CONTROL' });
  if (/coming soon|not implemented|todo-only/i.test(shellSource)) issues.push({ code: 'PLACEHOLDER_COMPLETION_PATTERN' });
  for (const pattern of REQUIRED_ROUTE_PATTERNS) {
    if (!routeMapSource.includes(pattern)) issues.push({ code: 'MISSING_COMPATIBILITY_ROUTE', detail: pattern });
  }
  const green = findLegacyPaletteLiterals(`${moduleCss}\n${shellSource}`);
  if (green.length > 0) issues.push({ code: 'LEGACY_GREEN_PALETTE', detail: [...new Set(green)].join(', ') });
  return issues;
}
