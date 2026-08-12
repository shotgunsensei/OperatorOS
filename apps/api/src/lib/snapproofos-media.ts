import { createHash } from 'node:crypto';

/**
 * Remove JPEG APP1 EXIF segments before private storage. Image pixels and all
 * non-EXIF segments are preserved; malformed JPEGs are left for signature and
 * scanner validation to reject.
 */
export function stripJpegExif(content: Buffer): { content: Buffer; stripped: boolean; sourceSha256: string } {
  const sourceSha256 = createHash('sha256').update(content).digest('hex');
  if (content.length < 4 || content[0] !== 0xff || content[1] !== 0xd8) return { content, stripped: false, sourceSha256 };
  const parts = [content.subarray(0, 2)];
  let offset = 2;
  let stripped = false;
  while (offset + 4 <= content.length && content[offset] === 0xff) {
    const marker = content[offset + 1]!;
    if (marker === 0xda || marker === 0xd9) { parts.push(content.subarray(offset)); offset = content.length; break; }
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { parts.push(content.subarray(offset, offset + 2)); offset += 2; continue; }
    const length = content.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > content.length) return { content, stripped: false, sourceSha256 };
    const end = offset + 2 + length;
    const isExif = marker === 0xe1 && content.subarray(offset + 4, Math.min(end, offset + 10)).toString('ascii') === 'Exif\u0000\u0000';
    if (isExif) stripped = true; else parts.push(content.subarray(offset, end));
    offset = end;
  }
  if (offset < content.length) parts.push(content.subarray(offset));
  return { content: stripped ? Buffer.concat(parts) : content, stripped, sourceSha256 };
}
