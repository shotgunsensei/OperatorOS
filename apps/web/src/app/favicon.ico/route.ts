import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Browsers (and Lighthouse) always probe `/favicon.ico` even when the
 * page declares an SVG icon, producing a noisy 404 in the console. We
 * serve the official text-free OperatorOS emblem at `/favicon.ico`. Modern
 * browsers accept PNG bytes at the legacy route when the MIME type is exact.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-static';

export async function GET() {
  try {
    const mark = await fs.readFile(path.join(process.cwd(), 'public', 'brand', 'operatoros-mark.png'));
    return new NextResponse(mark, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
