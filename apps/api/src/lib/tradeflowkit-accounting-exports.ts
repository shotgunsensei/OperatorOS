export const TRADEFLOWKIT_ACCOUNTING_EXPORT_VERSION = '1';

export type AccountingExportCustomer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
};

export type AccountingExportInvoiceItem = {
  lineNumber: number;
  description: string;
  quantityMilli: number;
  unitPriceCents: number;
  lineTotalCents: number;
};

export type AccountingExportInvoice = {
  id: string;
  number: number | null;
  status: string;
  customerName: string;
  customerEmail: string | null;
  subtotalCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  notes: string | null;
  createdAt: Date;
  dueDate: Date | null;
  items: AccountingExportInvoiceItem[];
};

export type AccountingExportPayment = {
  id: string;
  invoiceId: string;
  amountCents: number;
  method: string;
  reference: string | null;
  paidAt: Date;
};

export type AccountingExportData = {
  invoicePrefix: string;
  currency: string;
  customers: AccountingExportCustomer[];
  invoices: AccountingExportInvoice[];
  payments: AccountingExportPayment[];
};

type CsvCell = string | number | null | undefined;

function neutralizeSpreadsheetFormula(value: string): string {
  return /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: CsvCell): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const safe = typeof value === 'string' ? neutralizeSpreadsheetFormula(raw) : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

function csv(headers: string[], rows: CsvCell[][]): string {
  return `${[headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

function iifCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\t\r\n]+/g, ' ').trim().slice(0, 500);
}

function iifRow(values: Array<string | number | null | undefined>): string {
  return `${values.map(iifCell).join('\t')}\r\n`;
}

function formatIsoDate(value: Date | null): string {
  if (!value || Number.isNaN(value.getTime())) return '';
  return value.toISOString().slice(0, 10);
}

function formatMdyDate(value: Date | null): string {
  if (!value || Number.isNaN(value.getTime())) return '';
  return `${String(value.getUTCMonth() + 1).padStart(2, '0')}/${String(value.getUTCDate()).padStart(2, '0')}/${value.getUTCFullYear()}`;
}

function money(cents: number): string {
  return (cents / 100).toFixed(2);
}

function quantity(quantityMilli: number): string {
  return (quantityMilli / 1_000).toFixed(3).replace(/\.?0+$/, '');
}

export function accountingInvoiceNumber(invoice: Pick<AccountingExportInvoice, 'id' | 'number'>, prefix: string): string {
  return invoice.number
    ? `${prefix}-${String(invoice.number).padStart(5, '0')}`
    : `${prefix}-${invoice.id.slice(0, 8).toUpperCase()}`;
}

export function buildQuickBooksIif(data: AccountingExportData): string {
  let output = '';
  output += iifRow(['!ACCNT', 'NAME', 'ACCNTTYPE']);
  output += iifRow(['ACCNT', 'Accounts Receivable', 'AR']);
  output += iifRow(['ACCNT', 'Sales Income', 'INC']);
  output += iifRow(['ACCNT', 'Sales Tax Payable', 'OCLIAB']);
  output += iifRow(['ACCNT', 'Undeposited Funds', 'OCASSET']);
  output += iifRow(['ENDACCNT']);
  output += iifRow(['!CUST', 'NAME', 'BADDR1', 'EMAIL', 'PHONE']);
  for (const customer of data.customers) {
    output += iifRow(['CUST', customer.name, customer.address, customer.email, customer.phone]);
  }
  output += iifRow(['ENDCUST']);
  output += iifRow(['!TRNS', 'TRNSTYPE', 'DATE', 'ACCNT', 'NAME', 'AMOUNT', 'DOCNUM', 'MEMO']);
  output += iifRow(['!SPL', 'TRNSTYPE', 'DATE', 'ACCNT', 'NAME', 'AMOUNT', 'DOCNUM', 'MEMO']);
  output += iifRow(['!ENDTRNS']);

  for (const invoice of data.invoices) {
    const number = accountingInvoiceNumber(invoice, data.invoicePrefix);
    const date = formatMdyDate(invoice.createdAt);
    const memo = `Invoice ${number}`;
    output += iifRow(['TRNS', 'INVOICE', date, 'Accounts Receivable', invoice.customerName, money(invoice.totalCents), number, memo]);
    output += iifRow(['SPL', 'INVOICE', date, 'Sales Income', invoice.customerName, money(-(invoice.totalCents - invoice.taxCents)), number, memo]);
    if (invoice.taxCents) {
      output += iifRow(['SPL', 'INVOICE', date, 'Sales Tax Payable', invoice.customerName, money(-invoice.taxCents), number, `${memo} sales tax`]);
    }
    output += iifRow(['ENDTRNS']);
  }

  const invoiceById = new Map(data.invoices.map(invoice => [invoice.id, invoice]));
  for (const payment of data.payments) {
    const invoice = invoiceById.get(payment.invoiceId);
    if (!invoice) continue;
    const number = accountingInvoiceNumber(invoice, data.invoicePrefix);
    const memo = payment.reference || `Payment for ${number}`;
    const date = formatMdyDate(payment.paidAt);
    output += iifRow(['TRNS', 'PAYMENT', date, 'Undeposited Funds', invoice.customerName, money(payment.amountCents), number, memo]);
    output += iifRow(['SPL', 'PAYMENT', date, 'Accounts Receivable', invoice.customerName, money(-payment.amountCents), number, memo]);
    output += iifRow(['ENDTRNS']);
  }
  return output;
}

export function buildQuickBooksInvoiceCsv(data: AccountingExportData): string {
  const rows: CsvCell[][] = [];
  for (const invoice of data.invoices) {
    const number = accountingInvoiceNumber(invoice, data.invoicePrefix);
    const lines = invoice.items.length ? invoice.items : [{
      lineNumber: 1,
      description: `Invoice ${number}`,
      quantityMilli: 1_000,
      unitPriceCents: invoice.subtotalCents,
      lineTotalCents: invoice.subtotalCents,
    }];
    for (const [index, item] of lines.entries()) {
      rows.push([
        number, invoice.customerName, formatMdyDate(invoice.createdAt), formatMdyDate(invoice.dueDate), invoice.status,
        item.description, quantity(item.quantityMilli), money(item.unitPriceCents), money(item.lineTotalCents),
        index === 0 ? money(invoice.subtotalCents) : '', index === 0 ? money(invoice.taxCents) : '',
        index === 0 ? money(invoice.discountCents) : '', index === 0 ? money(invoice.totalCents) : '',
        index === 0 ? invoice.notes : '',
      ]);
    }
  }
  return csv([
    'InvoiceNo', 'Customer', 'InvoiceDate', 'DueDate', 'Status', 'ItemDescription', 'Qty', 'UnitPrice',
    'LineTotal', 'Subtotal', 'TaxAmount', 'Discount', 'Total', 'Notes',
  ], rows);
}

export function buildXeroCustomersCsv(data: Pick<AccountingExportData, 'customers'>): string {
  return csv([
    'ContactName', 'EmailAddress', 'FirstName', 'LastName', 'POAddressLine1',
    'POCity', 'PORegion', 'POPostalCode', 'POCountry', 'PhoneNumber',
  ], data.customers.map(customer => {
    const parts = customer.name.trim().split(/\s+/);
    return [customer.name, customer.email, parts[0] || customer.name, parts.slice(1).join(' '), customer.address, '', '', '', '', customer.phone];
  }));
}

export function buildXeroInvoicesCsv(data: AccountingExportData): string {
  const rows: CsvCell[][] = [];
  for (const invoice of data.invoices) {
    const number = accountingInvoiceNumber(invoice, data.invoicePrefix);
    const common: CsvCell[] = [
      invoice.customerName, invoice.customerEmail, number, formatIsoDate(invoice.createdAt), formatIsoDate(invoice.dueDate),
    ];
    const items = invoice.items.length ? invoice.items : [{
      lineNumber: 1,
      description: `Invoice ${number}`,
      quantityMilli: 1_000,
      unitPriceCents: invoice.subtotalCents,
      lineTotalCents: invoice.subtotalCents,
    }];
    for (const item of items) {
      rows.push([...common, item.description, quantity(item.quantityMilli), money(item.unitPriceCents), '200', 'NONE', data.currency]);
    }
    if (invoice.discountCents) rows.push([...common, 'Invoice discount', 1, -invoice.discountCents / 100, '200', 'NONE', data.currency]);
    if (invoice.taxCents) rows.push([...common, 'Sales tax', 1, invoice.taxCents / 100, '200', 'NONE', data.currency]);
  }
  return csv([
    'ContactName', 'EmailAddress', 'InvoiceNumber', 'InvoiceDate', 'DueDate',
    'Description', 'Quantity', 'UnitAmount', 'AccountCode', 'TaxType', 'Currency',
  ], rows);
}

export function buildXeroPaymentsCsv(data: AccountingExportData): string {
  const invoiceById = new Map(data.invoices.map(invoice => [invoice.id, invoice]));
  const rows = data.payments.flatMap(payment => {
    const invoice = invoiceById.get(payment.invoiceId);
    if (!invoice) return [];
    const number = accountingInvoiceNumber(invoice, data.invoicePrefix);
    return [[
      number, invoice.customerName, formatIsoDate(payment.paidAt), money(payment.amountCents),
      payment.reference || `Payment for ${number}`, payment.method || 'Bank Account',
    ]];
  });
  return csv(['InvoiceNumber', 'ContactName', 'Date', 'Amount', 'Reference', 'BankAccount'], rows);
}
