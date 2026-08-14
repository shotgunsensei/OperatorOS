import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSnapProofExport, createSnapProofDocx, createSnapProofPdf, validateSnapProofArtifact } from '../src/lib/snapproofos-exports.js';
import { stripJpegExif } from '../src/lib/snapproofos-media.js';

const report = {
  id: 'report-1', title: 'Completed installation', status: 'approved', report_type: 'full_report',
  content: {
    generatedAt: '2026-08-12T00:00:00.000Z',
    job: { reference: 'SP-100', title: 'Install rack', siteAddress: '100 Main St', description: 'Installed and verified.' },
    customer: { name: 'Example Customer' },
    totals: { partsPriceCents: 12000, laborCents: 18000, totalCents: 30000 },
    findings: [{ id: 'f1', severity: 'medium', issue: 'Old cable', cause: 'Wear', resolution: 'Replaced', recommendation: 'Inspect yearly' }],
    parts: [{ id: 'p1', name: 'Cable', quantity: 2, unitPriceCents: 6000, totalPriceCents: 12000 }],
    labor: [{ id: 'l1', description: 'Installation', hours: 2, rateCents: 9000, totalCents: 18000 }],
    notes: [{ id: 'n1', noteType: 'customer_facing', body: 'Customer accepted work.' }], evidence: [{ id: 'e1' }],
  },
};

test('Phase 32 creates standards-shaped deterministic PDF and DOCX exports with real report data', () => {
  const pdf = buildSnapProofExport(report, 'pdf');
  const docx = buildSnapProofExport(report, 'docx');
  assert.equal(validateSnapProofArtifact('pdf', pdf.content), true);
  assert.equal(validateSnapProofArtifact('docx', docx.content), true);
  assert.equal(pdf.content.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.ok(pdf.content.includes(Buffer.from('Example Customer')));
  assert.ok(docx.content.includes(Buffer.from('word/document.xml')));
  assert.ok(docx.content.includes(Buffer.from('Example Customer')));
  assert.equal(createSnapProofPdf(['same']).equals(createSnapProofPdf(['same'])), true);
  assert.equal(createSnapProofDocx(['same']).equals(createSnapProofDocx(['same'])), true);
  assert.match(pdf.sha256, /^[0-9a-f]{64}$/);
  assert.match(docx.sha256, /^[0-9a-f]{64}$/);
});

test('Phase 32 strips JPEG APP1 EXIF before storage while preserving image segments', () => {
  const exif = Buffer.from([0xff,0xd8,0xff,0xe1,0x00,0x0a,0x45,0x78,0x69,0x66,0x00,0x00,0x01,0x02,0xff,0xda,0x00,0x02,0x11,0x22,0xff,0xd9]);
  const scrubbed = stripJpegExif(exif);
  assert.equal(scrubbed.stripped, true);
  assert.equal(scrubbed.content.includes(Buffer.from('Exif')), false);
  assert.equal(scrubbed.content[0], 0xff);
  assert.equal(scrubbed.content[1], 0xd8);
  assert.match(scrubbed.sourceSha256, /^[0-9a-f]{64}$/);
  const pdf = Buffer.from('%PDF-1.4\n');
  assert.equal(stripJpegExif(pdf).content.equals(pdf), true);
});
