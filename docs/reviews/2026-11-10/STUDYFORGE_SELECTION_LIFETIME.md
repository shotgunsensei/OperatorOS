# StudyForge selection lifetime, 2026-11-10

Separate local follow-on after clean Faultline commit
`88c33adc2b6faafb16764bdb9d06d650943c0852`. Original frozen source and Faultline
receipt are unchanged. Runtime scope is only `StudyForgeCompleteWorkspace.tsx`.

## Customer outcome and controls

When a learner opens set A, then set B, an old A response cannot overwrite B or
show a stale error. Library dismissal, route change, account/tenant/view/capability
change and unmount invalidate old selection reads. Existing action-triggered
selected-set refreshes are also fenced so they cannot reopen dismissed work.
Read loading and mutation busy state are distinct: dismissing a pending read does
not unlock a pending learning write. Existing successful learning actions still
refresh workspace data. No API, schema, ownership, quota, answer, progress,
idempotency, provider or generated-content contract changes.

While a new set loads, the existing selected set remains visible as before, but
an explicit live status identifies it and explains that learning actions are
disabled. A current read failure says the requested set was not opened and names
the previously selected set still on screen. Its heading and actions therefore
remain attached to the named prior record, not the failed requested record.
Library dismissal clears that selection; a direct retry opens the intended set.
This is a client consistency repair, not a claimed backend authorization bypass.

Independent peer review found no blocker in the generation guards or busy-state
separation, then re-reviewed the explicit prior-selection cue. Those reviews were
source-only, not independent provider/backend/browser acceptance.

## Fresh local verification

External evidence is in `evidence/studyforge-selection-nov10`, separate from the
original `secondary-module-audit-nov10` receipt. Runner `check.cjs` retains exact
arguments, sanitized environment, exit code, timing and full logs. It reuses the
frozen candidate's installed assets without install or downloads. Browser checks
block Node network/listen calls, use a closed loopback proxy and intercept all
browser requests. API, identity, ownership context and learning records are
explicitly synthetic; no application server, database or provider is started.

From the isolated checkout:

- `node ../evidence/studyforge-selection-nov10/check.cjs browser`: **20 passed,
  zero failed/skipped**, actual React components in Chromium. Tests wait two
  animation frames after deferred replies before asserting stale responses.
  Covers A/B success/error ordering; Library close; route, actor, tenant and
  unmount; same-deep-link actor change; current error/retry; dismissed learning
  mutation and its pending selected refresh; prior-set cue; 390/1440 overflow,
  Library focus and keyboard activation. Browsing/dismissal does not mutate data.
- `node ../evidence/studyforge-selection-nov10/check.cjs types`: complete web
  source plus new test strict TypeScript, exit 0.
- `node ../evidence/studyforge-selection-nov10/check.cjs lint`: changed runtime
  and new browser test, zero warnings, exit 0.
- Frozen-workspace negative controls and final commit/tree are recorded in the
  external final receipt and `baseline.log`; no baseline checkout was modified.

Earlier fixture attempts are retained: missing synthetic `getActiveTenantId`
export, absent browser `process.env` replacement, and initially immediate
post-settlement assertions. These are harness issues corrected before final
acceptance, not product failures or silently counted passes.

## Rendered evidence and limits

`studyforge-selection-390.png`, `studyforge-selection-1440.png`, and the two
`studyforge-stale-cue-*.png` images were inspected. Final fixtures use the actual
root brand variables/body styles, `globals.css`, component CSS and locally bundled
Inter/Open Sans font files. The selected set, Library control, wrapped mobile tabs
and explicit failed-new-set cue are readable at both widths with no horizontal
overflow. Earlier unthemed fixture images are superseded, not product defects.

These are synthetic component crops, not a complete authenticated shell, actual
screenreader/mobile-device, deployed tenant, database concurrency or live-provider
journey. Full production build belongs to the combined integration candidate.
No deployment, publication, database action or parity-state promotion. The source
commit can be reverted without a data migration.
