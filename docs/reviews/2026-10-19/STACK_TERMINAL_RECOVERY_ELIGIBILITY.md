# Preserve failed initial Checkout recovery eligibility

Separate component based on approved generation-fence commit
`77e6cebe95b71ec799909d5abb94f9725316ea2d`, tree
`27fba243a9632b2c745f95e9067a97d4534782c3`. The prior component is preserved.
No schema, dependency, provider configuration, financial policy or release
workflow changes are made.

## Confirmed source sequence

The actual pending reconciliation can quarantine an initial intent as
`checkout_failed` and bind its provider subscription without canceling that
subscription. The regression constructs this through the actual
`configuredStackPriceIds` and `selectionPriceExpectations` functions: a synthetic
configured Price differs from the stored/provider Price, so actual validation
raises `STACK_PRICE_CONFIGURATION_CHANGED` and invokes actual quarantine.
Restoring the original synthetic configuration makes the same exact
metadata/customer/attempt/cart/items valid again.

Before this change, an ordinary subscription or invoice handler observing raw
provider `unpaid` mapped it to local `past_due`. The old terminal guard only ran
for provider states carrying access, so this changed a failed initial intent
into a recovery-eligible row. A later exact provider `active` observation could
grant core/companions/seats through recovery without any initial paid Checkout
activation. All four normal callers reproduced that result in the native
baseline, with `checkout_failed → past_due → active`, an active core and five
seats. No paid Checkout event was sent in those cases.

This is a conditional source defect, not an observed live-account exploit.
Stripe documents that [unpaid subscriptions can recover](https://docs.stripe.com/billing/subscriptions/overview#subscription-statuses),
but the selected account's exact failed-payment settings, catalog history,
invoices and customer lifecycle remain unverified. No real provider action or
configuration change was used in this proof. The earlier canceled-only provider
countermodel is not required by this constructor.

## Bounded fix

Inside the existing final locked-snapshot transaction, a local row that is not
already recovery-eligible may only record another mapped terminal provider
state. Raw unpaid/incomplete/unknown states cannot normalize `checkout_failed`,
`canceled` or `expired` into `past_due`, and a later active event therefore cannot
take that initial-grant bypass. The existing deactivation/action/propagation
behavior of the terminal guard is retained, with the same trusted tenant and
shared executor. All exact binding, catalog, item, generation, signature and
receipt rules remain in place.

Existing provider canceled/incomplete_expired reporting is preserved, including
the current paused-to-canceled mapping. Already activated active, trialing,
past_due and canceling contracts still quarantine to recoverable `past_due` and
recover after exact corrected provider validation. Pending intents still require
paid/no-payment-required Checkout completion for an initial grant. The separate
owned async-failure terminal observation path remains unchanged.

The guard prevents future eligibility promotion at this boundary. It does not
reclassify any historical row already normalized to `past_due`, infer missing
activation history, cancel a provider subscription, refund a payment or choose
a customer retry/support policy. Any historical acceptance investigation or
data repair requires its own evidence and approval; none is performed here.

## Verification

- Native baseline on unchanged77 runtime:29 tests,13 expected desired-state
  failures and16 positive controls,0 skips/cancellations. Four actual constructor
  chains demonstrate the grant; nine raw-state controls demonstrate terminal
  eligibility normalization. Source/test/fixture snapshots and exact hashes are
  retained under `evidence/OperatorOS/launch-oct23/stack-terminal-baseline-*`.
- Candidate native29 plus prior79 transaction/async checks:108/108 pass. The
  shared test fixture now executes actual configured-price/selection helpers
  instead of a selection stub; only its synthetic process.env Price is changed.
- Three additional guarded SQL cases cover actual signed HTTP constructor
  chains across normal subscription/invoice callers, actually paid active/past_due
  quarantine recovery, and mapped provider terminal reporting. The full file now
  has ten guarded SQL cases. These are authored/typed but **NOT_RUN locally**:
  no permitted existing disposable PostgreSQL fixture is confirmed.

Focused checks, strict test typing, source typing, lint/build and independent
review receipts are recorded separately in the audit workspace. The combined
exact-head hosted release gate, including the ten SQL cases, remains required.
No payment/provider/production acceptance or actual Stripe delivery is claimed.
