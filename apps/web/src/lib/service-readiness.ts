export interface RuntimeServiceStatus { kind: string; name: string; state: string }

export const SERVICE_SETUP = [
  { kind: 'email', title: 'Email delivery', vendor: 'Resend', purpose: 'Invitations, account email, and supported app notifications.', next: 'Ask your platform administrator to connect Resend and verify the sending address.', check: 'Confirm an approved test email arrives in the intended inbox.' },
  { kind: 'sms', title: 'Text messages', vendor: 'Twilio', purpose: 'Text notifications in workflows that support them.', next: 'Ask your platform administrator to review the Twilio number and messaging setup.', check: 'Confirm an approved test message arrives at the intended number.' },
  { kind: 'payments', title: 'Subscription payments', vendor: 'Stripe', purpose: 'OperatorOS plans and add-ons. Customer invoice payments have separate app settings.', next: 'Ask your platform administrator to complete Stripe setup and review available prices.', check: 'Complete an approved test checkout and confirm the purchased access appears.' },
  { kind: 'ai', title: 'AI assistance', vendor: 'AI service', purpose: 'Drafting and analysis in apps with AI features. Phone answering has separate setup.', next: 'Ask your platform administrator to connect the supported AI service.', check: 'Generate a draft in an enabled app and review the saved result.' },
] as const;

/** Configuration is not proof of vendor delivery, customer access, or live billing. */
export function serviceReadiness(status?: RuntimeServiceStatus) {
  if (status?.state === 'configured') return { label: 'Configured · test still needed', tone: 'configured', action: 'check' } as const;
  if (status?.state === 'test') return { label: 'Test mode · no live delivery', tone: 'test', action: 'next' } as const;
  if (status?.state === 'disabled') return { label: 'Setup needed', tone: 'disabled', action: 'next' } as const;
  return { label: 'Status unavailable', tone: 'unknown', action: 'next' } as const;
}

export function serviceStateLabel(value: string): string {
  const labels: Record<string, string> = {
    ready: 'Ready', blocked: 'Needs setup', test: 'Test only', degraded: 'Needs review',
    configured: 'Configured', disabled: 'Off', dead_letter: 'Needs attention',
    infected: 'File blocked', error: 'Needs attention', failed: 'Needs attention',
    active: 'Active', delivered: 'Sent', completed: 'Complete', clean: 'Passed',
    revoked: 'Disconnected', pending: 'Waiting', processing: 'In progress', retry: 'Trying again',
    recorded_not_delivered: 'Saved · not sent',
  };
  return Object.hasOwn(labels, value) ? labels[value] : 'Needs review';
}
