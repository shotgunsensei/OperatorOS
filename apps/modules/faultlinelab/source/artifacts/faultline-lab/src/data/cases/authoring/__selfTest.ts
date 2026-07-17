import { composeCase } from './helpers';
import { createTemplate, type DomainTemplate } from './templates';

const DOMAINS: DomainTemplate[] = [
  'windows-ad',
  'networking',
  'servers',
  'automotive',
  'electronics',
  'mixed',
  'healthcare-imaging',
];

/**
 * Boot-time integration proof: runs every per-domain template through
 * `composeCase`, which exercises the full validator + lift path. If any
 * template ever drifts out of agreement with the validator, the dev
 * server will throw on boot — exactly the failure mode we want.
 *
 * No-op in production builds.
 */
export function runAuthoringSelfTest(): void {
  if (!import.meta.env.DEV) return;
  const failures: string[] = [];
  for (const domain of DOMAINS) {
    try {
      const draft = createTemplate(domain, {
        id: `__selftest-${domain}`,
        slug: `__selftest-${domain}`,
        title: `Self-test: ${domain}`,
        difficulty: 'intermediate',
      });
      composeCase(draft);
    } catch (e) {
      failures.push(
        `[authoring self-test] ${domain} template failed composeCase: ${(e as Error).message}`
      );
    }
  }
  if (failures.length > 0) {
    throw new Error(failures.join('\n\n'));
  }
}
