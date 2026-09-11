export interface PlatformAttentionInput {
  billingEvents?: { failed?: number };
  callCommandInfrastructure?: { actionRequired?: number; orphanNumbers?: number; routingDrift?: number; stripeMismatches?: number };
  warnings?: { code: string; message: string }[];
}

export function buildPlatformAttention(stats: PlatformAttentionInput, health: { db?: { ok?: boolean }; auth?: { sessionSecretConfigured?: boolean } }) {
  const items: { id: string; title: string; detail: string; destination: 'billing' | 'health' | 'audit' }[] = [];
  if (health.db?.ok === false) items.push({ id: 'database', title: 'Database needs attention', detail: 'Review the current service checks before making administrative changes.', destination: 'health' });
  if (health.auth?.sessionSecretConfigured === false) items.push({ id: 'sessions', title: 'Session configuration needs attention', detail: 'Review authentication health and the configured environment.', destination: 'health' });
  const failed = stats.billingEvents?.failed;
  if (typeof failed === 'number' && failed > 0) items.push({ id: 'billing', title: `${failed} failed billing event${failed === 1 ? '' : 's'}`, detail: 'Review the event and its failure before using the existing retry control.', destination: 'billing' });
  const infrastructure = stats.callCommandInfrastructure;
  if (infrastructure && ['actionRequired', 'orphanNumbers', 'routingDrift', 'stripeMismatches'].some(key => (infrastructure[key as keyof typeof infrastructure] ?? 0) > 0)) {
    items.push({ id: 'calls', title: 'CallCommand infrastructure needs review', detail: 'Check number provisioning, routing, and billing reconciliation details.', destination: 'health' });
  }
  for (const warning of stats.warnings ?? []) items.push({ id: warning.code, title: warning.code, detail: warning.message, destination: 'audit' });
  return items;
}
