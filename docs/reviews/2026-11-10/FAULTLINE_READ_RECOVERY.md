# FaultlineLab read recovery, 2026-11-10

Base: `ed1ab8dcf75db4ce0832006ca19b6ff0b3d4b3ea`. Isolated branch
`codex/faultline-read-recovery-nov10`. Frozen source is untouched.

## Customer outcome

A trainer or investigator can distinguish unavailable analytics, team members,
challenge attachments and investigation attachments from genuinely empty data,
then retry only the failed read without repeating an upload or assignment.
Successful independent workspace content remains usable.

Each panel has loading, success, unavailable and retry states. A transient failed
refresh labels retained last-known data; 401/403 hides cached protected values.
Empty attachment/member copy appears only after successful reads. Assignment
submission remains disabled and handler-guarded until members are available.
No server authority, entitlements, schema, providers or network policy changed.

The workspace remounts on actor, tenant, route/record or capability changes.
Panel request generations and unmount disposal fence late success and failure.
Draft/session opens also fence late detail responses. Reset invalidates pending
reads and their retry targets. The default route formatter is stable so direct
component rendering cannot repeatedly restart detail effects.

An independent review identified a post-upload race before acceptance. Uploads
now capture the draft/session generation, recheck it after file reading before
POST, after POST before attachment GET, and before notice/error/busy updates.
Fresh/imported/retired drafts and new sessions invalidate those generations.
This does not cancel an already submitted upload or claim it failed; it only
prevents an old operation from changing a newer workspace. No automatic POST retry
is introduced. Other module mutation lifetimes were not comprehensively rewritten.

## Fresh verification

The external task folder `evidence/secondary-module-audit-nov10` retains the
runner, sanitized environment, exact argument arrays, logs and receipts.
Existing installed assets from the frozen candidate were reused. No install,
provider credentials, database, application runtime or network request was needed.
Node network/listen calls are blocked for browser checks; Chromium uses a closed
loopback proxy and all browser requests are fulfilled or aborted by the fixture.

Commands from the isolated checkout:

- `node ../evidence/secondary-module-audit-nov10/check.cjs browser`: **20 passed,
  zero failed/skipped**, Chromium synthetic actual workspace/panel components.
  Includes analytics/member failures and recovery, both attachment panels,
  stale success/error after actor/tenant/route changes, competing reads, reset,
  denied-cache hiding, retained stale values, keyboard-visible retry and 390/1440
  overflow checks. Actual upload resolve/reject after fresh-draft dismissal
  cannot replace its attachment loader, display a stale notice or trigger another GET.
- `node ../evidence/secondary-module-audit-nov10/check.cjs baseline`: **four expected
  failures**, zero passes, same error assertions using the actual frozen workspace.
  All four fail because the unavailable alert is absent, not because the app cannot load.
- `node ../evidence/secondary-module-audit-nov10/check.cjs types`: complete web
  source plus new browser test strict TypeScript, exit 0.
- `node ../evidence/secondary-module-audit-nov10/check.cjs lint`: the two changed
  production files and new test, zero warnings, exit 0.

Earlier retained attempts: source extraction first failed on unerased TS types;
initial attachment component tests exposed the unstable default route callback;
first lint wrapper used a package-private CLI subpath. These were corrected;
initial/final logs remain distinct. None is silently converted to a pass.

## Rendered evidence and limits

`faultline-error-390.png` and `faultline-error-1440.png` were captured from actual
components using synthetic data and component CSS; both images were inspected.
The unavailable message, personal report and focused Retry are readable without
horizontal overflow, stacked on mobile and side by side on desktop. The fixture
uses a plain document, not the full authenticated application chrome/global theme;
its white surrounding canvas and pale route-toolbar styling are not a full-product
visual acceptance. No cross-browser, screenreader or actual device claim follows.

Implementation locally verified; deployment unverified. Full combined production
build is owned by the integration worker. PostgreSQL, signed sessions, real
provider/storage/scanning, target deployment, operational recovery and accessibility
acceptance remain separate gates. No publication, migration or parity-state promotion.
Rollback is the isolated source commit revert; no data rollback is required.
