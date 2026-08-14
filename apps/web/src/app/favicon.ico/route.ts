import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Browsers (and Lighthouse) always probe `/favicon.ico` even when the
 * page declares an SVG icon, producing a noisy 404 in the console. We
 * serve the same SVG bytes back at `/favicon.ico` with the SVG mime so
 * the request resolves with a 200 and the icon still renders. This is
 * cheaper than committing a binary .ico while we don't have a
 * dedicated bitmap asset.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-static';

export async function GET() {
  try {
    const svg = await fs.readFile(path.join(process.cwd(), 'public', 'favicon.svg'));
    return new NextResponse(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
