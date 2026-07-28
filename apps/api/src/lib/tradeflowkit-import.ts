import { createHash } from 'node:crypto';

type JsonRecord = Record<string, unknown>;

export interface TradeFlowKitStandaloneExport {
  exportVersion?: number;
  exportedAt?: string;
  sourceCommit?: string;
  orgs?: JsonRecord[];
  users?: JsonRecord[];
  memberships?: JsonRecord[];
  sessions?: JsonRecord[];
  subscriptions?: JsonRecord[];
  processedStripeEvents?: JsonRecord[];
  customers?: JsonRecord[];
  jobs?: JsonRecord[];
  jobEvents?: JsonRecord[];
  quotes?: JsonRecord[];
  quoteItems?: JsonRecord[];
  invoices?: JsonRecord[];
  invoiceItems?: JsonRecord[];
  leads?: JsonRecord[];
  leadActivities?: JsonRecord[];
  leadFollowupTasks?: JsonRecord[];
  orgAutomations?: JsonRecord[];
  reminderLog?: JsonRecord[];
}

export interface TradeFlowKitImportPlan {
  planVersion: 1;
  mode: 'dry-run';
  sourceFingerprint: string;
  sourceCounts: Record<string, number>;
  plannedTargetCounts: Record<string, number>;
  excludedAuthority: Record<string, number>;
  mappings: Array<{
    sourceTable: string;
    sourceId: string;
    targetTable: string;
    sourceFingerprint: string;
  }>;
  reconciliation: {
    quoteSubtotalCents: number;
    invoiceSubtotalCents: number;
    paidInvoiceCents: number;
    customerReferencesResolved: number;
    customerReferencesMissing: number;
    jobReferencesResolved: number;
    jobReferencesMissing: number;
  };
  warnings: string[];
  errors: string[];
  readyToApply: boolean;
}

function records(value: unknown, name: string, errors: string[]): JsonRecord[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    errors.push(`${name} must be an array`);
    return [];
  }
  return value.filter((entry, index): entry is JsonRecord => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`${name}[${index}] must be an object`);
      return false;
    }
    return true;
  });
}

function sourceId(row: JsonRecord, table: string, index: number, errors: string[]): string | null {
  const value = row.id;
  if (typeof value !== 'string' || !value.trim() || value.length > 200) {
    errors.push(`${table}[${index}].id must be a non-empty string of at most 200 characters`);
    return null;
  }
  return value;
}

function decimalToCents(value: unknown, field: string, errors: string[]): number {
  if (value === undefined || value === null || value === '') return 0;
  const normalized = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) {
    errors.push(`${field} must be a decimal with at most two fraction digits`);
    return 0;
  }
  const negative = normalized.startsWith('-');
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, fraction = ''] = unsigned.split('.');
  const absoluteCents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  const cents = negative ? -absoluteCents : absoluteCents;
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > 1_000_000_000) {
    errors.push(`${field} is outside the supported non-negative money range`);
    return 0;
  }
  return cents;
}

function quantityMilli(value: unknown, field: string, errors: string[]): number {
  const normalized = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^\d+(?:\.\d{1,3})?$/.test(normalized)) {
    errors.push(`${field} must be a positive quantity with at most three fraction digits`);
    return 0;
  }
  const [whole, fraction = ''] = normalized.split('.');
  const result = Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
  if (!Number.isSafeInteger(result) || result <= 0 || result > 10_000_000) {
    errors.push(`${field} is outside the supported quantity range`);
    return 0;
  }
  return result;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.entries(value as JsonRecord).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`).join(',')}}`;
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(stable(value)).digest('hex');
}

export function planTradeFlowKitImport(raw: unknown): TradeFlowKitImportPlan {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('TradeFlowKit export must be a JSON object');
  }
  const input = raw as TradeFlowKitStandaloneExport;
  if (input.exportVersion !== undefined && input.exportVersion !== 1) {
    errors.push(`Unsupported exportVersion ${String(input.exportVersion)}; expected 1`);
  }

  const tableNames = [
    'orgs', 'users', 'memberships', 'sessions', 'subscriptions', 'processedStripeEvents',
    'customers', 'jobs', 'jobEvents', 'quotes', 'quoteItems', 'invoices', 'invoiceItems',
    'leads', 'leadActivities', 'leadFollowupTasks', 'orgAutomations', 'reminderLog',
  ] as const;
  const tables = Object.fromEntries(tableNames.map(name => [name, records(input[name], name, errors)])) as Record<typeof tableNames[number], JsonRecord[]>;
  const sourceCounts = Object.fromEntries(tableNames.map(name => [name, tables[name].length]));
  // Export time is operational metadata, not business state. Excluding it
  // keeps repeated snapshots of unchanged source rows fingerprint-identical.
  const { exportedAt: _exportedAt, ...fingerprintedInput } = input;
  const sourceFingerprint = fingerprint(fingerprintedInput);

  const ids = new Map<string, Set<string>>();
  for (const table of tableNames) {
    const set = new Set<string>();
    tables[table].forEach((row, index) => {
      const id = sourceId(row, table, index, errors);
      if (!id) return;
      if (set.has(id)) errors.push(`${table} contains duplicate source id ${id}`);
      set.add(id);
    });
    ids.set(table, set);
  }

  const mappings: TradeFlowKitImportPlan['mappings'] = [];
  const targetBySource: Record<string, string> = {
    customers: 'tradeflowkit_customers', jobs: 'tradeflowkit_jobs', jobEvents: 'shared_activity_events',
    quotes: 'tradeflowkit_quotes', quoteItems: 'tradeflowkit_quote_items', invoices: 'tradeflowkit_invoices',
    invoiceItems: 'tradeflowkit_invoice_items', leads: 'tradeflowkit_leads',
    leadActivities: 'shared_activity_events', leadFollowupTasks: 'tradeflowkit_tasks',
    orgAutomations: 'shared_jobs', reminderLog: 'shared_activity_events',
  };
  for (const [sourceTable, targetTable] of Object.entries(targetBySource)) {
    tables[sourceTable as keyof typeof tables].forEach((row, index) => {
      const id = sourceId(row, sourceTable, index, errors);
      if (id) mappings.push({ sourceTable, sourceId: id, targetTable, sourceFingerprint: fingerprint(row) });
    });
  }

  const quoteIds = ids.get('quotes')!;
  const invoiceIds = ids.get('invoices')!;
  const customerIds = ids.get('customers')!;
  const jobIds = ids.get('jobs')!;
  let quoteSubtotalCents = 0;
  tables.quoteItems.forEach((row, index) => {
    const quoteId = typeof row.quoteId === 'string' ? row.quoteId : '';
    if (!quoteIds.has(quoteId)) errors.push(`quoteItems[${index}] references missing quote ${quoteId || '<empty>'}`);
    const qty = quantityMilli(row.qty ?? row.quantity, `quoteItems[${index}].qty`, errors);
    const unit = decimalToCents(row.unitPrice ?? row.unitPriceCents, `quoteItems[${index}].unitPrice`, errors);
    quoteSubtotalCents += Math.round(qty * unit / 1000);
  });
  let invoiceSubtotalCents = 0;
  tables.invoiceItems.forEach((row, index) => {
    const invoiceId = typeof row.invoiceId === 'string' ? row.invoiceId : '';
    if (!invoiceIds.has(invoiceId)) errors.push(`invoiceItems[${index}] references missing invoice ${invoiceId || '<empty>'}`);
    const qty = quantityMilli(row.qty ?? row.quantity, `invoiceItems[${index}].qty`, errors);
    const unit = decimalToCents(row.unitPrice ?? row.unitPriceCents, `invoiceItems[${index}].unitPrice`, errors);
    invoiceSubtotalCents += Math.round(qty * unit / 1000);
  });

  let customerReferencesResolved = 0;
  let customerReferencesMissing = 0;
  let jobReferencesResolved = 0;
  let jobReferencesMissing = 0;
  for (const [table, rows] of [['jobs', tables.jobs], ['quotes', tables.quotes], ['invoices', tables.invoices], ['leads', tables.leads]] as const) {
    rows.forEach((row, index) => {
      if (row.customerId === undefined || row.customerId === null) return;
      if (typeof row.customerId === 'string' && customerIds.has(row.customerId)) customerReferencesResolved++;
      else { customerReferencesMissing++; errors.push(`${table}[${index}] references missing customer ${String(row.customerId)}`); }
    });
  }
  for (const [table, rows] of [['quotes', tables.quotes], ['invoices', tables.invoices], ['jobEvents', tables.jobEvents], ['leads', tables.leads]] as const) {
    rows.forEach((row, index) => {
      if (row.jobId === undefined || row.jobId === null) return;
      if (typeof row.jobId === 'string' && jobIds.has(row.jobId)) jobReferencesResolved++;
      else { jobReferencesMissing++; errors.push(`${table}[${index}] references missing job ${String(row.jobId)}`); }
    });
  }

  let paidInvoiceCents = 0;
  tables.invoices.forEach((row, index) => {
    if (row.status !== 'paid') return;
    const lineItems = tables.invoiceItems.filter(item => item.invoiceId === row.id);
    const subtotal = lineItems.reduce((sum, item, itemIndex) => {
      const qty = quantityMilli(item.qty ?? item.quantity, `invoices[${index}].items[${itemIndex}].qty`, errors);
      const unit = decimalToCents(item.unitPrice ?? item.unitPriceCents, `invoices[${index}].items[${itemIndex}].unitPrice`, errors);
      return sum + Math.round(qty * unit / 1000);
    }, 0);
    const discount = decimalToCents(row.discount, `invoices[${index}].discount`, errors);
    const taxRate = Number(row.taxRate ?? 0);
    const tax = Number.isFinite(taxRate) ? Math.round(subtotal * taxRate / 100) : 0;
    paidInvoiceCents += Math.max(0, subtotal + tax - discount);
  });

  const excludedAuthority = {
    orgs: tables.orgs.length,
    users: tables.users.length,
    memberships: tables.memberships.length,
    sessions: tables.sessions.length,
    subscriptions: tables.subscriptions.length,
    processedStripeEvents: tables.processedStripeEvents.length,
  };
  if (Object.values(excludedAuthority).some(count => count > 0)) {
    warnings.push('Standalone organizations, users, memberships, sessions, subscriptions, and Stripe idempotency rows are excluded; OperatorOS remains authoritative.');
  }
  if (tables.leadFollowupTasks.length > 0) warnings.push('Standalone lead follow-up tasks are planned as TradeFlowKit tasks and require a conversion/job mapping at apply time.');
  if (tables.orgAutomations.length > 0) warnings.push('Standalone automation flags are planned for shared jobs; provider delivery remains configuration-gated.');

  const plannedTargetCounts = {
    directoryOrganizations: tables.customers.length,
    tradeflowkitCustomers: tables.customers.length,
    tradeflowkitJobs: tables.jobs.length,
    tradeflowkitQuotes: tables.quotes.length,
    tradeflowkitQuoteItems: tables.quoteItems.length,
    tradeflowkitInvoices: tables.invoices.length,
    tradeflowkitInvoiceItems: tables.invoiceItems.length,
    tradeflowkitLeads: tables.leads.length,
    tradeflowkitTasks: tables.leadFollowupTasks.length,
    sharedActivityEvents: tables.jobEvents.length + tables.leadActivities.length + tables.reminderLog.length,
    migrationRefs: mappings.length,
  };

  return {
    planVersion: 1,
    mode: 'dry-run',
    sourceFingerprint,
    sourceCounts,
    plannedTargetCounts,
    excludedAuthority,
    mappings,
    reconciliation: {
      quoteSubtotalCents,
      invoiceSubtotalCents,
      paidInvoiceCents,
      customerReferencesResolved,
      customerReferencesMissing,
      jobReferencesResolved,
      jobReferencesMissing,
    },
    warnings,
    errors: [...new Set(errors)],
    readyToApply: errors.length === 0,
  };
}
