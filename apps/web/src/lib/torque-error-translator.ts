export interface TorqueErrorPresentation {
  code: string;
  message: string;
  retryable: boolean;
  administratorAction: string;
  requestId: string | null;
  correlationId: string | null;
  noCreditsConsumed: boolean;
}

type ErrorDefinition = {
  message: string;
  retryable: boolean;
  administratorAction: string;
  noCreditsConsumed?: boolean;
};

const DEFINITIONS: Readonly<Record<string, ErrorDefinition>> = Object.freeze({
  TORQUE_ASSIST_CREDITS_REQUIRED: {
    message: 'Available Torque Assist credits are below the maximum required for this request.',
    retryable: false,
    administratorAction: 'Settle or purchase a credit pack, then submit a new request.',
    noCreditsConsumed: true,
  },
  TORQUE_ASSIST_BALANCE_EXHAUSTED: {
    message: 'Torque Assist credits are insufficient for this request.',
    retryable: false,
    administratorAction: 'Settle or purchase a credit pack, then submit a new request.',
    noCreditsConsumed: true,
  },
  TORQUE_ASSIST_RESERVATION_CONFLICT: {
    message: 'Another request currently holds this credit reservation.',
    retryable: true,
    administratorAction: 'Wait a few seconds and retry with the same request key.',
    noCreditsConsumed: true,
  },
  TORQUE_ASSIST_RATE_LIMITED: {
    message: 'Torque Assist has reached its short request limit.',
    retryable: true,
    administratorAction: 'Wait one minute and retry with the same request key.',
    noCreditsConsumed: true,
  },
  TORQUE_ASSIST_PROVIDER_DISABLED: {
    message: 'Torque Assist is unavailable until an administrator connects the approved AI provider.',
    retryable: false,
    administratorAction: 'Validate the approved AI provider configuration and enablement state.',
    noCreditsConsumed: true,
  },
  TORQUE_ASSIST_PROVIDER_CIRCUIT_OPEN: {
    message: 'Torque Assist paused provider calls after repeated provider failures.',
    retryable: true,
    administratorAction: 'Wait for the circuit cooldown, then inspect provider health using the support reference.',
    noCreditsConsumed: true,
  },
  TORQUE_ASSIST_PROVIDER_UNAVAILABLE: {
    message: 'Torque Assist could not reach an available AI provider.',
    retryable: true,
    administratorAction: 'Retry once with the same request key, then inspect provider and circuit health.',
    noCreditsConsumed: true,
  },
  TORQUE_ASSIST_PROVIDER_TIMEOUT: {
    message: 'The AI provider did not return an accepted result before the timeout.',
    retryable: true,
    administratorAction: 'Retry with the same request key; inspect provider latency if it repeats.',
    noCreditsConsumed: true,
  },
  TORQUE_ASSIST_RESPONSE_INVALID: {
    message: 'The AI response did not pass Torque Assist format or safety validation.',
    retryable: false,
    administratorAction: 'Inspect provider health and the safe response validator using the support reference.',
    noCreditsConsumed: true,
  },
  TORQUE_ASSIST_CONTEXT_INVALID: {
    message: 'This diagnostic context is outside the supported Torque Assist bounds.',
    retryable: false,
    administratorAction: 'Correct or reduce the diagnostic evidence, then submit a new request.',
    noCreditsConsumed: true,
  },
  TORQUE_ASSIST_SESSION_NOT_FOUND: {
    message: 'This diagnostic is unavailable in the active tenant or current role.',
    retryable: false,
    administratorAction: 'Return to the garage and reopen an accessible diagnostic.',
    noCreditsConsumed: true,
  },
  TORQUE_ASSIST_FORBIDDEN: {
    message: 'Your current tenant role cannot run Torque Assist for this diagnostic.',
    retryable: false,
    administratorAction: 'Ask a tenant owner to review module and diagnostic access.',
    noCreditsConsumed: true,
  },
  TORQUE_ASSIST_REQUEST_CONFLICT: {
    message: 'That request key is already bound to a different or completed operation.',
    retryable: false,
    administratorAction: 'Refresh history; use a new key only for a genuinely new request.',
    noCreditsConsumed: true,
  },
  TORQUE_ASSIST_CANCELLED: {
    message: 'The request was cancelled before an accepted result was delivered.',
    retryable: true,
    administratorAction: 'Retry with the same request key when the connection is stable.',
    noCreditsConsumed: true,
  },
  TORQUE_CREDIT_PURCHASES_DISABLED: {
    message: 'Credit purchases are temporarily unavailable. Nothing was charged.',
    retryable: false,
    administratorAction: 'Reopen the complete server-side purchase readiness gate.',
  },
  TORQUE_PAYMENT_PROVIDER_DISABLED: {
    message: 'Credit checkout is temporarily unavailable. Nothing was charged.',
    retryable: false,
    administratorAction: 'Validate the payment provider and settlement webhook configuration.',
  },
  TORQUE_PAYMENT_MODE_MISMATCH: {
    message: 'Credit checkout is blocked because its payment environment is not validated.',
    retryable: false,
    administratorAction: 'Align the configured Stripe key, mode, catalog, and webhook account.',
  },
  TORQUE_CATALOG_UNAVAILABLE: {
    message: 'The durable credit-pack catalog is unavailable. Nothing was charged.',
    retryable: false,
    administratorAction: 'Provision and validate the approved Product and Price catalog.',
  },
  TORQUE_WEBHOOK_NOT_READY: {
    message: 'Credit checkout is unavailable while signed payment confirmation is not ready.',
    retryable: false,
    administratorAction: 'Validate the canonical signed webhook endpoint and required event set.',
  },
  TORQUE_DATABASE_RELEASE_REQUIRED: {
    message: 'Credit checkout is unavailable until billing storage reaches the required release.',
    retryable: false,
    administratorAction: 'Apply the approved OperatorOS database release and verify readiness.',
  },
  TORQUE_RETURN_ROUTE_INVALID: {
    message: 'Credit checkout cannot start because its safe return route is unavailable.',
    retryable: false,
    administratorAction: 'Correct the exact TorqueShed public origin and relative return route.',
  },
  TORQUE_RELEASE_IDENTITY_MISMATCH: {
    message: 'Credit checkout is temporarily unavailable while the payment setup is being verified.',
    retryable: false,
    administratorAction: 'Verify that the application build and database release match before reopening checkout.',
  },
  TORQUE_PURCHASE_NOT_FOUND: {
    message: 'The payment reference is unavailable in this tenant.',
    retryable: false,
    administratorAction: 'Refresh from the original diagnostic and inspect the purchase reference.',
  },
  TORQUE_CHECKOUT_NOT_CREATED: {
    message: 'Checkout was not created and nothing was charged.',
    retryable: true,
    administratorAction: 'Review payment-provider readiness before starting a new attempt.',
  },
  TORQUE_CHECKOUT_BODY_INVALID: {
    message: 'Checkout accepts only the selected diagnostic and package.',
    retryable: false,
    administratorAction: 'Remove browser-supplied amount, Product, or Price fields.',
  },
  TORQUE_PURCHASE_IDEMPOTENCY_CONFLICT: {
    message: 'That purchase key is already bound to another diagnostic or package.',
    retryable: false,
    administratorAction: 'Refresh its purchase status or use a new key for a new purchase.',
  },
});

function safeIdentifier(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{4,120}$/.test(value) ? value : null;
}

export function translateTorqueShedError(error: unknown): TorqueErrorPresentation {
  const row = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const code = typeof row.code === 'string' && /^[A-Z0-9_:-]{2,120}$/.test(row.code)
    ? row.code
    : 'TORQUESHED_ACTION_FAILED';
  const status = Number(row.status ?? 0);
  const definition = DEFINITIONS[code];
  const requestId = safeIdentifier(row.requestId);
  const correlationId = safeIdentifier(row.correlationId);
  return {
    code,
    message: definition?.message
      ?? (status === 401 || status === 403 || status === 404
        ? 'TorqueShed could not access that record in the active tenant.'
        : 'TorqueShed could not confirm that action. Saved records remain available.'),
    retryable: typeof row.retryable === 'boolean'
      ? row.retryable
      : definition?.retryable ?? status >= 500,
    administratorAction: typeof row.administratorAction === 'string' && row.administratorAction.trim()
      ? row.administratorAction.trim()
      : definition?.administratorAction
        ?? 'Retry once, then inspect server logs using the support reference.',
    requestId,
    correlationId,
    noCreditsConsumed: row.charged === false || definition?.noCreditsConsumed === true,
  };
}

export function formatTorqueShedError(error: unknown): string {
  const translated = translateTorqueShedError(error);
  const reference = translated.correlationId ?? translated.requestId;
  return `${translated.message} (${translated.code}${reference ? ` · reference ${reference}` : ''})`;
}
