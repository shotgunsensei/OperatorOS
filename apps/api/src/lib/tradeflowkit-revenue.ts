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
