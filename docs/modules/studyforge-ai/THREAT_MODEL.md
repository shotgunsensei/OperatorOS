# StudyForge AI Phase 11C threat model

| Threat | Control |
| --- | --- |
| Browser tenant/user/role override | Parsers reject unknown authority fields; trusted OperatorOS session scopes every query |
| Cross-tenant object reference | Composite tenant foreign keys and tenant predicates on sources, decks, cards, quizzes, questions, plans and progress |
| UI-only authoring control | Server module write guard denies viewers; attempts/reviews require entitled membership |
| Fabricated source attribution | Provider output must use an exact source substring; source ID and content hash are persisted; URLs/authors/publications are not accepted |
| Uploaded-content disclosure | Shared private attachment object binding, tenant/module authorization, signature/MIME checks, scanning and no public URL |
| Malicious or unsupported document | Generation reads only clean text/plain, CSV or JSON bytes through the authorized content adapter |
| Prompt injection in source | Fixed system instruction constrains output shape; provider output is parsed, bounded and exact-excerpt verified |
| Provider key leakage | Only the server-side shared adapter reads `OPENAI_API_KEY`; requests, responses and keys are not placed in URLs |
| Generation replay/double billing | Shared request-hash idempotency plus unique generation and usage keys |
| Usage-limit race | Append-only usage events and generation idempotency prevent repeat charge; the bounded monthly query fails closed at the limit |
| Correct-answer disclosure | Authoring-capable users receive the answer key only while reviewing draft/review content; viewer and published-attempt projections omit `correct_index`, and grading occurs on the server |
| Unreviewed AI content presented as approved | Generated deck/quiz/plan begins in `draft`; server lifecycle requires review before publish |
| Cross-user progress leakage | Attempts and card progress filter both trusted tenant and current user |
| Fake analytics | Dashboard aggregates only persisted attempts, plan completions and card review schedules |
| Secret/sensitive logging | Route logs contain request correlation and identifiers, not source bodies, attachment bytes, AI responses or credentials |
| Child authority revival | Snapshot auth, sessions, Stripe and admin routes remain quarantined and outside the workspace |
