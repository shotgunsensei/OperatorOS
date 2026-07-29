import type { TradeFlowKitLineItem } from '../schema.js';

export class TradeFlowKitRevenueValidationError extends Error {
  constructor(public code: string, public field?: string) { super(code); }
}

function object(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TradeFlowKitRevenueValidationError('BODY_INVALID');
  }
  return raw as Record<string, unknown>;
}

function text(value: unknown, field: string, max: number, required = false): string | null {
  if (value === undefined || value === null) {
    if (required) throw new TradeFlowKitRevenueValidationError('FIELD_REQUIRED', field);
    return null;
  }
  if (typeof value !== 'string') throw new TradeFlowKitRevenueValidationError('FIELD_INVALID', field);
  const normalized = value.trim();
  if (required && !normalized) throw new TradeFlowKitRevenueValidationError('FIELD_REQUIRED', field);
  if (normalized.length > max) throw new TradeFlowKitRevenueValidationError('FIELD_TOO_LONG', field);
  return normalized || null;
}

function date(value: unknown, field: string): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new TradeFlowKitRevenueValidationError('DATE_INVALID', field);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new TradeFlowKitRevenueValidationError('DATE_INVALID', field);
  return parsed;
}

function version(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new TradeFlowKitRevenueValidationError('EXPECTED_VERSION_REQUIRED', 'expectedVersion');
  }
  return value as number;
}

export function parseCustomerCreate(raw: unknown) {
  const body = object(raw);
  const email = text(body.email, 'email', 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new TradeFlowKitRevenueValidationError('EMAIL_INVALID', 'email');
  }
  return {
    name: text(body.name, 'name', 160, true)!,
    phone: text(body.phone, 'phone', 40),
    email,
    address: text(body.address, 'address', 500),
    notes: text(body.notes, 'notes', 4_000),
  };
}

export type TradeFlowKitCustomerInput = ReturnType<typeof parseCustomerCreate>;

export function parseCustomerUpdate(raw: unknown) {
  const body = object(raw);
  return {
    ...parseCustomerCreate(body),
    expectedVersion: version(body.expectedVersion),
  };
}

export function parseCustomerImport(raw: unknown) {
  const body = object(raw);
  if (!Array.isArray(body.customers) || body.customers.length < 1 || body.customers.length > 100) {
    throw new TradeFlowKitRevenueValidationError('CUSTOMER_IMPORT_ROWS_INVALID', 'customers');
  }
  const customers: Array<TradeFlowKitCustomerInput & { row: number }> = [];
  const errors: Array<{ row: number; code: string; field?: string }> = [];
  body.customers.forEach((entry, index) => {
    const row = index + 2;
    try {
      customers.push({ ...parseCustomerCreate(entry), row });
    } catch (error) {
      if (!(error instanceof TradeFlowKitRevenueValidationError)) throw error;
      errors.push({ row, code: error.code, ...(error.field ? { field: error.field } : {}) });
    }
  });
  return { customers, errors, totalRows: body.customers.length };
}

export function parseJobCreate(raw: unknown) {
  const body = object(raw);
  const priority = body.priority ?? 'normal';
  if (!['low', 'normal', 'urgent'].includes(String(priority))) {
    throw new TradeFlowKitRevenueValidationError('PRIORITY_INVALID', 'priority');
  }
  return {
    customerId: text(body.customerId, 'customerId', 36, true)!,
    title: text(body.title, 'title', 200, true)!,
    description: text(body.description, 'description', 4_000),
    priority: String(priority),
    scheduledStart: date(body.scheduledStart, 'scheduledStart'),
    scheduledEnd: date(body.scheduledEnd, 'scheduledEnd'),
  };
}

const JOB_STATUSES = ['lead', 'quoted', 'scheduled', 'in_progress', 'done', 'invoiced', 'paid', 'canceled'] as const;

export function parseJobImport(raw: unknown) {
  const body = object(raw);
  if (!Array.isArray(body.jobs) || body.jobs.length < 1 || body.jobs.length > 100) {
    throw new TradeFlowKitRevenueValidationError('JOB_IMPORT_ROWS_INVALID', 'jobs');
  }
  const jobs: Array<{
    row: number;
    customerName: string;
    title: string;
    description: string | null;
    status: typeof JOB_STATUSES[number];
    priority: string;
    scheduledStart: Date | null;
    scheduledEnd: Date | null;
    internalNotes: string | null;
  }> = [];
  const errors: Array<{ row: number; code: string; field?: string }> = [];
  body.jobs.forEach((entry, index) => {
    const row = index + 2;
    try {
      const value = object(entry);
      const status = text(value.status, 'status', 30) ?? 'lead';
      if (!JOB_STATUSES.includes(status as typeof JOB_STATUSES[number])) {
        throw new TradeFlowKitRevenueValidationError('STATUS_INVALID', 'status');
      }
      const priority = text(value.priority, 'priority', 20) ?? 'normal';
      if (!['low', 'normal', 'high', 'urgent'].includes(priority)) {
        throw new TradeFlowKitRevenueValidationError('PRIORITY_INVALID', 'priority');
      }
      const scheduledStart = date(value.scheduledStart, 'scheduledStart');
      const scheduledEnd = date(value.scheduledEnd, 'scheduledEnd');
      if (scheduledStart && scheduledEnd && scheduledEnd <= scheduledStart) {
        throw new TradeFlowKitRevenueValidationError('SCHEDULE_INVALID', 'scheduledEnd');
      }
      jobs.push({
        row,
        customerName: text(value.customerName, 'customerName', 160, true)!,
        title: text(value.title, 'title', 200, true)!,
        description: text(value.description, 'description', 4_000),
        status: status as typeof JOB_STATUSES[number],
        priority,
        scheduledStart,
        scheduledEnd,
        internalNotes: text(value.internalNotes, 'internalNotes', 4_000),
      });
    } catch (error) {
      if (!(error instanceof TradeFlowKitRevenueValidationError)) throw error;
      errors.push({ row, code: error.code, ...(error.field ? { field: error.field } : {}) });
    }
  });
  return { jobs, errors, totalRows: body.jobs.length };
}

export function parseJobBulkStatus(raw: unknown) {
  const body = object(raw);
  const status = text(body.status, 'status', 30, true)!;
  if (!JOB_STATUSES.includes(status as typeof JOB_STATUSES[number])) {
    throw new TradeFlowKitRevenueValidationError('STATUS_INVALID', 'status');
  }
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) {
    throw new TradeFlowKitRevenueValidationError('BULK_ITEMS_INVALID', 'items');
  }
  const seen = new Set<string>();
  const items = body.items.map((entry, index) => {
    const item = object(entry);
    const id = text(item.id, `items.${index}.id`, 36, true)!;
    if (seen.has(id)) throw new TradeFlowKitRevenueValidationError('BULK_ITEM_DUPLICATE', `items.${index}.id`);
    seen.add(id);
    return { id, expectedVersion: version(item.expectedVersion) };
  });
  return { items, status: status as typeof JOB_STATUSES[number] };
}

export function parseLineItems(raw: unknown): TradeFlowKitLineItem[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 50) {
    throw new TradeFlowKitRevenueValidationError('LINE_ITEMS_INVALID', 'lineItems');
  }
  return raw.map((entry, index) => {
    const row = object(entry);
    const quantity = row.quantity;
    const unitPriceCents = row.unitPriceCents;
    if (!Number.isInteger(quantity) || (quantity as number) < 1 || (quantity as number) > 10_000) {
      throw new TradeFlowKitRevenueValidationError('QUANTITY_INVALID', `lineItems.${index}.quantity`);
    }
    if (!Number.isInteger(unitPriceCents) || (unitPriceCents as number) < 0 || (unitPriceCents as number) > 100_000_000) {
      throw new TradeFlowKitRevenueValidationError('UNIT_PRICE_INVALID', `lineItems.${index}.unitPriceCents`);
    }
    return {
      description: text(row.description, `lineItems.${index}.description`, 500, true)!,
      quantity: quantity as number,
      unitPriceCents: unitPriceCents as number,
    };
  });
}

export function calculateDocumentTotals(
  lineItems: TradeFlowKitLineItem[], taxRateBps: number, discountCents: number,
) {
  const subtotalCents = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents > 1_000_000_000) {
    throw new TradeFlowKitRevenueValidationError('DOCUMENT_TOTAL_INVALID', 'lineItems');
  }
  const taxCents = Math.round(subtotalCents * taxRateBps / 10_000);
  if (discountCents > subtotalCents + taxCents) {
    throw new TradeFlowKitRevenueValidationError('DISCOUNT_INVALID', 'discountCents');
  }
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents - discountCents };
}

export function parseQuoteCreate(raw: unknown) {
  const body = object(raw);
  const lineItems = parseLineItems(body.lineItems);
  const taxRateBps = body.taxRateBps ?? 0;
  const discountCents = body.discountCents ?? 0;
  if (!Number.isInteger(taxRateBps) || (taxRateBps as number) < 0 || (taxRateBps as number) > 10_000) {
    throw new TradeFlowKitRevenueValidationError('TAX_RATE_INVALID', 'taxRateBps');
  }
  if (!Number.isInteger(discountCents) || (discountCents as number) < 0 || (discountCents as number) > 1_000_000_000) {
    throw new TradeFlowKitRevenueValidationError('DISCOUNT_INVALID', 'discountCents');
  }
  return {
    customerId: text(body.customerId, 'customerId', 36, true)!,
    jobId: text(body.jobId, 'jobId', 36),
    lineItems,
    taxRateBps: taxRateBps as number,
    discountCents: discountCents as number,
    notes: text(body.notes, 'notes', 4_000),
    expiresAt: date(body.expiresAt, 'expiresAt'),
    ...calculateDocumentTotals(lineItems, taxRateBps as number, discountCents as number),
  };
}

export function parseQuoteUpdate(raw: unknown) {
  const body = object(raw);
  return {
    ...parseQuoteCreate(body),
    expectedVersion: version(body.expectedVersion),
  };
}

export function parseInvoiceCreate(raw: unknown) {
  const body = object(raw);
  const document = parseQuoteCreate(body);
  return {
    ...document,
    dueDate: date(body.dueDate, 'dueDate'),
  };
}

export function parseInvoiceUpdate(raw: unknown) {
  const body = object(raw);
  return {
    ...parseInvoiceCreate(body),
    expectedVersion: version(body.expectedVersion),
  };
}

const INVOICE_IMPORT_STATUSES = ['draft', 'sent', 'paid', 'void'] as const;

export function parseInvoiceImport(raw: unknown) {
  const body = object(raw);
  if (!Array.isArray(body.invoices) || body.invoices.length < 1 || body.invoices.length > 100) {
    throw new TradeFlowKitRevenueValidationError('INVOICE_IMPORT_ROWS_INVALID', 'invoices');
  }
  const invoices: Array<{
    row: number;
    invoiceRef: string | null;
    customerName: string;
    status: typeof INVOICE_IMPORT_STATUSES[number];
    dueDate: Date | null;
    taxRateBps: number;
    discountCents: number;
    notes: string | null;
    itemDescription: string;
    itemQuantity: number;
    itemUnitPriceCents: number;
  }> = [];
  const errors: Array<{ row: number; code: string; field?: string }> = [];
  body.invoices.forEach((entry, index) => {
    const row = index + 2;
    try {
      const value = object(entry);
      const status = text(value.status, 'status', 30) ?? 'draft';
      if (!INVOICE_IMPORT_STATUSES.includes(status as typeof INVOICE_IMPORT_STATUSES[number])) {
        throw new TradeFlowKitRevenueValidationError('STATUS_INVALID', 'status');
      }
      const taxRateBps = value.taxRateBps ?? 0;
      const discountCents = value.discountCents ?? 0;
      const itemQuantity = value.itemQuantity ?? 1;
      const itemUnitPriceCents = value.itemUnitPriceCents;
      if (!Number.isInteger(taxRateBps) || (taxRateBps as number) < 0 || (taxRateBps as number) > 10_000) {
        throw new TradeFlowKitRevenueValidationError('TAX_RATE_INVALID', 'taxRateBps');
      }
      if (!Number.isInteger(discountCents) || (discountCents as number) < 0 || (discountCents as number) > 1_000_000_000) {
        throw new TradeFlowKitRevenueValidationError('DISCOUNT_INVALID', 'discountCents');
      }
      if (!Number.isInteger(itemQuantity) || (itemQuantity as number) < 1 || (itemQuantity as number) > 10_000) {
        throw new TradeFlowKitRevenueValidationError('QUANTITY_INVALID', 'itemQuantity');
      }
      if (!Number.isInteger(itemUnitPriceCents) || (itemUnitPriceCents as number) < 0 || (itemUnitPriceCents as number) > 100_000_000) {
        throw new TradeFlowKitRevenueValidationError('UNIT_PRICE_INVALID', 'itemUnitPriceCents');
      }
      invoices.push({
        row,
        invoiceRef: text(value.invoiceRef, 'invoiceRef', 120),
        customerName: text(value.customerName, 'customerName', 160, true)!,
        status: status as typeof INVOICE_IMPORT_STATUSES[number],
        dueDate: date(value.dueDate, 'dueDate'),
        taxRateBps: taxRateBps as number,
        discountCents: discountCents as number,
        notes: text(value.notes, 'notes', 4_000),
        itemDescription: text(value.itemDescription, 'itemDescription', 500, true)!,
        itemQuantity: itemQuantity as number,
        itemUnitPriceCents: itemUnitPriceCents as number,
      });
    } catch (error) {
      if (!(error instanceof TradeFlowKitRevenueValidationError)) throw error;
      errors.push({ row, code: error.code, ...(error.field ? { field: error.field } : {}) });
    }
  });
  return { invoices, errors, totalRows: body.invoices.length };
}

export function parseInvoiceBulkPaid(raw: unknown) {
  const body = object(raw);
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) {
    throw new TradeFlowKitRevenueValidationError('BULK_ITEMS_INVALID', 'items');
  }
  const seen = new Set<string>();
  const items = body.items.map((entry, index) => {
    const item = object(entry);
    const id = text(item.id, `items.${index}.id`, 36, true)!;
    if (seen.has(id)) throw new TradeFlowKitRevenueValidationError('BULK_ITEM_DUPLICATE', `items.${index}.id`);
    seen.add(id);
    return { id, expectedVersion: version(item.expectedVersion) };
  });
  const paymentMethod = text(body.paymentMethod, 'paymentMethod', 80) ?? 'other';
  if (!['cash', 'check', 'card_external', 'bank_transfer', 'other'].includes(paymentMethod)) {
    throw new TradeFlowKitRevenueValidationError('PAYMENT_METHOD_INVALID', 'paymentMethod');
  }
  return {
    items,
    paymentMethod,
    paymentReference: text(body.paymentReference, 'paymentReference', 200),
    paymentNotes: text(body.paymentNotes, 'paymentNotes', 2_000),
  };
}

export function parseDocumentArchive(raw: unknown) {
  const body = object(raw);
  return { expectedVersion: version(body.expectedVersion) };
}

export function parseQuoteToJob(raw: unknown) {
  const body = object(raw);
  return {
    expectedVersion: version(body.expectedVersion),
    title: text(body.title, 'title', 200),
  };
}

export function parseTransition(raw: unknown, allowed: readonly string[]) {
  const body = object(raw);
  const status = text(body.status, 'status', 30, true)!;
  if (!allowed.includes(status)) throw new TradeFlowKitRevenueValidationError('STATUS_INVALID', 'status');
  return { status, expectedVersion: version(body.expectedVersion) };
}

export function parseInvoiceFromQuote(raw: unknown) {
  const body = object(raw);
  return {
    expectedVersion: version(body.expectedVersion),
    dueDate: date(body.dueDate, 'dueDate'),
    notes: text(body.notes, 'notes', 4_000),
  };
}

export function parsePayment(raw: unknown) {
  const body = object(raw);
  const method = text(body.paymentMethod, 'paymentMethod', 80, true)!;
  if (!['cash', 'check', 'card_external', 'bank_transfer', 'other'].includes(method)) {
    throw new TradeFlowKitRevenueValidationError('PAYMENT_METHOD_INVALID', 'paymentMethod');
  }
  return {
    expectedVersion: version(body.expectedVersion),
    paymentMethod: method,
    paymentReference: text(body.paymentReference, 'paymentReference', 200),
    paymentNotes: text(body.paymentNotes, 'paymentNotes', 2_000),
  };
}
