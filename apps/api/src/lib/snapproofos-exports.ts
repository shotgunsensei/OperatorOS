import { createHash } from 'node:crypto';
import { createDeterministicZip } from './techdeck-compliance-export.js';

type Row = Record<string, any>;

export interface SnapProofExportArtifact {
  content: Buffer;
  contentType: string;
  filename: string;
  sha256: string;
}

function plain(value: unknown): string {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

function money(cents: unknown): string {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

function reportLines(report: Row): string[] {
  const content = (report.content || {}) as Row;
  const job = (content.job || content.case || {}) as Row;
  const customer = (content.customer || {}) as Row;
  const totals = (content.totals || {}) as Row;
  const lines = [
    plain(report.title || 'SnapProofOS Field Report'),
    `Report type: ${plain(report.report_type || report.reportType || 'full_report')}`,
    `Status: ${plain(report.status)}`,
    `Job: ${plain(job.reference)} - ${plain(job.title)}`,
    `Customer: ${plain(customer.name || 'Not assigned')}`,
    `Location: ${plain(job.siteAddress || job.site_address || 'Not specified')}`,
    `Generated: ${plain(content.generatedAt || report.created_at || report.createdAt)}`,
    '',
    plain(job.description || ''),
    '',
    `Parts: ${money(totals.partsPriceCents)}`,
    `Labor: ${money(totals.laborCents)}`,
    `Report total: ${money(totals.totalCents)}`,
    '',
    'Findings',
  ];
  for (const finding of Array.isArray(content.findings) ? content.findings : []) {
    lines.push(
      `${plain(finding.severity || 'medium').toUpperCase()}: ${plain(finding.issue || finding.title)}`,
      `Cause: ${plain(finding.cause || finding.description)}`,
      `Resolution: ${plain(finding.resolution || 'Pending')}`,
      `Recommendation: ${plain(finding.recommendation || 'None')}`,
      '',
    );
  }
  lines.push('Parts');
  for (const part of Array.isArray(content.parts) ? content.parts : []) {
    lines.push(`${plain(part.name)} x ${plain(part.quantity)} @ ${money(part.unitPriceCents || part.unit_price_cents)} = ${money(part.totalPriceCents || part.total_price_cents)}`);
  }
  lines.push('', 'Labor');
  for (const labor of Array.isArray(content.labor) ? content.labor : []) {
    lines.push(`${plain(labor.description)} - ${plain(labor.hours)} hours @ ${money(labor.rateCents || labor.rate_cents)} = ${money(labor.totalCents || labor.total_cents)}`);
  }
  lines.push('', 'Notes');
  for (const note of Array.isArray(content.notes) ? content.notes : []) {
    if (note.customerVisible || note.customer_visible || note.noteType === 'customer_facing' || note.note_type === 'customer_facing') {
      lines.push(plain(note.body));
    }
  }
  lines.push('', `Evidence files: ${(Array.isArray(content.evidence) ? content.evidence : []).length}`);
  return lines.filter((line, index, all) => line || all[index - 1]);
}

function pdfEscape(value: string): string {
  return value.normalize('NFKD').replace(/[^\x20-\x7e]/g, '?').replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

function wrap(lines: string[], width = 88): string[] {
  const output: string[] = [];
  for (const line of lines) {
    if (!line) { output.push(''); continue; }
    let rest = line;
    while (rest.length > width) {
      let split = rest.lastIndexOf(' ', width);
      if (split < 20) split = width;
      output.push(rest.slice(0, split));
      rest = rest.slice(split).trimStart();
    }
    output.push(rest);
  }
  return output;
}

/** Small, dependency-free, standards-valid PDF writer for client field reports. */
export function createSnapProofPdf(lines: string[]): Buffer {
  const pages: string[][] = [];
  const wrapped = wrap(lines);
  for (let index = 0; index < wrapped.length; index += 48) pages.push(wrapped.slice(index, index + 48));
  if (!pages.length) pages.push(['SnapProofOS Field Report']);
  const objects: string[] = [];
  const pageObjectIds = pages.map((_, index) => 3 + index * 2);
  const fontId = 3 + pages.length * 2;
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Kids [${pageObjectIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  pages.forEach((page, index) => {
    const pageId = pageObjectIds[index]!;
    const streamId = pageId + 1;
    const body = ['BT', '/F1 10 Tf', '48 744 Td', '13 TL', ...page.map(line => `(${pdfEscape(line)}) Tj T*`), 'ET'].join('\n');
    objects[pageId - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${streamId} 0 R >>`;
    objects[streamId - 1] = `<< /Length ${Buffer.byteLength(body, 'ascii')} >>\nstream\n${body}\nendstream`;
  });
  objects[fontId - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  let document = '%PDF-1.4\n%SnapProofOS\n';
  const offsets = [0];
  objects.forEach((value, index) => {
    offsets.push(Buffer.byteLength(document, 'ascii'));
    document += `${index + 1} 0 obj\n${value}\nendobj\n`;
  });
  const xref = Buffer.byteLength(document, 'ascii');
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  document += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(document, 'ascii');
}

function xml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

/** Deterministic Office Open XML DOCX package with a real Word document part. */
export function createSnapProofDocx(lines: string[]): Buffer {
  const paragraphs = lines.map(line => `<w:p><w:r><w:t xml:space="preserve">${xml(line || ' ')}</w:t></w:r></w:p>`).join('');
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/></w:sectPr></w:body></w:document>`;
  return createDeterministicZip([
    { name: '[Content_Types].xml', content: Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>') },
    { name: '_rels/.rels', content: Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>') },
    { name: 'docProps/core.xml', content: Buffer.from('<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>SnapProofOS Field Report</dc:title><dc:creator>OperatorOS SnapProofOS</dc:creator></cp:coreProperties>') },
    { name: 'word/document.xml', content: Buffer.from(document, 'utf8') },
  ]);
}

export function buildSnapProofExport(report: Row, format: 'pdf' | 'docx'): SnapProofExportArtifact {
  const lines = reportLines(report);
  const content = format === 'pdf' ? createSnapProofPdf(lines) : createSnapProofDocx(lines);
  const extension = format;
  return {
    content,
    contentType: format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    filename: `snapproof-${plain(report.id || 'report')}.${extension}`,
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}

export function validateSnapProofArtifact(format: 'pdf' | 'docx', content: Buffer): boolean {
  if (format === 'pdf') return content.subarray(0, 5).toString('ascii') === '%PDF-' && content.includes(Buffer.from('xref')) && content.includes(Buffer.from('%%EOF'));
  return content.readUInt32LE(0) === 0x04034b50 && content.includes(Buffer.from('word/document.xml')) && content.includes(Buffer.from('[Content_Types].xml'));
}
