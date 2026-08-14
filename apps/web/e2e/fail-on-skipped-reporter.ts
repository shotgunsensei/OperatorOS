import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FullConfig, FullResult, Reporter, Suite } from '@playwright/test/reporter';

export default class FailOnSkippedReporter implements Reporter {
  private suite: Suite | undefined;

  onBegin(_config: FullConfig, suite: Suite): void {
    this.suite = suite;
  }

  async onEnd(result: FullResult): Promise<{ status: FullResult['status'] } | void> {
    const skipped = (this.suite?.allTests() ?? [])
      .filter((test) => test.outcome() === 'skipped' || test.results.some((entry) => entry.status === 'skipped'))
      .map((test) => ({
        title: test.titlePath().join(' > '),
        file: test.location.file,
        line: test.location.line,
      }));
    const outputPath = resolve(process.cwd(), '../../build/parity/playwright-skip-audit.json');
    mkdirSync(resolve(outputPath, '..'), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify({
      schemaVersion: 1,
      policy: 'Every Playwright test selected by the Phase 21 release gate is required; a skipped result fails the run.',
      skipped,
    }, null, 2)}\n`);
    if (skipped.length > 0) return { status: 'failed' };
    if (result.status === 'passed') return;
    return { status: result.status };
  }
}
