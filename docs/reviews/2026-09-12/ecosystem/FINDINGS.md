# Ecosystem release review — findings

Review date: 2026-09-12. Source baseline: `fe7f1711428e10daefc9b56d15b8e6a73289dadc`. This is a review and implementation backlog, not a statement that every source line has been manually audited or that the ecosystem is production-certified. See [review scope and evidence](README.md) and [execution prompts](PHASE_PROMPTS.md).

**Priority:** P1 = resolve or explicitly gate the affected release surface; P2 = material product correctness or usability; P3 = maintenance or finishing work. **Evidence:** Reproduced = executed current-source expressions or observed browser behavior; Source-confirmed = control/data flow is directly present; Risk = consequence requires a targeted reproduction; Gate = missing acceptance evidence, not an established product defect. Source-confirmed findings still require regression tests during repair.

The four executable client probes are in [client-reproductions.json](evidence/client-reproductions.json). They deliberately demonstrate defects; their successful execution is not a passing product acceptance result. No probe called a provider, charged a customer, changed production records, or touched device storage.

## Money, retained work, and user preferences

### F01 — P1 — Cancelling payment confirmation still records payment

**Evidence: reproduced + source trace. Phase P01.** In `apps/web/src/components/module-shells/TradeFlowKitRevenueFlow.tsx`, the invoice payment button evaluates `window.prompt('Payment reference (optional)') || undefined` and always calls `payInvoice`. Cancel returns `null`, which becomes an optional empty reference. The executed production callback invoked `payInvoice` once after Cancel.

The client contract in `apps/web/src/lib/auth.ts` reaches `POST /v1/modules/tradeflowkit/invoices/:id/pay` in `apps/api/src/routes/module-shell-routes.ts`. The handler records the remaining payment, marks the invoice paid, updates the linked job and writes an audit event. This is a durable financial action, not a harmless dialog problem. The API's version/role checks do not convey the user's cancellation.

**Required outcome:** Cancel and Escape make zero requests. Confirm visibly identifies invoice, customer, outstanding amount and method. Distinguish a confirmed empty optional reference from cancellation. Prevent duplicate submission and preserve the selected invoice during errors. Add component/browser assertions for Cancel, Escape, blank confirmed reference, valid reference, read-only access and a rejected save; verify a real disposable-database payment after deliberate confirmation.

### F02 — P2 — Single-invoice payment audit reports total instead of amount collected

**Evidence: source-confirmed. Phase P01.** The same `invoices/:id/pay` handler inserts the payment with `current.balanceCents || current.totalCents`, but writes audit metadata `amountCents: current.totalCents`. A partially paid invoice with total 10,000 cents and balance 4,000 cents produces a 4,000-cent payment row and a 10,000-cent audit amount.

**Required outcome:** Derive one authoritative amount under the transaction lock and use it consistently in payment, invoice changes and audit. Preserve prior history. Test partial payment, zero balance, concurrent completion, optimistic-version conflict and replay. Do not rewrite historical financial records as part of the UI repair; document any separately approved reconciliation.

### F03 — P1 — Native offline failures remove the user's recoverable work

**Evidence: reproduced + source trace. Phase P02.** `apps/torqueshed-native/src/lib/offline-queue.ts` classifies most HTTP 4xx responses, including authentication, validation and non-idempotent conflict errors, as permanent. `queue-domain.ts:applyQueueOutcome` removes permanent failures. `flushMutationQueue` then deletes the durable file whenever the outcome is not retry. The actual queue-domain module removed the sole synthetic item for a permanent conflict.

An expired session, a changed record version or a repairable validation problem should stop automatic retry; it should not erase the only saved photo/body. The callback can display an error, but it is not a durable failed-work collection. Existing tests explicitly expect removal, so a green suite currently protects the undesirable behavior.

**Required outcome:** Retain a scoped failed item and its file, with clear failure reason, retry/edit/rebase where supported, and deliberate discard. Treat reauthentication and conflicts distinctly. Clean files only after confirmed success or user-authorized discard. Verify app restart, offline restart, same-user reconnect, scope change, denied access, 401/403/409/422/429/500, duplicate success, concurrent enqueue and partial flush. Do not replay another tenant's queue or restore revoked server access.

### F04 — P2 — Native settings and requests lack complete failure recovery

**Evidence: source-confirmed; device impact not exercised. Phase P02.** `apps/torqueshed-native/src/app/settings.tsx` has asynchronous settings and logout paths without a complete error/finally state transition. A rejected logout can leave `busy` set. `src/lib/api.ts` does not supply a bounded abort timeout; resource loading also needs delayed-response/scope-change verification.

**Required outcome:** Bounded requests, usable retry, retained drafts and a `finally` exit for busy states. Handle offline logout according to central session rules and distinguish local UI exit from server revocation. Test on actual supported iOS/Android runtimes before making native release claims; a TypeScript check or web export is insufficient.

### F08 — P2 — TorqueShed discoverability displays the opposite of a saved false setting

**Evidence: reproduced + API shape trace. Phase P03.** In `TorqueShedRestorationPanels.tsx`, the settings form names its checkbox `discoverable` but reads `settings[name] !== false`. The server returns `profileDiscoverable`. For `{profileDiscoverable:false}`, the rendered expression reads `undefined !== false`, which is true. Saving an unrelated preference can therefore submit discoverability as enabled. The expression probe reproduced the checked value. `torqueshed-web-api-routes.ts` accepts and returns the correctly named preference.

**Required outcome:** Explicit field-to-property mapping and controlled/resettable form state. Load false accurately, save another field without changing it, and re-open the form to prove round-trip fidelity. Include all notification and reduced-motion flags. Preserve conservative privacy defaults and existing server authorization; avoid silently migrating users into visibility.

## Lists, exports, routing, and working-state correctness

### F05 — P2 — SnapProof Team route does not load the team

**Evidence: reproduced + route/component trace. Phase P06.** `SnapProofFieldWorkspace.tsx` initializes `team` empty and sets `needsTeam = tab === 'jobs'`; later the `team` tab renders `<Team rows={team}>`. Opening Team directly does not request the roster. Loading Jobs beforehand may mask the bug through retained state.

**Required outcome:** Team route independently loads the authorized roster, with loading, empty, failure and retry states. Test a cold deep link, browser refresh, navigation from another section, empty and populated teams, read-only access and tenant switch. Do not infer no teammates from an unrequested or failed response.

### F06 — P2 — TorqueShed export screen stops at a status label

**Evidence: source-confirmed. Phase P03.** `TorqueShedUtilityPanel` requests JSON/CSV exports, reloads once, and renders only the first eight rows' format/date/status. There is no completed-file download action in that export list and no completion polling. Its request buttons also lack local pending/error handling around their awaits. The API selects `result_attachment_id`, so there is an intended durable artifact to finish the flow with.

**Required outcome:** Request → queued/running → ready → authorized download → readable saved content. Include failure/retry, stable replay identity, refresh/reopen recovery and history pagination. Use the protected attachment mechanism, not a public storage URL. Validate actual JSON/CSV contents against synthetic persisted garage records, not merely HTTP 200 or the presence of a button.

### F07 — P2 — TorqueShed record changes can race outstanding loads

**Evidence: source risk; delayed-response reproduction required. Phase P03.** The journal panel's asynchronous `load(id)` can run from both selection changes and effects. It sets the returned workspace without binding the response to the still-selected record. Selecting A then B and receiving A last can show A's data under B's selected context. Mutations use the selection, so this merits explicit adversarial-latency tests.

**Required outcome:** A generation/abort guard, one intentional load per transition, and context-bound mutations. Prove A→B→A with reversed responses, a failed later load and unmount. Apply the same inspection to report selection and live-bay switches; do not assume every async component has this bug.

### F09 — P2 — TechDeck queue search examines only the loaded slice

**Evidence: source-confirmed. Phase P04.** `TechDeckTicketQueue.tsx` loads the ticket list and applies text/status/assignment/priority filters locally. Its counters derive from that same list. The canonical ticket route in `module-shell-routes.ts` caps the response at 100 and supports server-side filters; the queue does not use those filters to search the full collection.

**Required outcome:** Server-filtered, paginated queue with deterministic ordering and honest totals. An older unresolved ticket must be findable when 100 newer tickets exist. Separate collection aggregates from page aggregates, preserve filter state in the route where useful, debounce text requests and prevent stale results. Do not solve by making responses unbounded.

### F10 — P2 — PulseDesk knows the total but cannot expose records beyond 100

**Evidence: source-confirmed. Phase P05.** `PulseDeskServiceDeskWorkspace.tsx` builds a query with `limit=100`, stores `pagination.total`, and supplies no page/offset controls. A team can be told more requests exist while lacking a way to reach them through that queue.

**Required outcome:** Wire supported server paging into a stable queue, retain filters and selected record, and accurately scope bulk actions to selected records. Test 0, 1, 100, 101 and several hundred items, tied timestamps, changes between pages and a bookmarked older request.

### F11 — P2 — PulseDesk saved views are created but cannot be applied

**Evidence: source-confirmed. Phase P05.** Saved views are rendered as name-only `<span>` elements in the request queue. The form can save filters, but the list offers no action to load them. This weakens a feature already offered to the user.

**Required outcome:** A saved-view button applies its supported filters/sort, visibly identifies the active view, supports updating/renaming/deleting under existing ownership rules and handles obsolete saved values. Verify persistence across restart and private/shared/viewer behavior; do not invent broader sharing permissions.

### F12 — P2 — PulseDesk search replaces the input on every query change

**Evidence: source-confirmed; exact focus behavior requires browser regression. Phase P05.** The search input updates `filters`; `query` changes trigger `loadAll`, which sets `loading=true`; the component returns a route-wide loading screen while loading. This removes the search control during typing and starts several unrelated configuration/directory requests. Overlapping responses are not bound to the current query.

**Required outcome:** Keep filters and the current results mounted, debounce search, show local loading status and update only the requested data. Test typing an entire phrase without focus loss, rapid backspacing, slow older results, filters during loading and a failed request with retry. Configuration should not refetch on every character without a concrete need.

### F13 — P2 — StudyForge keeps using a completed flashcard session

**Evidence: source-confirmed across client and API. Phase P07.** `StudyForgeCompleteWorkspace.tsx:Flashcards` retains `session` after “Finish session.” `ensureSession` returns that existing object on the next rating. The API in `studyforge-phase33-routes.ts` requires `session.completed_at IS NULL` for card review. The parent reload updates the same keyed set and does not reset the flashcard component. Finishing then continuing can therefore submit to a closed session. The timer also starts at component mount rather than the first study action.

**Required outcome:** Explicit idle/active/completed states, a completion result and a deliberate new-session path. Stop/restart timing correctly, preserve idempotent completion and prevent double-counted activity. Test rate → finish → rate again, repeated finish, reload, set change and a failed completion. Keep study minutes distinct from a passive open tab.

### F14 — P2 — StudyForge keyboard shortcuts intercept interactive controls

**Evidence: source-confirmed. Phase P07.** The global flashcard key listener excludes only input/textarea elements. Space prevents its default action and flips a card even when another button has focus. Selects, links and editable content are not excluded. Previous/next buttons have icons without accessible labels.

**Required outcome:** Scope shortcuts to the study interaction, preserve standard control activation, ignore interactive/editable targets and label navigation. Verify keyboard-only rating/completion, focus on every button, selects, screen-reader names and disabled/read-only mode. This is a specific accessibility defect; it is not a complete accessibility conformance assessment.

### F15 — P2 — FaultlineLab substitutes empty evidence for failed evidence requests

**Evidence: source-confirmed. Phase P08.** `FaultlineLabWorkspace.tsx` catches challenge/session attachment fetch failures and substitutes `{attachments:[]}`; analytics failure becomes null. A user cannot distinguish absent evidence from evidence that could not be loaded.

**Required outcome:** Preserve explicit per-section unavailable/error state, show retry and keep existing data identified as stale when appropriate. A failed evidence request must not imply that a challenge is evidence-free or ready for a decision. Test independent attachment/analytics failures without taking down the whole workspace.

### F16 — P2 — CallCommand can substitute a different call for a deep link

**Evidence: source-confirmed. Phase P09.** `CallCommandCommercialWorkspace.tsx:refresh` falls back to the first general call if the requested/current call is absent from `product.calls`. `callcommand-phase35-routes.ts` caps that workspace list at 100. The detail effect refuses to load a call not in the workspace list even though a tenant-authorized detail endpoint exists.

**Required outcome:** A requested call ID must resolve to that exact authorized call or a clear unavailable result. Never silently select a different call for a bookmarked URL. Test an older-than-100 record, deleted/unavailable ID, wrong product lane, browser back/forward and direct entry. Preserve exact lane and tenant authorization in the detail endpoint.

### F17 — P2 — CallCommand “Calls today” uses a bounded UTC slice

**Evidence: source-confirmed. Phase P09.** The commercial workspace computes “Calls today” by filtering `generalCalls` from the latest 100 using `toISOString().slice(0,10)`. This is a capped count and UTC calendar day regardless of the business's local day. Other summary collections are capped too and need label/aggregation verification.

**Required outcome:** Server-owned aggregates scoped to the correct product and explicit reporting timezone/window. Test more than 100 calls and calls around midnight/daylight-saving boundaries. Do not present a sample as the business total, and do not change billing usage calculations merely to make a UI metric agree.

## OutCall — review the complete future experience, keep it unavailable

### F18 — P1 gate defect — OutCall source gate fails on stale prose and ledger evidence

**Evidence: freshly reproduced at reviewed HEAD. Phase P10.** `node scripts/phase37-outcall-source-gate.mjs` reports `marketingCatalogDerivesCanonicalStatus=false`; `node --test scripts/phase37/outcall-source-gate.test.mjs` reports **3 tests, 1 pass, 2 failures, 0 skips**. The gate looks for an old marketing description string; the description has changed. The committed source fingerprint/ledger also differs from the current implementation. This dedicated check is not made equivalent to the root unit suite just because the latter passes.

Canonical facts remain: SDK `coming_soon`, deployment registry disabled, ecosystem registry planned, database seed relock present, live public label Coming Soon. **This review did not find that OutCall had accidentally been enabled.** The failing `failClosed` report field combines an overly literal source assertion with real controls.

**Required outcome:** Test semantic status derivation and each actual activation boundary; make innocuous copy changes pass while intentional activation changes fail. Regenerate evidence only after checks pass. Include the dedicated OutCall gate in required verification and retain all real provider/activation gates. Owner-authorized reconstruction already exists; do not reopen the historical source-permission question.

### F19 — P2 — OutCall hides records after five and cannot open older calls independently

**Evidence: source-confirmed. Phase P11.** `OutCallWorkspace.tsx:ActionList` uses `rows.slice(0,5)` without expansion/pagination. The workspace API returns bounded collections and selected-call lookup relies on those collections. An older scheduled call or profile can be invisible even though it remains stored.

**Required outcome:** Complete paginated lists and an authorized detail endpoint. Scheduled requests need a reliable upcoming list with cancellation available until the documented cutoff. Test at least six visible candidates and over 100 calls, cold links, timezone ordering and cancelled/failed states.

### F20 — P2 — OutCall scheduling silently uses the first profile

**Evidence: source-confirmed. Phase P11.** Immediate/scheduled call creation submits `workspace.profiles[0].id`; the trigger form offers profile selection, but the direct-call form does not. Profile ordering can change after edits, changing the content selected for the user without a deliberate choice.

**Required outcome:** Explicit profile choice, verified destination summary, recognizable content preview and timezone-aware schedule review. Persist a stable selected ID and handle deletion/version changes. Never use “first row” as a hidden user preference.

### F21 — P2 — OutCall phone verification has no complete recovery loop

**Evidence: source-confirmed. Phase P11.** After sending a code, `verificationStarted` exposes confirm controls but no resend/reset/change-number flow. The phone input remains editable while confirming against its current value. Expired code, typo or delayed delivery can strand the user or confirm the wrong pending input.

**Required outcome:** Bind confirmation to the pending number, masked destination, expiry, rate-aware resend, change-number reset, and clear retry feedback. Retain own-phone-only verification, server throttles and session ownership. Test delayed/expired/incorrect codes and refresh without bypassing verification or contacting an unapproved person.

### F22 — P1 future-release risk — OutCall asynchronous status and retry identity need end-to-end proof

**Evidence: source risk. Phases P11 and P19.** Call submission generates a new random idempotency key per click and reloads once. External callbacks can change a request after the UI has stopped loading. If the server accepts but the response is lost, a new click uses a different identity and may create a second request; the server's same-key deduplication cannot identify that as a retry. No live duplicate call was placed in this review.

**Required outcome:** Retain one key per user intent until its outcome is known, offer status recovery, and poll/subscribe with bounded backoff until terminal state. Reconcile cancellation versus dispatch. Prove timeout-after-acceptance, repeated callback, provider failure, delayed callback, reload and cancellation races with deterministic doubles before an approved provider sandbox run. Keep the module disabled meanwhile.

### F23 — P2 — Public OutCall copy offers access options for an unavailable add-on

**Evidence: live browser and saved screenshot. Phase P10.** The public Applications card simultaneously shows “Coming Soon,” “Available as an add-on,” and “View access options” to pricing, which does not sell OutCall. See [OutCall mobile screenshot](screenshots/07-outcall-mobile.png).

**Required outcome:** A coherent planned-product card and an informational next step. Do not add a purchase path or imply a guaranteed release date. If a waitlist is later commissioned, implement real consent and persistence rather than a cosmetic form.

### F32 — P2 — Put OutCall limitations at the actual decision point

**Evidence: source/product-design judgment. Phase P11.** Safety acknowledgment is represented by a short overview action while fuller context is elsewhere in compliance/settings. The user should understand reliability limits before verifying or requesting the call, particularly because the product is positioned for an uncomfortable situation.

**Required outcome:** Concise visible explanation alongside the acknowledgment and call review: this is a planned call to the user's own verified phone, delivery can fail, and the service is not emergency response. Link deeper documentation, store the acknowledged version under the existing model, and preserve discreet neutral content. Do not add automatic emergency dispatch, location tracking, third-party calling or safety guarantees as “polish.” This is product clarity, not legal certification.

## Public conversion, shared processing, and release evidence

### F24 — P2 — Pricing selections are lost across sign-in

**Evidence: live entry flow + source-confirmed state loss. Phase P12.** The browser selected TechDeck and an extra seat; Sign in navigated to `/login?next=/pricing%23build-stack`. `PricingSection.tsx` stores product, companion, additional modules and seats only in component state initialized to defaults. The return URL carries no draft selection. A completed authenticated checkout was not performed.

**Required outcome:** Preserve a non-authoritative stack draft across sign-in and reload, validate it against the current catalog, and show the user a final price review. Clear/expire the draft appropriately. Never persist bearer credentials or trust the draft for price, entitlement or quantity. Test anonymous selection → central sign-in → return, changed prices, unavailable module, invalid quantities and an existing subscription.

### F25 — P2 — Mobile sign-in puts the form below a full screen of marketing

**Evidence: live 390×844 viewport. Phase P12.** [Initial mobile sign-in](screenshots/05-signin-mobile.png) shows the hero and three benefit cards; the email/password form requires scrolling. [After scrolling](screenshots/06-signin-mobile-form.png) shows the form. Returning users arriving from a module or selected stack are asked to traverse sales copy before completing their task.

**Required outcome:** Put the sign-in form and recovery actions in the first useful mobile viewport, with a concise brand cue and optional supporting information. Keep desktop quality, autofill, keyboard visibility and error focus. Test 320/390/768/1440 widths and mobile keyboard, including long validation text. Do not redesign central authentication contracts to solve layout.

### F26 — P3 — Pricing loading language and selection semantics need finishing

**Evidence: browser observation + source. Phase P12.** The pricing screen temporarily displays “Price unavailable” before the catalog settles successfully. Mutually exclusive product/companion choices are presented with checkbox-like semantics. The successful final price was observed, so this is not evidence of a billing outage.

**Required outcome:** Distinguish loading from failed pricing, provide retry for real failure, reserve dimensions to reduce movement, and use radio-group semantics for single-choice sets while retaining checkboxes for independent add-ons. Test keyboard navigation and announce the recalculated total without excessive live-region chatter. Exact current prices remain server-owned.

### F27 — P1 investigation — Batch leases can expire before a queued handler starts

**Evidence: source risk; concurrency reproduction required. Phase P13.** `shared-background-jobs.ts:claimSharedJobs` leases a whole batch for a default 30 seconds. `processSharedJobBatch` executes rows sequentially, while `processSharedJob` invokes the handler before any fresh lease check/renewal. The worker requests up to 20 rows. A slow early handler can consume later rows' leases; another worker may reclaim those rows while the first still holds them locally. Completion updates are owner-fenced, but that does not itself prevent duplicate handler invocation.

**Required outcome:** Demonstrate two workers and slow handlers in disposable PostgreSQL. Choose just-in-time claims or safe lease renewal/fencing appropriate to each side effect; audit related notification/webhook processing for the same lifecycle. Use stable effect identity, bound concurrency and shutdown draining. Do not claim exactly-once provider delivery solely from a database completion predicate. If all affected handlers already deduplicate effects, retain that evidence and narrow severity rather than inventing duplicate charges.

### F28 — P3 — Large mixed-responsibility files raise the cost of safe polish

**Evidence: measured inventory. Phase P23.** Examples include `billing-service.ts` (3,367 lines), web `auth.ts` (3,130), `schema.ts` (3,067), `module-shell-routes.ts` (2,872), `platform-routes.ts` (2,758) and `callcommand-commercial-routes.ts` (2,729). Several module workspaces combine data loading, mutation state, routing and many screens in one component, with broad `Record<string, any>` contracts.

**Required outcome:** Extract typed contracts and focused stateful features when touching those areas, protected by behavior tests. Avoid a release-week rewrite. Prioritize financial boundaries, independently loadable collections and shared async-state helpers. File size alone is not a defect or proof of poor runtime performance.

### F29 — P3 — Generated investigation artifacts materially inflate repository review

**Evidence: tracked Git tree. Phase P23.** The change from the initial local commit to the reviewed production commit contains roughly 9.5 million added lines, overwhelmingly generated evidence under `output/callcommand-investigation/...`; the non-output/non-lockfile/non-doc change is far smaller. This makes ordinary diffs and checkout/review work expensive and obscures the product changes.

**Required outcome:** Retain a concise signed/checksummed evidence index and publish large generated logs/ledgers as CI artifacts under an agreed retention policy. Keep canonical small source ledgers required by tests. Do not rewrite history, remove source authority or delete evidence without a deliberate retention decision. Measure checkout and artifact sizes before choosing limits.

### F30 — P1 release gate — Broad regression and parity reports do not prove every customer journey

**Evidence: observed coverage boundaries. Phases P00 and P20–P22.** Static parity maps 7,396 capabilities across 13 modules, but those entries are not 7,396 independently exercised browser workflows. The latest prior polish report explicitly distinguishes 29 local cases, including synthetic interactions, from provider/deployed acceptance. This review found client defects while the original full API suite passed 1,450 tests. Public readiness proves process/configuration/schema health, not payment settlement, email delivery or carrier calls.

**Required outcome:** One current acceptance matrix pinned to source SHA, built artifact, schema, environment and fixture class. Exercise complete user outcomes through the same readiness-gated supervisor, then the target deployment when authorized. Include no-skips gates, roles, two tenants, data beyond page caps, failures/retries, reopen/restart, deep links, logout and real downloaded content. Preserve historical evidence but do not inherit its pass state for changed code.

### F31 — P1 release gate — Managed deep security review could not start

**Evidence: tool refusal, not a security finding. Phase P18.** The granted Daybreak-backed scan refused to start because the parent session lacks a managed filesystem permission profile. Exact error: “Deep Scan cannot safely start a read-only worker: the parent must provide a managed filesystem permission profile.” No scan ID or security coverage was produced. The scan was not replaced with an improvised claimed-equivalent audit.

**Required outcome:** Run the documented deep-security skill in an eligible managed read-only session against a pinned full ecosystem scope; validate and remediate findings through its workflow. Include shared authority, provider webhooks, tenant resources and canonical OutCall while preserving quarantine boundaries. Existing static checks and regression tests do not replace this gate. No “secure,” “zero vulnerabilities,” or security certification claim is warranted from this review.

### F33 — P2 — CallCommand setup overstates availability before acceptance

**Evidence: current source copy; not an observed outage. Phase P09.** `CallCommandSetup.tsx` says “Your business. Always answered.” while provider acceptance remains open and the product itself has failure/readiness paths. Setup also labels activation as answering before a completed real call is checked. The checklist correctly includes a final first-call confirmation; the headline should agree with that distinction.

**Required outcome:** Describe configuration, enabled answering and verified first-call completion precisely, including the provider-attention state. Keep compelling outcome copy without an unconditional availability promise. Do not treat simulation or enabled runtime configuration as proof of a successful carrier call.

### F34 — P1 gate defect — Current full API gate fails a superseded copy contract

**Evidence: freshly executed full suite at reviewed HEAD. Phase P00.** The exact-source API run completed with **1,477 tests: 1,476 passed, 1 failed, 0 cancelled/skipped/todo**. `apps/api/test/customer-experience-contract.test.ts:130` still asserts `/Start with a lead/` in `TradeFlowKitShell.tsx`, but the September 11 guided-workflow change replaced that copy. The test aborts at its first unmet assertion; later assertions within that case need rechecking during repair. See [full log](evidence/api-aggregate.log) and [execution metadata](evidence/api-execution.json).

**Required outcome:** Preserve the meaningful requirement—a plain first action and accurate authority/trust boundary—using rendered behavior/semantics and current copy ownership. Recheck all six representative journeys in that test. Do not restore obsolete prose solely to make a regex green, weaken the meaningful contract, skip the test, or claim the full API gate passed. Rerun focused then full API verification and update exact release evidence. This is a stale acceptance test, not evidence that the lead workflow is unusable.

### F35 — P2 — TradeFlowKit still positions OutCall as business missed-call recovery

**Evidence: source-confirmed and Help contract comparison. Phase P10.** `TradeFlowKitShell.tsx:200` describes turning missed calls into follow-up with OutCall, and its `/call-recovery` screen directs the user to OutCall availability. `apps/web/src/lib/help/primary-module-guides.ts` repeats that business follow-up positioning. The canonical OutCall help/implementation is instead a private assistance call to the user's own verified phone, explicitly excluding arbitrary recipients and bulk audiences. CallCommand owns reviewed business-call intake and the existing TradeFlowKit handoff.

**Required outcome:** Remove the obsolete OutCall business-recovery promise across the TradeFlowKit route, navigation, Help and any corresponding catalog/contract evidence. Either map the route to the actual permitted CallCommand-to-TradeFlowKit workflow with truthful prerequisites or provide a clear informational retirement/redirect. Preserve old deep links intentionally. Do not expand OutCall into customer calling to satisfy stale copy. Verify the public/user documentation and current route agree on which product actually performs the outcome.

## Disposition rules

All 35 IDs are assigned to phases. Some phases address several related findings; optional module enhancements have separate identifiers in the opportunity plan. Do not inflate this list with hypothetical security issues, treat every TODO/comment as a defect, or convert unmapped historical functionality into a release promise.

During implementation, reproduce each finding against the then-current HEAD first. If a later change has fixed it, record the exact regression evidence and close it without reimplementing. If a risk cannot be reproduced because existing invariants prevent it, preserve the counter-evidence and downgrade/close it. A “fixed” state requires the changed user journey to work, not just the disappearance of the quoted source pattern.
