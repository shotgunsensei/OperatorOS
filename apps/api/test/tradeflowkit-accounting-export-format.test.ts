import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQuickBooksIif,
  buildQuickBooksInvoiceCsv,
  buildXeroCustomersCsv,
  buildXeroInvoicesCsv,
  buildXeroPaymentsCsv,
  type AccountingExportData,
} from '../src/lib/tradeflowkit-accounting-exports.js';

const data: AccountingExportData = {
  invoicePrefix: 'ACME',
  currency: 'USD',
  customers: [{
    id: 'customer-1',
    name: '=2+2 Labs',
    email: 'billing@example.test',
    phone: '+1 555 0100',
    address: '10 Main\tStreet\nSuite 2',
  }],
  invoices: [{
    id: 'invoice-abcdefgh',
    number: 7,
    status: 'partial',
    customerName: '=2+2 Labs',
    customerEmail: 'billing@example.test',
    subtotalCents: 11_500,
    taxCents: 1_000,
    discountCents: 500,
    totalCents: 12_000,
    notes: '@review before import',
    createdAt: new Date('2026-08-01T12:00:00.000Z'),
    dueDate: new Date('2026-08-31T12:00:00.000Z'),
    items: [{ lineNumber: 1, description: '+Managed service', quantityMilli: 1_000, unitPriceCents: 11_500, lineTotalCents: 11_500 }],
  }],
  payments: [{
    id: 'payment-1',
    invoiceId: 'invoice-abcdefgh',
    amountCents: 4_000,
    method: 'ach',
    reference: '=unsafe-reference',
    paidAt: new Date('2026-08-04T12:00:00.000Z'),
  }],
};

test('versioned accounting formats preserve canonical money and neutralize spreadsheet formulas', () => {
  const iif = buildQuickBooksIif(data);
  assert.ok(iif.startsWith('!ACCNT\tNAME\tACCNTTYPE\r\n'));
  assert.match(iif, /TRNS\tINVOICE\t08\/01\/2026\tAccounts Receivable\t=2\+2 Labs\t120\.00\tACME-00007/);
  assert.match(iif, /SPL\tINVOICE\t08\/01\/2026\tSales Income\t=2\+2 Labs\t-110\.00/);
  assert.match(iif, /SPL\tINVOICE\t08\/01\/2026\tSales Tax Payable\t=2\+2 Labs\t-10\.00/);
  assert.match(iif, /TRNS\tPAYMENT\t08\/04\/2026\tUndeposited Funds\t=2\+2 Labs\t40\.00/);
  assert.doesNotMatch(iif, /10 Main\tStreet|Suite 2\n/);

  const customers = buildXeroCustomersCsv(data);
  assert.match(customers, /"'=2\+2 Labs"/);
  assert.match(customers, /"'\+1 555 0100"/);

  const invoices = buildXeroInvoicesCsv(data);
  assert.match(invoices, /"ACME-00007"/);
  assert.match(invoices, /"'\+Managed service","1","115\.00"/);
  assert.match(invoices, /"Invoice discount","1","-5"/);
  assert.match(invoices, /"Sales tax","1","10"/);

  const payments = buildXeroPaymentsCsv(data);
  assert.match(payments, /"ACME-00007"/);
  assert.match(payments, /"40\.00"/);
  assert.match(payments, /"'=unsafe-reference"/);

  const quickBooksCsv = buildQuickBooksInvoiceCsv(data);
  assert.match(quickBooksCsv, /"ACME-00007"/);
  assert.match(quickBooksCsv, /"120\.00","'@review before import"/);
});
