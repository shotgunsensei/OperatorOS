import test from 'node:test';
import assert from 'node:assert/strict';
import { getCoreSuiteJourney } from '../../web/src/lib/core-suite-journey.ts';

test('workflow position follows exact record routes and ignores query contents', () => {
  for (const path of ['/quotes/quote-42?next=/payments', '/modules/tradeflowkit/quotes/quote-42', '/app/apps/tradeflowkit/quotes/quote-42#notes']) {
    const journey = getCoreSuiteJourney('tradeflowkit', path);
    assert.equal(journey?.steps[journey.activeIndex].label, 'Quote');
    assert.equal(journey?.steps[journey.activeIndex + 1].href, '/jobs');
  }
});

test('related work areas share a stage without inventing record completion', () => {
  const tech = getCoreSuiteJourney('techdeck', '/runbooks/review-1');
  assert.equal(tech?.steps[tech.activeIndex].label, 'Investigate');
  const pulse = getCoreSuiteJourney('pulsedesk', '/assignments');
  assert.equal(pulse?.steps[pulse.activeIndex].href, '/assignments');
  assert.equal(getCoreSuiteJourney('pulsedesk', '/analytics')?.activeIndex, 3);
});

test('home, configuration, and similar-looking routes do not imply a workflow stage', () => {
  for (const moduleId of ['tradeflowkit', 'techdeck', 'pulsedesk'] as const) {
    for (const path of ['/', '/dashboard', '/settings', '/quotes-archive', '/tickets-archive', '/requests-archive']) {
      assert.equal(getCoreSuiteJourney(moduleId, path), null);
    }
  }
});
